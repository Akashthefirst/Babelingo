import azure.cognitiveservices.speech as speechsdk
import requests
import uuid
import json
import os
import threading
import time
from datetime import datetime
from rich.console import Console
from rich.columns import Columns
from rich.panel import Panel
from rich import box
from dotenv import load_dotenv

load_dotenv()

subscription_key = os.getenv("AZURE_API_KEY")
region = os.getenv("AZURE_REGION")  

# Rich console for better terminal display
console = Console()

def translate_text_async(text, from_lang='en', to_lang='es'):
    """Asynchronously translate text using Azure Translator service"""
    endpoint = "https://ai-aihackthonhub282549186415.cognitiveservices.azure.com/translator/text/v3.0/translate"
    
    headers = {
        'Ocp-Apim-Subscription-Key': subscription_key,
        'Content-type': 'application/json',
        'X-ClientTraceId': str(uuid.uuid4())
    }
    
    params = {
        'api-version': '3.0',
        'from': from_lang,
        'to': to_lang
    }
    
    body = [{
        'text': text
    }]
    
    try:
        response = requests.post(endpoint, headers=headers, params=params, json=body)
        response.raise_for_status()
        
        result = response.json()
        translations = result[0]['translations']
        translated_text = translations[0]['text']
        
        return translated_text
    
    except Exception as err:
        print(f"Translation error: {err}")
        return f"[Translation error: {str(err)}]"

class RealTimeTranscriptionTranslation:
    def __init__(self, from_lang="en-US", to_lang="es"):
        """Initialize the real-time transcription and translation system"""
        self.from_lang = from_lang
        self.to_lang_code = to_lang
        self.is_running = True
        self.current_transcription = ""
        self.current_translation = ""
        self.lock = threading.Lock()
        self.setup_speech_config()
        
    def setup_speech_config(self):
        """Set up the speech configuration"""
        self.speech_config = speechsdk.SpeechConfig(subscription=subscription_key, region=region)
        self.speech_config.speech_recognition_language = self.from_lang
        
        # Use default microphone as audio input
        self.audio_config = speechsdk.audio.AudioConfig(use_default_microphone=True)
        
        # Create speech recognizer with continuous recognition
        self.speech_recognizer = speechsdk.SpeechRecognizer(
            speech_config=self.speech_config, 
            audio_config=self.audio_config
        )
        
        # Set up event handlers for recognition
        self.speech_recognizer.recognized.connect(self.recognized_callback)
        self.speech_recognizer.session_stopped.connect(self.session_stopped_callback)
        self.speech_recognizer.canceled.connect(self.canceled_callback)
        
    def recognized_callback(self, evt):
        """Callback for when speech is recognized"""
        if evt.result.reason == speechsdk.ResultReason.RecognizedSpeech:
            text = evt.result.text
            
            # Skip empty results
            if not text.strip():
                return
                
            # Translate the recognized text
            translation = translate_text_async(text, 
                                             from_lang=self.from_lang.split('-')[0], 
                                             to_lang=self.to_lang_code)
            
            # Update the current transcription and translation
            with self.lock:
                self.current_transcription = text
                self.current_translation = translation
                
            # Display the results
            self.display_results()
    
    def session_stopped_callback(self, evt):
        """Callback for when session is stopped"""
        self.is_running = False
    
    def canceled_callback(self, evt):
        """Callback for when recognition is canceled"""
        if evt.reason == speechsdk.CancellationReason.Error:
            console.print(f"[bold red]Error:[/bold red] {evt.reason} ({evt.error_details})")
        self.is_running = False
    
    def display_results(self):
        """Display the transcription and translation side by side"""
        console.clear()
        console.print("[bold cyan]Real-time Audio Transcription and Translation[/bold cyan]")
        console.print("[dim]Press Ctrl+C to exit[/dim]\n")
        
        # Create panels for original and translated text
        original_panel = Panel(
            self.current_transcription, 
            title="Original", 
            title_align="left",
            box=box.ROUNDED,
            width=40
        )
        
        translated_panel = Panel(
            self.current_translation, 
            title=f"Translated ({self.to_lang_code})", 
            title_align="left",
            box=box.ROUNDED,
            width=40
        )
        
        # Display panels side by side
        columns = Columns([original_panel, translated_panel], equal=True, expand=True)
        console.print(columns)
    
    def start(self):
        """Start the continuous recognition"""
        console.print("[bold green]Starting real-time transcription and translation...[/bold green]")
        console.print("[dim]Speak into your microphone...[/dim]")
        
        # Start continuous recognition
        self.speech_recognizer.start_continuous_recognition()
        
        # Keep the program running until stopped
        try:
            while self.is_running:
                time.sleep(0.1)
        except KeyboardInterrupt:
            console.print("\n[bold yellow]Stopping transcription...[/bold yellow]")
        finally:
            # Stop recognition
            self.speech_recognizer.stop_continuous_recognition()
            console.print("[bold green]Transcription stopped.[/bold green]")

def main():
    """Main function to run the application"""
    console.print("[bold magenta]===== Real-time Audio Transcription and Translation =====[/bold magenta]")
    
    # Get language preferences
    from_lang = console.input("[bold]Enter source language (default: en-US): [/bold]") or "en-US"
    to_lang = console.input("[bold]Enter target language (default: es): [/bold]") or "es"
    
    console.print(f"\n[bold]Source language:[/bold] {from_lang}")
    console.print(f"[bold]Target language:[/bold] {to_lang}")
    console.print("\n[dim]Starting in 3 seconds...[/dim]")
    time.sleep(3)
    
    # Create and start the transcription/translation system
    transcriber = RealTimeTranscriptionTranslation(from_lang=from_lang, to_lang=to_lang)
    transcriber.start()

if __name__ == "__main__":
    main()