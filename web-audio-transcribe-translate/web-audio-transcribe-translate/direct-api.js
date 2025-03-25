// Direct implementation for Azure Speech Recognition, Translation, and Text-to-Speech
// This avoids loading external SDKs that cause CSP issues

class DirectAzureAPI {
    constructor(subscriptionKey, region, translatorEndpoint) {
      this.subscriptionKey = subscriptionKey;
      this.region = region;
      this.translatorEndpoint = translatorEndpoint;
      this.language = 'en-US';
      this.bufferSize = 4096;
      this.sampleRate = 16000;
      this.audioBuffer = [];
      this.isProcessing = false;
      this.audioContext = null;
      
      // TTS settings
      this.isTtsEnabled = false;
      this.ttsAudioQueue = [];
      this.isTtsSpeaking = false;
      
      // Callbacks
      this.onInterimResult = null;
      this.onFinalResult = null;
      this.onError = null;
      this.onStatusChange = null;
    }
  
    // Set up callbacks
    setCallbacks(callbacks) {
      if (callbacks.onInterimResult) this.onInterimResult = callbacks.onInterimResult;
      if (callbacks.onFinalResult) this.onFinalResult = callbacks.onFinalResult;
      if (callbacks.onError) this.onError = callbacks.onError;
      if (callbacks.onStatusChange) this.onStatusChange = callbacks.onStatusChange;
    }
  
    // Set recognition language
    setLanguage(language) {
      this.language = language;
    }
  
    // Enable or disable TTS
    setTtsEnabled(enabled) {
      this.isTtsEnabled = enabled;
      console.log(`TTS ${enabled ? 'enabled' : 'disabled'}`);
    }
  
    // Process audio data from tab capture
    processAudio(audioData) {
      // Add to buffer
      this.audioBuffer.push(audioData);
      
      // If we have enough data and not already processing, start processing
      if (this.audioBuffer.length >= 5 && !this.isProcessing) { // ~5 seconds of audio
        this.processBatch();
      }
    }
  
    // Process a batch of audio data
    async processBatch() {
      if (this.isProcessing || this.audioBuffer.length === 0) return;
      
      this.isProcessing = true;
      
      try {
        // Combine audio data from buffer
        const combinedData = this.combineAudioChunks(this.audioBuffer.splice(0, 5));
        
        // Convert to WAV format
        const wavBlob = this.convertToWav(combinedData);
        
        // Send to Azure for recognition
        const text = await this.recognizeSpeech(wavBlob);
        
        // Handle the result
        if (text && text.trim()) {
          if (this.onFinalResult) {
            this.onFinalResult(text);
          }
        }
      } catch (error) {
        console.error('Error processing audio batch:', error);
        if (this.onError) {
          this.onError(error.message);
        }
      } finally {
        this.isProcessing = false;
        
        // If there's more data in the buffer, process the next batch
        if (this.audioBuffer.length >= 5) {
          this.processBatch();
        }
      }
    }
  
    // Combine multiple audio chunks
    combineAudioChunks(chunks) {
      // Get total length
      let totalLength = 0;
      chunks.forEach(chunk => {
        totalLength += chunk.length;
      });
      
      // Create a new buffer of the total length
      const result = new Int16Array(totalLength);
      
      // Copy all chunks into it
      let offset = 0;
      chunks.forEach(chunk => {
        result.set(new Int16Array(chunk.buffer || chunk), offset);
        offset += chunk.length;
      });
      
      return result;
    }
  
