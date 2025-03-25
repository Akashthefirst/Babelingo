import os
import time
import tempfile
import wave
import threading
import queue
import warnings
import numpy as np
import sounddevice as sd
import whisper

# Filter out specific Whisper warnings about FP16
warnings.filterwarnings("ignore", message="FP16 is not supported on CPU; using FP32 instead")

# Audio recording parameters
CHANNELS = 1
RATE = 16000  # 16kHz required by Whisper
CHUNK_SECONDS = 2  # Process audio in 2-second chunks
SILENCE_THRESHOLD = 300  # Higher threshold to ignore background noise
ACTIVATION_DURATION = 1.0  # Minimum duration (seconds) of sound above threshold to start recording
DEACTIVATION_DURATION = 1.5  # Duration of silence (seconds) to stop recording

class AudioProcessor:
    def __init__(self):
        # Load Whisper model (disable fp16 to avoid warnings on CPU)
        print("Loading Whisper model (base)...")
        self.model = whisper.load_model("base")
        print("Whisper model loaded successfully!")
        
        # Set up audio queue and processing thread
        self.audio_queue = queue.Queue()
        self.is_running = True
        self.temp_dir = tempfile.mkdtemp()
        print(f"Temporary files stored in: {self.temp_dir}")
        
        # Set up recording parameters
        self.chunk_samples = int(RATE * CHUNK_SECONDS)
        
        # Audio capture states
        self.is_capturing = False
        self.manual_mode = False
        self.force_capture = False
        
        # Noise detection buffer
        self.sound_buffer = []
        self.silence_buffer = []
        self.collected_audio = []
        
        # Configure threshold
        self.current_threshold = SILENCE_THRESHOLD
        
    def audio_callback(self, indata, frames, time, status):
        """Callback for sounddevice to push audio chunks to queue"""
        if status:
            print(f"Audio status: {status}")
            
        # Check audio level
        audio_level = np.abs(indata).mean()
        
        # Display audio level meter for debugging
        level_meter = '|' + '■' * int(min(audio_level / 50, 20)) + ' ' * (20 - int(min(audio_level / 50, 20))) + f'| {int(audio_level)}'
        print(f"\r{level_meter}", end='', flush=True)
        
        # Manual override mode
        if self.manual_mode:
            if self.force_capture:
                if not self.is_capturing:
                    self.is_capturing = True
                    print("\n🎤 Manual capture started...")
                self.audio_queue.put(indata.copy())
            return
            
        # Auto mode - Check audio level with noise rejection
        if audio_level > self.current_threshold:
            self.sound_buffer.append(True)
            self.silence_buffer = []
            self.collected_audio.append(indata.copy())
        else:
            self.sound_buffer.append(False)
            if self.is_capturing:
                self.silence_buffer.append(True)
                self.collected_audio.append(indata.copy())
        
        # Keep the buffers at an appropriate size
        if len(self.sound_buffer) > RATE / self.chunk_samples * ACTIVATION_DURATION:
            self.sound_buffer.pop(0)
        if len(self.silence_buffer) > RATE / self.chunk_samples * DEACTIVATION_DURATION:
            self.silence_buffer.pop(0)
        
        # Logic to start capturing
        was_capturing = self.is_capturing
        if not self.is_capturing and all(self.sound_buffer) and len(self.sound_buffer) >= RATE / self.chunk_samples * ACTIVATION_DURATION:
            self.is_capturing = True
        
        # Logic to stop capturing
        if self.is_capturing and len(self.silence_buffer) >= RATE / self.chunk_samples * DEACTIVATION_DURATION and all(self.silence_buffer):
            self.is_capturing = False
            # Process all collected audio if we have enough
            if len(self.collected_audio) > 2:
                combined_audio = np.vstack(self.collected_audio)
                self.audio_queue.put(combined_audio)
            self.collected_audio = []
        
        # Show capture indicator when status changes
        if self.is_capturing and not was_capturing:
            print("\n🎤 Capturing audio...")
        elif not self.is_capturing and was_capturing:
            print("\n🔇 Audio input stopped")
    
    def save_audio_to_wav(self, audio_data, filename):
        """Save audio data to WAV file"""
        with wave.open(filename, 'wb') as wf:
            wf.setnchannels(CHANNELS)
            wf.setsampwidth(2)  # 2 bytes = 16 bits
            wf.setframerate(RATE)
            wf.writeframes(audio_data.tobytes())
    
    def process_audio_thread(self):
        """Thread to process audio chunks from queue"""
        while self.is_running:
            try:
                # Get audio chunk from queue (wait up to 1 second)
                try:
                    audio_data = self.audio_queue.get(timeout=1)
                except queue.Empty:
                    continue
                
                # Create temporary WAV file
                temp_wav = os.path.join(self.temp_dir, f"audio_{int(time.time())}.wav")
                self.save_audio_to_wav(audio_data, temp_wav)
                
                # Transcribe with Whisper (explicitly disable fp16 to avoid warnings)
                result = self.model.transcribe(temp_wav, fp16=False)
                transcription = result["text"].strip()
                
                if transcription:
                    # Display transcription with timestamp
                    current_time = time.strftime("%H:%M:%S")
                    print(f"\n[{current_time}] 📝 {transcription}")
                
                # Clean up temp file
                os.remove(temp_wav)
                
            except Exception as e:
                print(f"Error processing audio: {e}")
    
    def command_thread(self):
        """Thread to handle user commands"""
        print("\nCommand options:")
        print("  m - Toggle manual/auto mode")
        print("  c - Start/stop manual capture")
        print("  + - Increase sensitivity")
        print("  - - Decrease sensitivity")
        print("  q - Quit")
        
        while self.is_running:
            command = input("\nEnter command: ")
            if command.lower() == 'm':
                self.manual_mode = not self.manual_mode
                mode_name = "Manual" if self.manual_mode else "Automatic"
                print(f"\nSwitched to {mode_name} mode")
                # Reset states
                self.force_capture = False
                self.is_capturing = False
                self.sound_buffer = []
                self.silence_buffer = []
                self.collected_audio = []
            elif command.lower() == 'c':
                if self.manual_mode:
                    self.force_capture = not self.force_capture
                    if not self.force_capture:
                        print("\n🔇 Manual capture stopped")
                else:
                    print("\nManual capture only works in manual mode. Type 'm' to switch to manual mode first.")
            elif command == '+':
                self.current_threshold = max(50, self.current_threshold - 50)
                print(f"\nIncreased sensitivity - new threshold: {self.current_threshold}")
            elif command == '-':
                self.current_threshold += 50
                print(f"\nDecreased sensitivity - new threshold: {self.current_threshold}")
            elif command.lower() == 'q':
                self.is_running = False
                print("\nExiting...")
                break
            time.sleep(0.1)
    
    def run(self):
        """Main method to run the real-time audio processor"""
        # Start processing thread
        processor_thread = threading.Thread(target=self.process_audio_thread)
        processor_thread.daemon = True
        processor_thread.start()
        
        # Start command thread
        cmd_thread = threading.Thread(target=self.command_thread)
        cmd_thread.daemon = True
        cmd_thread.start()
        
        print("\n" + "=" * 60)
        print("REAL-TIME AUDIO TRANSCRIPTION - NOISE RESISTANT")
        print("=" * 60)
        print("MODES:")
        print("  - AUTO mode: Automatically detects speech and filters noise")
        print("  - MANUAL mode: Only captures when you toggle capture on")
        print("\nINDICATORS:")
        print("  - 🎤 = Capturing audio | 📝 = Transcription available")
        print("  - The bar meter shows audio level and current threshold")
        print("=" * 60 + "\n")
        
        try:
            # Start streaming from microphone
            with sd.InputStream(
                callback=self.audio_callback,
                channels=CHANNELS,
                samplerate=RATE,
                blocksize=self.chunk_samples,
                dtype='int16'
            ):
                # Keep the main thread alive until thread signals exit
                while self.is_running:
                    time.sleep(0.1)
        except KeyboardInterrupt:
            print("\nStopping real-time transcription...")
        finally:
            # Clean up
            self.is_running = False
            print("Audio resources released.")

if __name__ == "__main__":
    processor = AudioProcessor()
    processor.run()