subscription_key = "Fj1KPt7grC6bAkNja7daZUstpP8wZTXsV6Zjr2FOxkO7wsBQ5SzQJQQJ99BCACHYHv6XJ3w3AAAAACOGL3Xg"  # Replace with your actual subscription key
import requests
import uuid
import json
import os
import tempfile
from datetime import datetime

def translate_text(text, from_lang='en', to_lang='es'):
    # Your endpoint and subscription key
    endpoint = "https://ai-aihackthonhub282549186415.cognitiveservices.azure.com/translator/text/v3.0/translate"
    subscription_key = "Fj1KPt7grC6bAkNja7daZUstpP8wZTXsV6Zjr2FOxkO7wsBQ5SzQJQQJ99BCACHYHv6XJ3w3AAAAACOGL3Xg"  # Replace with your actual subscription key
    
    # Set up the headers with subscription key
    headers = {
        'Ocp-Apim-Subscription-Key': subscription_key,
        'Content-type': 'application/json',
        'X-ClientTraceId': str(uuid.uuid4())
    }
    
    # Set up the query parameters
    params = {
        'api-version': '3.0',
        'from': from_lang,
        'to': to_lang
    }
    
    # Set up the request body
    body = [{
        'text': text
    }]
    
    # Make the API request
    try:
        response = requests.post(endpoint, headers=headers, params=params, json=body)
        response.raise_for_status()  # Raise an exception for HTTP errors
        
        # Parse the JSON response
        result = response.json()
        
        # Extract and return the translated text
        translations = result[0]['translations']
        translated_text = translations[0]['text']
        
        return {
            'original_text': text,
            'translated_text': translated_text,
            'from_language': from_lang,
            'to_language': to_lang,
            'full_response': result
        }
    
    except requests.exceptions.HTTPError as http_err:
        print(f"HTTP error occurred: {http_err}")
        return {"error": str(http_err)}
    except Exception as err:
        print(f"An error occurred: {err}")
        return {"error": str(err)}

import azure.cognitiveservices.speech as speechsdk
from datetime import datetime

def text_to_speech(text, language="en-US", voice="en-US-JennyNeural"):
    """
    Convert text to speech using Azure Text-to-Speech API via SDK
    
    Parameters:
    text (str): Text to convert to speech
    language (str): Language code (e.g., "en-US", "es-ES")
    voice (str): Voice name to use
    
    Returns:
    dict: Response containing audio file path or error
    """
    # Extract region from your endpoint
    # The endpoint is usually in the format: https://{region}.api.cognitive.microsoft.com
    # Let's extract the region
    endpoint = "https://ai-aihackthonhub282549186415.cognitiveservices.azure.com"
    # Extract region - this is a simplification, your endpoint might have a different structure
    region = endpoint.split('//')[1].split('.')[0]
    if region.startswith('ai-'):
        # If the region starts with 'ai-', it might be a custom name
        # Use a default region or extract from the full URL
        region = "eastus2"  # Replace with your actual region if you know it
    
    subscription_key = "Fj1KPt7grC6bAkNja7daZUstpP8wZTXsV6Zjr2FOxkO7wsBQ5SzQJQQJ99BCACHYHv6XJ3w3AAAAACOGL3Xg"  # Replace with your actual subscription key  # Replace with your actual subscription key
    
    # Generate output filename
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_file = f"speech_output_{timestamp}.wav"
    
    try:
        # Configure speech service
        speech_config = speechsdk.SpeechConfig(subscription=subscription_key, region=region)
        
        # Set the voice
        speech_config.speech_synthesis_voice_name = voice
        
        # Configure audio output
        audio_config = speechsdk.audio.AudioOutputConfig(filename=output_file)
        
        # Create synthesizer
        synthesizer = speechsdk.SpeechSynthesizer(speech_config=speech_config, audio_config=audio_config)
        
        # Synthesize text
        result = synthesizer.speak_text_async(text).get()
        
        # Check result
        if result.reason == speechsdk.ResultReason.SynthesizingAudioCompleted:
            return {
                "status": "success",
                "message": f"Audio saved to {output_file}",
                "file_path": output_file
            }
        elif result.reason == speechsdk.ResultReason.Canceled:
            cancellation_details = result.cancellation_details
            return {
                "error": f"Speech synthesis canceled: {cancellation_details.reason}. Error details: {cancellation_details.error_details}"
            }
        else:
            return {
                "error": f"Speech synthesis failed with result: {result.reason}"
            }
    
    except Exception as err:
        print(f"An error occurred: {err}")
        return {"error": str(err)}

