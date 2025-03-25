from flask import Flask, render_template, request, jsonify
import azure.cognitiveservices.speech as speechsdk
import requests
import uuid
import json
import os
import threading
import time
from datetime import datetime
from flask_socketio import SocketIO, emit
from dotenv import load_dotenv

load_dotenv()


subscription_key = os.getenv("AZURE_API_KEY")
region = os.getenv("AZURE_REGION") 

# Initialize Flask app
app = Flask(__name__)
app.config['SECRET_KEY'] = 'translation-app-secret'
socketio = SocketIO(app, cors_allowed_origins="*")

# Global variables to store transcriber instance and status
transcriber = None
is_transcribing = False

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
        self.lock = threading.Lock()
        self.setup_speech_config()
        
    def setup_speech_config(self):
        """Set up the speech configuration with improved settings"""
        self.speech_config = speechsdk.SpeechConfig(subscription=subscription_key, region=region)
        self.speech_config.speech_recognition_language = self.from_lang
        
        # Enhanced recognition settings
        self.speech_config.set_property(speechsdk.PropertyId.SpeechServiceConnection_InitialSilenceTimeoutMs, "5000")
        self.speech_config.set_property(speechsdk.PropertyId.SpeechServiceConnection_EndSilenceTimeoutMs, "1000") 
        self.speech_config.set_property(speechsdk.PropertyId.Speech_SegmentationSilenceTimeoutMs, "500")
        
        # Enable more detailed recognition
        self.speech_config.enable_audio_logging()
        self.speech_config.enable_dictation()
        
        # Set up the audio format for the push stream - CRITICAL for accuracy
        self.push_stream = speechsdk.audio.PushAudioInputStream(
            speechsdk.audio.AudioStreamFormat(
                samples_per_second=16000,     # 16 kHz sample rate
                bits_per_sample=16,           # 16-bit audio
                channels=1                    # Mono audio
            )
        )
        
        self.audio_config = speechsdk.audio.AudioConfig(stream=self.push_stream)
        
        # Create speech recognizer with continuous recognition and improved settings
        self.speech_recognizer = speechsdk.SpeechRecognizer(
            speech_config=self.speech_config, 
            audio_config=self.audio_config
        )
        
        # Set up better event handlers for recognition
        self.speech_recognizer.recognized.connect(self.recognized_callback)
        self.speech_recognizer.recognizing.connect(self.recognizing_callback)  # Add interim results
        self.speech_recognizer.session_stopped.connect(self.session_stopped_callback)
        self.speech_recognizer.canceled.connect(self.canceled_callback)
    
    def recognizing_callback(self, evt):
        """Callback for interim results (while still speaking)"""
        if evt.result.reason == speechsdk.ResultReason.RecognizingSpeech:
            text = evt.result.text
            
            # Skip empty results
            if not text.strip():
                return
            
            # Send interim results to client (without translation for speed)
            socketio.emit('interim_update', {
                'transcription': text
            })
    
    def recognized_callback(self, evt):
        """Callback for final recognition results"""
        if evt.result.reason == speechsdk.ResultReason.RecognizedSpeech:
            text = evt.result.text
            
            # Skip empty results
            if not text.strip():
                return
            
            # Translate the recognized text
            translation = translate_text_async(text, 
                                             from_lang=self.from_lang.split('-')[0], 
                                             to_lang=self.to_lang_code)
            
            # Send the results to the client
            socketio.emit('transcription_update', {
                'transcription': text,
                'translation': translation
            })
    
    def session_stopped_callback(self, evt):
        """Callback for when session is stopped"""
        self.is_running = False
        socketio.emit('transcription_status', {'status': 'stopped'})
    
    def canceled_callback(self, evt):
        """Callback for when recognition is canceled"""
        if evt.reason == speechsdk.CancellationReason.Error:
            socketio.emit('error', {'message': f"Error: {evt.reason} ({evt.error_details})"})
        self.is_running = False
        socketio.emit('transcription_status', {'status': 'stopped'})
    
    def start(self):
        """Start the continuous recognition"""
        self.speech_recognizer.start_continuous_recognition()
        socketio.emit('transcription_status', {'status': 'started'})
        
    def stop(self):
        """Stop the continuous recognition"""
        self.speech_recognizer.stop_continuous_recognition()
        self.is_running = False
        socketio.emit('transcription_status', {'status': 'stopped'})

    def process_audio(self, audio_data):
        """Process audio data received from the client with debugging"""
        try:
            # Write the audio data to the push stream
            self.push_stream.write(audio_data)
        except Exception as e:
            print(f"Error processing audio data: {e}")
            socketio.emit('error', {'message': f"Error processing audio: {str(e)}"})

