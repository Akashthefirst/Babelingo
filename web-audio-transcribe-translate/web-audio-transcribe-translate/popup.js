
// DOM elements
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const fromLangSelect = document.getElementById('from-lang');
const toLangSelect = document.getElementById('to-lang');
const transcriptionDiv = document.getElementById('transcription');
const translationDiv = document.getElementById('translation');
const statusDiv = document.getElementById('status');
const audioLevelBar = document.getElementById('audio-level-bar');
const settingsButton = document.getElementById('settings-button');
const ttsToggle = document.getElementById('tts-toggle');

// Global variables
let port = null;
let isCapturing = false;
let mediaStream = null;
let audioContext = null;
let audioProcessor = null;
let audioAnalyser = null;

document.addEventListener('DOMContentLoaded', function() {
  // Load API configuration from chrome.storage.sync
  chrome.storage.sync.get(['subscriptionKey', 'region', 'translatorEndpoint'], function(items) {
    // Check if the subscription key is provided
    if (!items.subscriptionKey) {
      statusDiv.textContent = "Please set your Azure API key in the extension settings.";
      statusDiv.classList.add('error');
      startBtn.disabled = true; // Optionally disable start functionality
      return;
    }
    
    // Initialize Azure API using stored values or fallback defaults
    window.azureAPI = new DirectAzureAPI(
      items.subscriptionKey,
      items.region || "eastus2",
      items.translatorEndpoint || "https://ai-aihackthonhub282549186415.cognitiveservices.azure.com/translator/text/v3.0/translate"
    );
    
    // Set up callbacks
    window.azureAPI.setCallbacks({
      onFinalResult: handleFinalResult,
      onError: handleApiError
    });
    
    // Continue with loading language preferences, TTS settings, etc.
    chrome.storage.sync.get(['fromLang', 'toLang', 'ttsEnabled'], function(result) {
      if (result.fromLang) fromLangSelect.value = result.fromLang;
      if (result.toLang) toLangSelect.value = result.toLang;
      
      const ttsEnabled = result.ttsEnabled !== undefined ? result.ttsEnabled : false;
      ttsToggle.checked = ttsEnabled;
      window.azureAPI.setTtsEnabled(ttsEnabled);
    });
  });
  
  // Connect to background script and set up event listeners as before
  connectToBackground();
  startBtn.addEventListener('click', startCapture);
  stopBtn.addEventListener('click', stopCapture);
  settingsButton.addEventListener('click', openSettings);
  
  ttsToggle.addEventListener('change', function() {
    const enabled = ttsToggle.checked;
    window.azureAPI.setTtsEnabled(enabled);
    chrome.storage.sync.set({ ttsEnabled: enabled });
  });
});

// Connect to the background script
function connectToBackground() {
  try {
    port = chrome.runtime.connect({name: "popup_" + Date.now()});
    console.log('Connected to background script');
    
    // Set up message listener
    port.onMessage.addListener(handleMessage);
    
    // Handle disconnection
    port.onDisconnect.addListener(function() {
      console.log('Disconnected from background script');
      port = null;
      setTimeout(connectToBackground, 1000);
    });
  } catch (error) {
    console.error('Error connecting to background:', error);
    setTimeout(connectToBackground, 1000);
  }
}

// // Event listeners
// document.addEventListener('DOMContentLoaded', function() {
//   console.log('Popup loaded');
  
//   // Connect to background script
//   connectToBackground();
  
//   // Load saved language preferences
//   chrome.storage.sync.get(['fromLang', 'toLang', 'ttsEnabled'], function(result) {
//     if (result.fromLang) fromLangSelect.value = result.fromLang;
//     if (result.toLang) toLangSelect.value = result.toLang;
    
//     // Set TTS toggle state
//     const ttsEnabled = result.ttsEnabled !== undefined ? result.ttsEnabled : false;
//     ttsToggle.checked = ttsEnabled;
//     window.azureAPI.setTtsEnabled(ttsEnabled);
//   });
  