def speech_to_text(audio_file_path, language="en-US"):
    """
    Convert speech to text using Azure Speech-to-Text API
    
    Parameters:
    audio_file_path (str): Path to the audio file
    language (str): Language code (e.g., "en-US", "es-ES")
    
    Returns:
    dict: Response containing transcribed text or error
    """
    # Your endpoint and subscription key
    endpoint = "https://ai-aihackthonhub282549186415.cognitiveservices.azure.com/speechtotext/transcriptions:transcribe"
    subscription_key = "Fj1KPt7grC6bAkNja7daZUstpP8wZTXsV6Zjr2FOxkO7wsBQ5SzQJQQJ99BCACHYHv6XJ3w3AAAAACOGL3Xg"  # Replace with your actual subscription key
    
    # Set up the API version
    params = {
        'api-version': '2024-11-15'
    }
    
    # Set up the headers
    headers = {
        'Ocp-Apim-Subscription-Key': subscription_key
    }
    
    # Set up the definition
    definition = {
        'language': language
    }
    
    # Prepare the files
    try:
        with open(audio_file_path, 'rb') as audio_file:
            files = {
                'audio': (os.path.basename(audio_file_path), audio_file, 'audio/wav'),
                'definition': (None, json.dumps(definition), 'application/json')
            }
            
            # Make the request
            response = requests.post(endpoint, headers=headers, params=params, files=files)
            response.raise_for_status()
            
            # Parse the response
            result = response.json()
            transcription = ""
            if 'combinedPhrases' in result and len(result['combinedPhrases']) > 0:
                # Use the combined phrases if available (better for complete sentences)
                transcription = " ".join([phrase['text'] for phrase in result['combinedPhrases']])
            elif 'phrases' in result and len(result['phrases']) > 0:
                # Fallback to individual phrases
                transcription = " ".join([phrase['text'] for phrase in result['phrases']])
            return {
                "status": "success",
                "transcription": transcription,
                "full_response": result
            }
    
    except FileNotFoundError:
        print(f"Audio file not found: {audio_file_path}")
        return {"error": f"Audio file not found: {audio_file_path}"}
    except requests.exceptions.HTTPError as http_err:
        print(f"HTTP error occurred: {http_err}")
        return {"error": str(http_err)}
    except Exception as err:
        print(f"An error occurred: {err}")
        return {"error": str(err)}

# Complete workflow function
def translate_and_speak(input_text, from_lang="en", to_lang="es", voice=None):
    """
    Translate text and convert it to speech
    
    Parameters:
    input_text (str): Text to translate and convert to speech
    from_lang (str): Source language code
    to_lang (str): Target language code
    voice (str): Voice to use (default is None, which will use a default voice for the target language)
    
    Returns:
    dict: Response containing translated text and audio file path or error
    """
    # Step 1: Translate the text
    translation_result = translate_text(input_text, from_lang, to_lang)
    
    if "error" in translation_result:
        return translation_result
    
    translated_text = translation_result["translated_text"]
    
    # Map language code to a default voice if none is provided
    voice_map = {
        "en": "en-US-JennyNeural",
        "es": "es-ES-ElviraNeural",
        "fr": "fr-FR-DeniseNeural",
        "de": "de-DE-KatjaNeural",
        "it": "it-IT-ElsaNeural",
        "ja": "ja-JP-NanamiNeural",
        "ko": "ko-KR-SunHiNeural",
        "pt": "pt-BR-FranciscaNeural",
        "ru": "ru-RU-SvetlanaNeural",
        "zh": "zh-CN-XiaoxiaoNeural"
    }
    
    # Determine the voice to use
    if voice is None:
        # Use default voice for the target language if available, otherwise use a generic one
        voice = voice_map.get(to_lang, "en-US-JennyNeural")
    
    # Step 2: Convert the translated text to speech
    tts_result = text_to_speech(translated_text, language=f"{to_lang}-{to_lang.upper()}", voice=voice)
    
    if "error" in tts_result:
        return {**translation_result, "tts_error": tts_result["error"]}
    
    # Return combined results
    return {
        **translation_result,
        "audio_file": tts_result["file_path"]
    }

# Example usage
if __name__ == "__main__":
    # Example 1: Simple translation
    text_to_translate = "Hello, world! How are you today?"
    
    print("Example 1: Translation")
    result = translate_text(text_to_translate, from_lang='en', to_lang='es')
    
    if "error" not in result:
        print(f"Original ({result['from_language']}): {result['original_text']}")
        print(f"Translation ({result['to_language']}): {result['translated_text']}")
    else:
        print(f"Translation failed: {result['error']}")
    
    # Example 2: Text-to-Speech
    print("\nExample 2: Text-to-Speech")
    tts_result = text_to_speech("This is a test of the text-to-speech API.")
    
    if "error" not in tts_result:
        print(f"TTS successful: {tts_result['message']}")
    else:
        print(f"TTS failed: {tts_result['error']}")
    
    # Example 3: Translate and speak
    print("\nExample 3: Translate and Speak")
    translate_speak_result = translate_and_speak(
        "This is a sample text that will be translated to Spanish and then converted to speech.",
        from_lang="en",
        to_lang="es"
    )
    
    if "error" not in translate_speak_result and "tts_error" not in translate_speak_result:
        print(f"Original: {translate_speak_result['original_text']}")
        print(f"Translated: {translate_speak_result['translated_text']}")
        print(f"Audio saved to: {translate_speak_result['audio_file']}")
    else:
        print(f"Process failed: {translate_speak_result.get('error') or translate_speak_result.get('tts_error')}")
    
    # Example 4: Speech-to-Text (assuming you have an audio file)
    # Uncomment and modify this code if you have an audio file to test

    print("\nExample 4: Speech-to-Text")
    audio_file_path = "/Users/amanvaibhavjha/Desktop/Sem6/MSFT_HACKATHON/speech_output_20250325_155921.wav"  # Update with your audio file path
    stt_result = speech_to_text(audio_file_path)
    
    if "error" not in stt_result:
        print(f"Transcription: {stt_result['transcription']}")
    else:
        print(f"STT failed: {stt_result['error']}")
    