@app.route('/')
def index():
    """Render the main page"""
    return render_template('index.html')

@socketio.on('connect')
def handle_connect():
    """Handle client connection"""
    print("Client connected")

@socketio.on('disconnect')
def handle_disconnect():
    """Handle client disconnection"""
    print("Client disconnected")
    global transcriber, is_transcribing
    if transcriber and is_transcribing:
        transcriber.stop()
        is_transcribing = False

@socketio.on('start_transcription')
def handle_start_transcription(data):
    """Start transcription and translation"""
    global transcriber, is_transcribing
    
    # Get language preferences from the request
    from_lang = data.get('from_lang', 'en-US')
    to_lang = data.get('to_lang', 'es')
    
    # Create a new transcriber instance
    transcriber = RealTimeTranscriptionTranslation(from_lang=from_lang, to_lang=to_lang)
    transcriber.start()
    is_transcribing = True
    
    emit('transcription_status', {'status': 'started'})

@socketio.on('stop_transcription')
def handle_stop_transcription():
    """Stop transcription and translation"""
    global transcriber, is_transcribing
    if transcriber and is_transcribing:
        transcriber.stop()
        is_transcribing = False
        emit('transcription_status', {'status': 'stopped'})

@socketio.on('audio_data')
def handle_audio_data(data):
    """Handle audio data from the client"""
    global transcriber, is_transcribing
    if transcriber and is_transcribing:
        # Convert base64 audio data to bytes and process it
        audio_bytes = data['audio_data']
        transcriber.process_audio(audio_bytes)