    // Convert PCM audio data to WAV format
    convertToWav(pcmData) {
      // WAV header information
      const numChannels = 1;
      const bitsPerSample = 16;
      const bytesPerSample = bitsPerSample / 8;
      const blockAlign = numChannels * bytesPerSample;
      const byteRate = this.sampleRate * blockAlign;
      const dataSize = pcmData.length * bytesPerSample;
      const buffer = new ArrayBuffer(44 + dataSize);
      const view = new DataView(buffer);
      
      // WAV header
      // "RIFF" chunk descriptor
      this.writeString(view, 0, 'RIFF');
      view.setUint32(4, 36 + dataSize, true);
      this.writeString(view, 8, 'WAVE');
      
      // "fmt " sub-chunk
      this.writeString(view, 12, 'fmt ');
      view.setUint32(16, 16, true); // fmt chunk size
      view.setUint16(20, 1, true); // audio format (PCM)
      view.setUint16(22, numChannels, true);
      view.setUint32(24, this.sampleRate, true);
      view.setUint32(28, byteRate, true);
      view.setUint16(32, blockAlign, true);
      view.setUint16(34, bitsPerSample, true);
      
      // "data" sub-chunk
      this.writeString(view, 36, 'data');
      view.setUint32(40, dataSize, true);
      
      // Write the PCM samples
      const dataView = new Int16Array(buffer, 44, pcmData.length);
      dataView.set(pcmData);
      
      // Create and return blob
      return new Blob([buffer], { type: 'audio/wav' });
    }
  
    // Helper to write strings to DataView
    writeString(view, offset, string) {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    }
  
    // Recognize speech using Azure Speech API
    async recognizeSpeech(audioBlob) {
      try {
        // Get authorization token for Speech API
        const authToken = await this.getAuthorizationToken();
        
        // Prepare form data with audio
        const response = await fetch(
          `https://${this.region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=${this.language}`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${authToken}`,
              'Content-Type': 'audio/wav; codec=audio/pcm; samplerate=16000',
              'Ocp-Apim-Subscription-Key': this.subscriptionKey
            },
            body: audioBlob
          }
        );
        
        if (!response.ok) {
          throw new Error(`Speech API error: ${response.status} ${response.statusText}`);
        }
        
        const result = await response.json();
        
        // Extract and return the recognized text
        if (result.RecognitionStatus === 'Success') {
          return result.DisplayText || '';
        } else if (result.RecognitionStatus === 'NoMatch' || 
                   result.RecognitionStatus === 'InitialSilenceTimeout') {
          return ''; // No speech detected
        } else {
          console.warn('Speech recognition status:', result.RecognitionStatus);
          return '';
        }
      } catch (error) {
        console.error('Speech recognition error:', error);
        throw error;
      }
    }
  
    // Get authorization token for Speech API
    async getAuthorizationToken() {
      try {
        const response = await fetch(
          `https://${this.region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`,
          {
            method: 'POST',
            headers: {
              'Ocp-Apim-Subscription-Key': this.subscriptionKey,
              'Content-Type': 'application/json'
            }
          }
        );
        
        if (!response.ok) {
          throw new Error(`Token error: ${response.status} ${response.statusText}`);
        }
        
        return await response.text();
      } catch (error) {
        console.error('Error getting token:', error);
        throw error;
      }
    }
  
    // Translate text using Azure Translator API
    async translateText(text, fromLang, toLang) {
      try {
        // Extract base language code (e.g., 'en-US' -> 'en')
        const fromLangBase = fromLang.split('-')[0];
        
        // Make translation request
        const response = await fetch(
          `${this.translatorEndpoint}?api-version=3.0&from=${fromLangBase}&to=${toLang}`,
          {
            method: 'POST',
            headers: {
              'Ocp-Apim-Subscription-Key': this.subscriptionKey,
              'Content-Type': 'application/json',
              'Ocp-Apim-Subscription-Region': this.region
            },
            body: JSON.stringify([{ text }])
          }
        );
        
        if (!response.ok) {
          throw new Error(`Translation error: ${response.status} ${response.statusText}`);
        }
        
        const result = await response.json();
        const translatedText = result[0]?.translations[0]?.text || '[Translation failed]';
        
        // If TTS is enabled, speak the translated text
        if (this.isTtsEnabled) {
          this.textToSpeech(translatedText, toLang);
        }
        
        // Return the translated text
        return translatedText;
      } catch (error) {
        console.error('Translation error:', error);
        return `[Translation error: ${error.message}]`;
      }
    }
  
