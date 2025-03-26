from flask import Flask, request, jsonify
from flask_cors import CORS
import azure.cognitiveservices.speech as speechsdk
import requests
import uuid
import json
import os
import io
import base64
import time

# Azure subscription key
SUBSCRIPTION_KEY = "Fj1KPt7grC6bAkNja7daZUstpP8wZTXsV6Zjr2FOxkO7wsBQ5SzQJQQJ99BCACHYHv6XJ3w3AAAAACOGL3Xg"
REGION = "eastus2"
TRANSLATOR_ENDPOINT = "https://ai-aihackthonhub282549186415.cognitiveservices.azure.com/translator/text/v3.0/translate"

# Initialize Flask app
app = Flask(__name__)
CORS(app)  # Enable CORS to allow the extension to communicate

@app.route('/recognize', methods=['POST'])
def recognize_speech():
    """Receive audio, perform speech recognition"""
    if not request.json or 'audio_data' not in request.json:
        return jsonify({'error': 'No audio data provided'}), 400
    
    try:
        # Get parameters
        from_lang = request.json.get('from_lang', 'en-US')
        
        print(f"Starting speech recognition for language: {from_lang}")
        
        # Get and decode the audio data
        audio_data = base64.b64decode(request.json['audio_data'])
        
        # Create a push stream
        push_stream = speechsdk.audio.PushAudioInputStream()
        push_stream.write(audio_data)
        push_stream.close()
        
        # Configure speech recognition
        speech_config = speechsdk.SpeechConfig(subscription=SUBSCRIPTION_KEY, region=REGION)
        speech_config.speech_recognition_language = from_lang
        
        # Enhanced recognition settings
        speech_config.set_property(speechsdk.PropertyId.SpeechServiceConnection_InitialSilenceTimeoutMs, "5000")
        speech_config.set_property(speechsdk.PropertyId.SpeechServiceConnection_EndSilenceTimeoutMs, "1000") 
        speech_config.set_property(speechsdk.PropertyId.Speech_SegmentationSilenceTimeoutMs, "500")
        
        # Enable more detailed recognition
        speech_config.enable_audio_logging()
        speech_config.enable_dictation()
        
        audio_config = speechsdk.audio.AudioConfig(stream=push_stream)
        
        # Create speech recognizer
        speech_recognizer = speechsdk.SpeechRecognizer(speech_config=speech_config, audio_config=audio_config)
        
        # Start recognition
        result = speech_recognizer.recognize_once()
        
        # Process result
        if result.reason == speechsdk.ResultReason.RecognizedSpeech:
            text = result.text
            print(f"Recognition result: '{text}'")
            return jsonify({'text': text})
        elif result.reason == speechsdk.ResultReason.NoMatch:
            print("No speech recognized")
            return jsonify({'text': ''})
        else:
            print(f"Recognition failed: {result.reason}")
            return jsonify({'error': f'Recognition failed: {result.reason}'}), 500
    
    except Exception as e:
        print(f"Recognition exception: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/translate', methods=['POST'])
def translate_text():
    """Translate text using Azure Translator"""
    if not request.json or 'text' not in request.json:
        return jsonify({'error': 'No text provided'}), 400
    
    try:
        # Get parameters
        text = request.json['text']
        from_lang = request.json.get('from_lang', 'en')
        to_lang = request.json.get('to_lang', 'es')
        
        print(f"Translating from {from_lang} to {to_lang}: '{text[:50]}...'")
        
        # Extract base language code (e.g., 'en-US' -> 'en')
        from_lang_base = from_lang.split('-')[0]
        
        # Make translation request
        headers = {
            'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY,
            'Content-type': 'application/json',
            'Ocp-Apim-Subscription-Region': REGION
        }
        
        params = {
            'api-version': '3.0',
            'from': from_lang_base,
            'to': to_lang
        }
        
        body = [{
            'text': text
        }]
        
        response = requests.post(
            TRANSLATOR_ENDPOINT,
            headers=headers,
            params=params,
            json=body
        )
        
        response.raise_for_status()
        result = response.json()
        
        if len(result) > 0 and 'translations' in result[0]:
            translated_text = result[0]['translations'][0]['text']
            print(f"Translation result: '{translated_text[:50]}...'")
            return jsonify({'translated_text': translated_text})
        else:
            print("Translation failed: No translations in response")
            return jsonify({'error': 'Translation failed'}), 500
    
    except Exception as e:
        print(f"Translation exception: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/health', methods=['GET'])
def health_check():
    """Simple health check endpoint"""
    return jsonify({'status': 'OK', 'timestamp': time.time()})

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5015, debug=True)