if __name__ == '__main__':
    # Create templates directory and index.html file
    os.makedirs('templates', exist_ok=True)
    
    with open('templates/index.html', 'w',encoding='utf-8') as f:
        f.write('''
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Real-time Transcription and Translation</title>
    <script src="https://cdn.socket.io/4.4.1/socket.io.min.js"></script>
    <style>
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600&display=swap');

:root {
    --primary-color: #4A3C30;    /* Dark espresso */
    --secondary-color: #756555;  /* Warm taupe */
    --background-color: #EDE5DC; /* Parchment background */
    --surface-color: #FDF8F3;    /* Vanilla cream */
    --border-color: #C4B6A5;     /* Weathered wood */
    --text-primary: #362A20;     /* Rich chocolate */
    --text-secondary: #5D5042;   /* Mocha brown */
    --accent-gold: #B89F7B;      /* Aged brass */
}

body {
    font-family: 'Space Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    line-height: 1.6;
    color: var(--text-primary);
    margin: 0;
    padding: 20px;
    background-color: var(--background-color);
}

.container {
    max-width: 1000px;
    margin: 0 auto;
    background: var(--surface-color);
    padding: 40px;
    border-radius: 24px;
    box-shadow: 0 12px 36px rgba(74, 60, 48, 0.1);
    border: 1px solid var(--border-color);
}

h1 {
    text-align: center;
    color: var(--text-primary);
    margin-bottom: 40px;
    font-weight: 600;
    font-size: 2.2rem;
    letter-spacing: -0.75px;
}

.controls {
    margin-bottom: 32px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 16px;
    padding: 20px;
    background: rgba(196, 182, 165, 0.08);
    border-radius: 16px;
    border: 1px solid var(--border-color);
}

.language-select {
    display: flex;
    gap: 20px;
    align-items: center;
}

select, button {
    padding: 12px 24px;
    border-radius: 999px;
    font-size: 15px;
    outline: none;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

select {
    background: var(--surface-color) url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%234A3C30' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e") no-repeat right 16px center/16px;
    border: 2px solid var(--border-color);
    appearance: none;
    padding-right: 48px;
    font-family: 'Space Grotesk';
    color: var(--text-primary);
}

button {
    background: linear-gradient(145deg, var(--primary-color), #635343);
    color: white;
    border: none;
    font-weight: 500;
    letter-spacing: 0.25px;
    box-shadow: 0 4px 16px rgba(74, 60, 48, 0.12),
                inset 0 1px 1px rgba(255, 255, 255, 0.15);
}

button:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 24px rgba(74, 60, 48, 0.18),
                inset 0 1px 1px rgba(255, 255, 255, 0.2);
    background: linear-gradient(145deg, #635343, var(--primary-color));
}

button:disabled {
    background: #C4B6A5;
    box-shadow: none;
}

.transcription-area {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
    margin-bottom: 24px;
}

.panel {
    background: var(--surface-color);
    border: 2px solid var(--border-color);
    border-radius: 20px;
    padding: 24px;
    min-height: 200px;
    max-height: 400px;
    overflow-y: auto;
    box-shadow: inset 0 2px 4px rgba(214, 202, 189, 0.1);
}

.panel h3 {
    text-align: center;
    margin-top: 0;
    padding-bottom: 20px;
    border-bottom: none;
    color: var(--primary-color);
    font-weight: 500;
    font-size: 1.3rem;
    letter-spacing: -0.25px;
    position: relative;
    margin-bottom: 25px;
}

.panel h3::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 60px;
    height: 2px;
    background: var(--accent-gold);
}

.status {
    text-align: center;
    margin: 24px 0;
    font-weight: 500;
    color: var(--text-secondary);
    letter-spacing: 0.25px;
}

.recording {
    animation: pulse 1.5s infinite;
    color: #C45959;
}

@keyframes pulse {
    0% { opacity: 1; }
    50% { opacity: 0.5; }
    100% { opacity: 1; }
}

.interim {
    color: var(--text-secondary);
    font-style: italic;
    opacity: 0.9;
    font-weight: 300;
    letter-spacing: -0.1px;
}

.final {
    color: var(--text-primary);
    border-left: 3px solid var(--accent-gold);
    padding-left: 16px;
    margin: 14px 0;
    line-height: 1.7;
    font-weight: 400;
    font-size: 1.05rem;
}

.error-message {
    color: #B44D4D;
    background-color: #FBEBE9;
    padding: 14px;
    border-radius: 8px;
    margin-bottom: 16px;
    border: 1px solid #F4C7C3;
    font-weight: 400;
}

.audio-level {
    height: 8px;
    background-color: var(--border-color);
    border-radius: 4px;
    margin: 24px 0;
}

.audio-level-bar {
    height: 100%;
    background: linear-gradient(90deg, var(--primary-color), var(--accent-gold));
    width: 0%;
    transition: width 0.1s ease;
}

.settings-panel {
    margin-top: 24px;
    padding: 24px;
    border: 2px solid var(--border-color);
    border-radius: 20px;
    background: rgba(237, 229, 220, 0.6);
    backdrop-filter: blur(8px);
}

.hidden {
    display: none;
}

@media (max-width: 768px) {
    .container {
        padding: 24px;
    }
    
    h1 {
        font-size: 1.8rem;
    }
    
    .transcription-area {
        grid-template-columns: 1fr;
    }
    
    .controls {
        padding: 16px;
        gap: 12px;
    }
    
    .language-select {
        flex-direction: column;
        width: 100%;
    }
    
    .panel h3 {
        font-size: 1.2rem;
    }
}

    </style>
</head>
<body>
    <div class="container">
        <h1>Real-time Transcription and Translation</h1>
        
        <div class="controls">
            <div class="language-select">
                <div>
                    <label for="from-lang">From:</label>
                    <select id="from-lang">
                        <option value="en-US">English (US)</option>
                        <option value="es-ES">Spanish</option>
                        <option value="fr-FR">French</option>
                        <option value="de-DE">German</option>
                        <option value="it-IT">Italian</option>
                        <option value="ja-JP">Japanese</option>
                        <option value="ko-KR">Korean</option>
                        <option value="pt-BR">Portuguese (Brazil)</option>
                        <option value="ru-RU">Russian</option>
                        <option value="zh-CN">Chinese (Simplified)</option>
                    </select>
                </div>
                <div>
                    <label for="to-lang">To:</label>
                    <select id="to-lang">
                        <option value="es">Spanish</option>
                        <option value="en">English</option>
                        <option value="fr">French</option>
                        <option value="de">German</option>
                        <option value="it">Italian</option>
                        <option value="ja">Japanese</option>
                        <option value="ko">Korean</option>
                        <option value="pt">Portuguese</option>
                        <option value="ru">Russian</option>
                        <option value="zh">Chinese (Simplified)</option>
                    </select>
                </div>
            </div>
            <div>
                <button id="start-btn">Start Transcription</button>
                <button id="stop-btn" disabled>Stop Transcription</button>
            </div>
        </div>
        
        <div class="transcription-area">
            <div class="panel">
                <h3>Original Text</h3>
                <div id="transcription"></div>
            </div>
            <div class="panel">
                <h3>Translation</h3>
                <div id="translation"></div>
            </div>
        </div>
        
        <div class="status" id="status">Ready to start</div>
        
        <div class="audio-level">
            <div class="audio-level-bar" id="audio-level-bar"></div>
        </div>

        <div class="settings-panel hidden" id="settings-panel">
            <h3>Advanced Settings</h3>
            <div>
                <label for="buffer-size">Buffer Size:</label>
                <select id="buffer-size">
                    <option value="256">256 (lowest latency, may be unstable)</option>
                    <option value="512">512 (low latency)</option>
                    <option value="1024">1024 (balanced)</option>
                    <option value="2048" selected>2048 (default)</option>
                    <option value="4096">4096 (high stability)</option>
                </select>
            </div>
            <div>
                <label for="sample-rate">Sample Rate:</label>
                <select id="sample-rate">
                    <option value="8000">8 kHz (lower quality)</option>
                    <option value="16000" selected>16 kHz (recommended for speech)</option>
                    <option value="24000">24 kHz</option>
                    <option value="44100">44.1 kHz (high quality)</option>
                    <option value="48000">48 kHz (highest quality)</option>
                </select>
            </div>
            <button id="toggle-advanced">Hide Advanced Settings</button>
        </div>

        <button id="show-advanced">Show Advanced Settings</button>
    </div>

    <script>
        // Initialize Socket.IO connection
        const socket = io();
        
        // DOM elements
        const startBtn = document.getElementById('start-btn');
        const stopBtn = document.getElementById('stop-btn');
        const fromLangSelect = document.getElementById('from-lang');
        const toLangSelect = document.getElementById('to-lang');
        const transcriptionDiv = document.getElementById('transcription');
        const translationDiv = document.getElementById('translation');
        const statusDiv = document.getElementById('status');
        const audioLevelBar = document.getElementById('audio-level-bar');
        const showAdvancedBtn = document.getElementById('show-advanced');
        const toggleAdvancedBtn = document.getElementById('toggle-advanced');
        const settingsPanel = document.getElementById('settings-panel');
        const bufferSizeSelect = document.getElementById('buffer-size');
        const sampleRateSelect = document.getElementById('sample-rate');
        
        // Audio context and variables
        let audioContext;
        let mediaStream;
        let processor;
        let input;
        let isRecording = false;
        let analyser = null;
        let bufferSize = 2048;
        let sampleRate = 16000;
        
        // Socket.IO event handlers
        socket.on('connect', () => {
            console.log('Connected to server');
        });
        
        socket.on('disconnect', () => {
            console.log('Disconnected from server');
            stopRecording();
        });
        
        // Handle interim results (while speaking)
        socket.on('interim_update', (data) => {
            // Update only the transcription panel with interim results
            // Only update if we're not showing a final result
            if (!transcriptionDiv.lastChild || !transcriptionDiv.lastChild.classList.contains('final')) {
                // If there's an existing interim element, update it
                if (transcriptionDiv.lastChild && transcriptionDiv.lastChild.classList.contains('interim')) {
                    transcriptionDiv.lastChild.textContent = data.transcription;
                } else {
                    // Create a new interim element
                    const interimElem = document.createElement('p');
                    interimElem.classList.add('interim');
                    interimElem.textContent = data.transcription;
                    transcriptionDiv.appendChild(interimElem);
                    transcriptionDiv.scrollTop = transcriptionDiv.scrollHeight;
                }
            }
        });
        
        // Update the transcription_update handler for final results
        socket.on('transcription_update', (data) => {
            // Remove any interim results
            if (transcriptionDiv.lastChild && transcriptionDiv.lastChild.classList.contains('interim')) {
                transcriptionDiv.removeChild(transcriptionDiv.lastChild);
            }
            
            // Add final results with distinct styling
            const transcriptionElem = document.createElement('p');
            transcriptionElem.classList.add('final');
            transcriptionElem.textContent = data.transcription;
            transcriptionDiv.appendChild(transcriptionElem);
            
            const translationElem = document.createElement('p');
            translationElem.classList.add('final');
            translationElem.textContent = data.translation;
            translationDiv.appendChild(translationElem);
            
            // Scroll to bottom
            transcriptionDiv.scrollTop = transcriptionDiv.scrollHeight;
            translationDiv.scrollTop = translationDiv.scrollHeight;
        });
        
        socket.on('transcription_status', (data) => {
            if (data.status === 'started') {
                statusDiv.innerHTML = 'Recording... <span class="recording">●</span>';
                statusDiv.classList.add('recording');
                startBtn.disabled = true;
                stopBtn.disabled = false;
            } else if (data.status === 'stopped') {
                statusDiv.innerHTML = 'Ready to start';
                statusDiv.classList.remove('recording');
                startBtn.disabled = false;
                stopBtn.disabled = true;
                stopRecording();
            }
        });
        
        socket.on('error', (data) => {
            console.error(data.message);
            const errorDiv = document.createElement('div');
            errorDiv.classList.add('error-message');
            errorDiv.textContent = data.message;
            document.querySelector('.container').insertBefore(errorDiv, statusDiv);
        });
        
        // Show/hide advanced settings
        showAdvancedBtn.addEventListener('click', () => {
            settingsPanel.classList.remove('hidden');
            showAdvancedBtn.classList.add('hidden');
        });

        toggleAdvancedBtn.addEventListener('click', () => {
            settingsPanel.classList.add('hidden');
            showAdvancedBtn.classList.remove('hidden');
        });

        // Update settings when changed
        bufferSizeSelect.addEventListener('change', (e) => {
            bufferSize = parseInt(e.target.value);
        });

        sampleRateSelect.addEventListener('change', (e) => {
            sampleRate = parseInt(e.target.value);
        });

        // Add audio visualization
        function updateAudioLevel() {
            if (!analyser || !isRecording) return;
            
            const dataArray = new Uint8Array(analyser.fftSize);
            analyser.getByteTimeDomainData(dataArray);
            
            // Calculate audio level (0-100)
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
                sum += Math.abs(dataArray[i] - 128);
            }
            const average = sum / dataArray.length;
            const level = Math.min(100, average * 2);
            
            // Update visualization
            audioLevelBar.style.width = `${level}%`;
            
            // Request next frame
            if (isRecording) {
                requestAnimationFrame(updateAudioLevel);
            }
        }
        
        // Start recording and transcription
        startBtn.addEventListener('click', async () => {
            try {
                // Clear previous content
                transcriptionDiv.innerHTML = '';
                translationDiv.innerHTML = '';
                
                // Remove any error messages
                const errorMessages = document.querySelectorAll('.error-message');
                errorMessages.forEach(el => el.remove());
                
                // Get language preferences
                const fromLang = fromLangSelect.value;
                const toLang = toLangSelect.value;
                
                // Request microphone access with specific constraints
                const constraints = {
                    audio: {
                        channelCount: 1,           // Mono audio (important for speech recognition)
                        sampleRate: sampleRate,    // Sample rate from settings
                        sampleSize: 16,            // 16-bit samples
                        echoCancellation: true,    // Enable echo cancellation
                        noiseSuppression: true,    // Enable noise suppression
                        autoGainControl: true      // Enable automatic gain control
                    }
                };
                
                mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
                
                // Start audio processing with improved settings
                audioContext = new (window.AudioContext || window.webkitAudioContext)({
                    sampleRate: sampleRate  // Force sample rate from settings
                });
                
                input = audioContext.createMediaStreamSource(mediaStream);
                
                // Create analyser for visualization
                analyser = audioContext.createAnalyser();
                analyser.fftSize = 256;
                input.connect(analyser);
                
                // Create processor with buffer size from settings
                processor = audioContext.createScriptProcessor(bufferSize, 1, 1);
                
                // Connect nodes
                input.connect(processor);
                processor.connect(audioContext.destination);
                
                // Start audio level visualization
                updateAudioLevel();
                
                // Process audio data with improved conversion
                processor.onaudioprocess = (e) => {
                    if (!isRecording) return;
                    
                    // Get audio data
                    const inputData = e.inputBuffer.getChannelData(0);
                    
                    // Convert to 16-bit PCM with proper scaling
                    const pcmData = convertFloat32ToInt16(inputData);
                    
                    // Send to server
                    socket.emit('audio_data', { audio_data: pcmData });
                };
                
                // Start recording
                isRecording = true;
                
                // Start transcription on the server
                socket.emit('start_transcription', { from_lang: fromLang, to_lang: toLang });
                
            } catch (error) {
                console.error('Error starting recording:', error);
                const errorDiv = document.createElement('div');
                errorDiv.classList.add('error-message');
                errorDiv.textContent = `Error: ${error.message}`;
                document.querySelector('.container').insertBefore(errorDiv, statusDiv);
            }
        });
        
        // Stop recording and transcription
        stopBtn.addEventListener('click', () => {
            socket.emit('stop_transcription');
            stopRecording();
        });
        
        // Helper function to stop recording
        function stopRecording() {
            isRecording = false;
            
            // Clean up audio resources
            if (processor) {
                processor.disconnect();
                processor = null;
            }
            
            if (analyser) {
                analyser.disconnect();
                analyser = null;
            }
            
            if (input) {
                input.disconnect();
                input = null;
            }
            
            if (audioContext && audioContext.state !== 'closed') {
                audioContext.close();
                audioContext = null;
            }
            
            if (mediaStream) {
                mediaStream.getTracks().forEach(track => track.stop());
                mediaStream = null;
            }
            
            // Update UI
            startBtn.disabled = false;
            stopBtn.disabled = true;
            audioLevelBar.style.width = '0%';
        }
        
        // Improved audio conversion function
        function convertFloat32ToInt16(buffer) {
            const l = buffer.length;
            const buf = new Int16Array(l);
            
            // Improved scaling for better audio quality
            for (let i = 0; i < l; i++) {
                // Apply proper scaling and clamping
                const s = Math.max(-1, Math.min(1, buffer[i]));
                // Convert to 16-bit signed integer
                buf[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }
            
            return buf.buffer;
        }
    </script>
</body>
</html>
        ''')
    
    # Run the app
    socketio.run(app, debug=True, host='0.0.0.0', port=5007, ssl_context=None)