//   // Setup button click handlers
//   startBtn.addEventListener('click', startCapture);
//   stopBtn.addEventListener('click', stopCapture);
//   settingsButton.addEventListener('click', openSettings);
  
//   // TTS toggle handler
//   ttsToggle.addEventListener('change', function() {
//     const enabled = ttsToggle.checked;
//     window.azureAPI.setTtsEnabled(enabled);
    
//     // Save preference
//     chrome.storage.sync.set({ ttsEnabled: enabled });
//   });
// });

// Handle messages from the background script
function handleMessage(message) {
  console.log('Popup received message:', message);
  
  switch(message.type) {
    case "mediaStreamId":
      // Use the stream ID to get the media stream
      startMediaCapture(message.streamId, message.langData);
      break;
      
    case "captureStopped":
      stopMediaCapture();
      updateUIForCapture(false);
      break;
      
    case "error":
      showError(message.message);
      updateUIForCapture(false);
      break;
  }
}

// Start the capture process
function startCapture() {
  console.log('Starting capture');
  
  // Clear previous content
  transcriptionDiv.innerHTML = '';
  translationDiv.innerHTML = '';
  
  // Remove any error messages
  const errorMessages = document.querySelectorAll('.error-message');
  errorMessages.forEach(el => el.remove());
  
  // Get language preferences
  const fromLang = fromLangSelect.value;
  const toLang = toLangSelect.value;
  
  // Save language preferences
  chrome.storage.sync.set({
    fromLang: fromLang,
    toLang: toLang
  });
  
  // Make sure we're connected to the background script
  if (!port) {
    connectToBackground();
    showError("Reconnecting to background. Please try again in a moment.");
    return;
  }
  
  // Send request to background script
  port.postMessage({
    action: "startCapture",
    fromLang: fromLang,
    toLang: toLang
  });
}

// Start media capture with the given stream ID
async function startMediaCapture(streamId, langData) {
  console.log('Starting media capture with stream ID');
  
  try {
    // Create constraints with the stream ID
    const constraints = {
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId
        }
      },
      video: false
    };
    
    // Get the media stream
    mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
    console.log('Media stream obtained');
    
    // Set up audio processing
    setupAudioProcessing(mediaStream, langData.fromLang, langData.toLang);
    
    // Update UI
    updateUIForCapture(true);
    
    // Set the language for our API
    window.azureAPI.setLanguage(langData.fromLang);
    
  } catch (error) {
    console.error('Error starting media capture:', error);
    showError(`Error capturing audio: ${error.message}`);
    if (port) {
      port.postMessage({
        action: "stopCapture"
      });
    }
    updateUIForCapture(false);
  }
}

// Set up audio processing
function setupAudioProcessing(stream, fromLang, toLang) {
  try {
    console.log('Setting up audio processing');
    
    // Create audio context
    audioContext = new AudioContext({
      sampleRate: 16000 // 16 kHz is good for speech recognition
    });
    
    // Create source from the stream
    const source = audioContext.createMediaStreamSource(stream);
    
    // Create a processor node
    audioProcessor = audioContext.createScriptProcessor(4096, 1, 1);
    
    // Create an analyser for audio levels
    audioAnalyser = audioContext.createAnalyser();
    audioAnalyser.fftSize = 256;
    const bufferLength = audioAnalyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    // Connect the nodes
    source.connect(audioAnalyser);
    source.connect(audioProcessor);
    audioProcessor.connect(audioContext.destination);
    
    console.log('Audio nodes connected');
    
    // Process audio data
    audioProcessor.onaudioprocess = function(e) {
      if (!isCapturing) return;
      
      // Check if there's actual audio playing (avoid sending silence)
      audioAnalyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
      }
      const average = sum / bufferLength;
      
      // Update audio level visualization
      audioLevelBar.style.width = `${Math.min(100, average * 2)}%`;
      
      // Only process if there's actual audio (not just silence)
      if (average > 10) {
        // Get audio data
        const inputData = e.inputBuffer.getChannelData(0);
        
        // Convert to the format needed (16-bit PCM)
        const pcmData = convertFloat32ToInt16(inputData);
        
        // Process with our API
        window.azureAPI.processAudio(pcmData);
      }
    };
    
    console.log('Audio processing set up successfully');
  } catch (error) {
    console.error('Error setting up audio processing:', error);
    showError(`Error processing audio: ${error.message}`);
    stopCapture();
  }
}