    // Text-to-Speech using Azure Speech API
    async textToSpeech(text, language) {
      if (!this.isTtsEnabled || !text || text.trim() === '') return;
      
      try {
        // Get authorization token for Speech API
        const authToken = await this.getAuthorizationToken();
        
        // Determine voice based on language
        const voice = this.getVoiceForLanguage(language);
        
        // Create SSML
        const ssml = `
          <speak version='1.0' xml:lang='${language}'>
            <voice xml:lang='${language}' name='${voice}'>
              ${this.escapeXml(text)}
            </voice>
          </speak>
        `;
        
        // Make TTS request
        const response = await fetch(
          `https://${this.region}.tts.speech.microsoft.com/cognitiveservices/v1`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${authToken}`,
              'Content-Type': 'application/ssml+xml',
              'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3',
              'Ocp-Apim-Subscription-Key': this.subscriptionKey
            },
            body: ssml
          }
        );
        
        if (!response.ok) {
          throw new Error(`TTS API error: ${response.status} ${response.statusText}`);
        }
        
        // Get audio data
        const audioData = await response.arrayBuffer();
        
        // Play the audio (add to queue)
        this.queueTtsAudio(audioData);
        
      } catch (error) {
        console.error('TTS error:', error);
        if (this.onError) {
          this.onError(`TTS error: ${error.message}`);
        }
      }
    }
  
    // Queue TTS audio for playback to avoid overlaps
    queueTtsAudio(audioData) {
      // Add to queue
      this.ttsAudioQueue.push(audioData);
      
      // If not currently speaking, start playing
      if (!this.isTtsSpeaking) {
        this.playNextTtsAudio();
      }
    }
  
    // Play the next TTS audio in the queue
    playNextTtsAudio() {
      if (this.ttsAudioQueue.length === 0) {
        this.isTtsSpeaking = false;
        return;
      }
      
      this.isTtsSpeaking = true;
      const audioData = this.ttsAudioQueue.shift();
      
      // Create audio element
      const audio = new Audio();
      const blob = new Blob([audioData], { type: 'audio/mp3' });
      audio.src = URL.createObjectURL(blob);
      
      // Set up event listeners
      audio.onended = () => {
        URL.revokeObjectURL(audio.src);
        // Play next audio in queue
        this.playNextTtsAudio();
      };
      
      audio.onerror = (err) => {
        console.error('Audio playback error:', err);
        URL.revokeObjectURL(audio.src);
        // Continue with next audio in queue
        this.playNextTtsAudio();
      };
      
      // Play the audio
      audio.play().catch(err => {
        console.error('Failed to play audio:', err);
        // Continue with next audio in queue
        this.playNextTtsAudio();
      });
    }
  
    // Get appropriate voice based on language
    getVoiceForLanguage(language) {
      // Convert language code to match voices (e.g., 'es' to 'es-ES')
      const langBase = language.split('-')[0].toLowerCase();
      
      // Voice mapping
      const voiceMap = {
        'en': 'en-US-JennyNeural',
        'es': 'es-ES-ElviraNeural',
        'fr': 'fr-FR-DeniseNeural',
        'de': 'de-DE-KatjaNeural',
        'it': 'it-IT-ElsaNeural',
        'ja': 'ja-JP-NanamiNeural',
        'ko': 'ko-KR-SunHiNeural',
        'pt': 'pt-BR-FranciscaNeural',
        'ru': 'ru-RU-SvetlanaNeural',
        'zh': 'zh-CN-XiaoxiaoNeural'
      };
      
      return voiceMap[langBase] || 'en-US-JennyNeural';
    }
  
    // Escape XML for SSML
    escapeXml(text) {
      return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
    }
  
    // Stop processing
    stop() {
      this.audioBuffer = [];
      this.isProcessing = false;
      this.ttsAudioQueue = [];
      this.isTtsSpeaking = false;
    }
  }
  
  // Global instance will be created in popup.js
  window.azureAPI = null;