// Stop the capture process
function stopCapture() {
  console.log('Stopping capture');
  
  if (port) {
    port.postMessage({
      action: "stopCapture"
    });
  }
  
  stopMediaCapture();
  updateUIForCapture(false);
}

// Stop media capture
function stopMediaCapture() {
  console.log('Stopping media capture');
  
  // Stop all tracks in the media stream
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => {
      console.log('Stopping track:', track.kind);
      track.stop();
    });
    mediaStream = null;
  }
  
  // Clean up audio context
  if (audioContext) {
    if (audioProcessor) {
      audioProcessor.disconnect();
      audioProcessor = null;
    }
    
    if (audioAnalyser) {
      audioAnalyser.disconnect();
      audioAnalyser = null;
    }
    
    audioContext.close().then(() => {
      console.log('Audio context closed');
      audioContext = null;
    }).catch(err => {
      console.error('Error closing audio context:', err);
    });
  }
  
  // Stop API processing
  window.azureAPI.stop();
}

// Open settings page
function openSettings() {
  chrome.runtime.openOptionsPage();
}

// Update UI when capture starts/stops
function updateUIForCapture(isStarted) {
  console.log('Updating UI for capture:', isStarted);
  isCapturing = isStarted;
  
  if (isStarted) {
    startBtn.disabled = true;
    stopBtn.disabled = false;
    statusDiv.innerHTML = 'Capturing... <span class="recording">●</span>';
    statusDiv.classList.add('recording');
  } else {
    startBtn.disabled = false;
    stopBtn.disabled = true;
    statusDiv.textContent = 'Ready to start';
    statusDiv.classList.remove('recording');
    audioLevelBar.style.width = '0%';
  }
}

// Display error message
function showError(message) {
  console.error('Error:', message);
  const errorDiv = document.createElement('div');
  errorDiv.classList.add('error-message');
  errorDiv.textContent = message;
  document.body.insertBefore(errorDiv, statusDiv);
}

// Handle API errors
function handleApiError(error) {
  showError(`API error: ${error}`);
}

// Handle final recognition results
async function handleFinalResult(text) {
  // Skip empty results
  if (!text.trim()) return;
  
  console.log('Recognition result:', text);
  
  // Add final transcription
  const transcriptionElem = document.createElement('p');
  transcriptionElem.classList.add('final');
  transcriptionElem.textContent = text;
  transcriptionDiv.appendChild(transcriptionElem);
  transcriptionDiv.scrollTop = transcriptionDiv.scrollHeight;
  
  // Translate the text
  try {
    const translatedText = await window.azureAPI.translateText(
      text,
      fromLangSelect.value,
      toLangSelect.value
    );
    
    console.log('Translation:', translatedText);
    
    // Add translation to UI
    const translationElem = document.createElement('p');
    translationElem.classList.add('final');
    translationElem.textContent = translatedText;
    translationDiv.appendChild(translationElem);
    translationDiv.scrollTop = translationDiv.scrollHeight;
  } catch (error) {
    console.error('Translation error:', error);
  }
}

// Helper function to convert Float32Array to Int16Array
function convertFloat32ToInt16(buffer) {
  const l = buffer.length;
  const buf = new Int16Array(l);
  
  for (let i = 0; i < l; i++) {
    // Scale and clamp the sample
    const s = Math.max(-1, Math.min(1, buffer[i]));
    // Convert to 16-bit signed integer
    buf[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  
  return buf;
}