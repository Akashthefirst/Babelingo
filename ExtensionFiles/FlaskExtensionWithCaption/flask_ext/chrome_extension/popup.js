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
const minimizeBtn = document.getElementById('minimize-btn');
const infoMessage = document.getElementById('info-message');
const serverStatus = document.getElementById('server-status');
const backgroundModeIndicator = document.getElementById('background-mode');
const originalTab = document.getElementById('original-tab');
const translationTab = document.getElementById('translation-tab');
const originalPanel = document.getElementById('original-panel');
const translationPanel = document.getElementById('translation-panel');
const errorContainer = document.getElementById('error-container');

// Flask server URL
const SERVER_URL = 'http://127.0.0.1:5015';
// Azure TTS direct API endpoint
const TTS_ENDPOINT = 'https://eastus2.tts.speech.microsoft.com/cognitiveservices/v1';
// Azure subscription key
const SUBSCRIPTION_KEY = 'Fj1KPt7grC6bAkNja7daZUstpP8wZTXsV6Zjr2FOxkO7wsBQ5SzQJQQJ99BCACHYHv6XJ3w3AAAAACOGL3Xg';

// Global variables
let port = null;
let isCapturing = false;
let mediaStream = null;
let audioContext = null;
let audioProcessor = null;
let audioAnalyser = null;
let isServerRunning = false;
// Features are always enabled
let isTtsEnabled = true;
let captionMode = true;
let backgroundMode = true; 
let audioChunks = [];
let processingAudio = false;
let processingInterval = null;

// Queue system for TTS playback
let ttsQueue = [];
let isPlayingTTS = false;
let currentTtsSessionId = null;

// Connect to the background script
function connectToBackground() {
  try {
    port = chrome.runtime.connect({name: "popup_" + Date.now()});
    console.log('Connected to background script');
    
    // Set up message listener
    port.onMessage.addListener(handleBackgroundMessage);
    
    // Handle disconnection
    port.onDisconnect.addListener(function() {
      console.log('Disconnected from background script');
      port = null;
      setTimeout(connectToBackground, 1000);
    });
    
    // Check server status
    port.postMessage({
      action: "checkServer"
    });
  } catch (error) {
    console.error('Error connecting to background:', error);
    setTimeout(connectToBackground, 1000);
  }
}

// Event listeners
document.addEventListener('DOMContentLoaded', function() {
  console.log('Popup loaded');
  
  // Connect to background script
  connectToBackground();
  
  // IMPORTANT: Check for active capture state in local storage
  chrome.storage.local.get(['captureActive'], function(result) {
    if (result.captureActive === true) {
      console.log("Found active capture state in storage");
      
      // Set capturing to true - we'll get the full details from getCurrentState
      isCapturing = true;
      backgroundMode = true;
    }
  });
  
  // Load saved language preferences
  chrome.storage.sync.get(['fromLang', 'toLang'], function(result) {
    if (result.fromLang) fromLangSelect.value = result.fromLang;
    if (result.toLang) toLangSelect.value = result.toLang;
    
    // Update background mode indicator
    if (backgroundMode && backgroundModeIndicator) {
      backgroundModeIndicator.style.display = 'block';
    }
  });
  
  // Setup button click handlers
  startBtn.addEventListener('click', startCapture);
  stopBtn.addEventListener('click', stopCapture);
  settingsButton.addEventListener('click', openSettings);
  
  // Minimize button handler
  minimizeBtn.addEventListener('click', toggleMinimize);
  
  // Panel tabs
  originalTab.addEventListener('click', () => switchPanel('original'));
  translationTab.addEventListener('click', () => switchPanel('translation'));
  
  // Check if already running in background
  checkBackgroundState();
});

// Toggle minimize state - creates a floating mini controller in the active tab
function toggleMinimize() {
  // Only create mini controller if we're currently capturing
  if (!isCapturing) {
    showError("Start capture first before minimizing");
    return;
  }
  
  // IMPORTANT: Signal to the background script that we're minimizing
  // This ensures the state is preserved properly
  chrome.runtime.sendMessage({
    type: "minimizePopup",
    settings: {
      fromLang: fromLangSelect.value,
      toLang: toLangSelect.value,
      ttsEnabled: true,
      captionMode: true
    }
  }).then(() => {
    console.log("Background script notified about minimize");
    
    // Now we can safely close the popup
    window.close();
  }).catch(error => {
    console.error("Error notifying background script about minimize:", error);
    
    // Try creating mini controller anyway
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs && tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'CREATE_MINI_CONTROLLER'
        }).then(() => {
          console.log("Mini controller created, closing popup");
          window.close();
        }).catch(err => {
          console.error("Error creating mini controller:", err);
          showError("Couldn't create mini controller. Try refreshing the page.");
        });
      }
    });
  });
}

// Switch between original and translation panels
function switchPanel(panel) {
  if (panel === 'original') {
    originalTab.classList.add('active');
    translationTab.classList.remove('active');
    originalPanel.classList.remove('panel-hidden');
    translationPanel.classList.add('panel-hidden');
  } else {
    originalTab.classList.remove('active');
    translationTab.classList.add('active');
    originalPanel.classList.add('panel-hidden');
    translationPanel.classList.remove('panel-hidden');
  }
}

// Check if already running in background mode
function checkBackgroundState() {
  chrome.runtime.sendMessage({ type: "getCurrentState" }, function(response) {
    if (response) {
      console.log("Current state:", response);
      
      // If capturing in background, update UI
      if (response.isCapturing) {
        // Update UI to show background mode is active
        if (backgroundModeIndicator) {
          backgroundModeIndicator.style.display = 'block';
        }
        
        // Update language selection
        if (fromLangSelect && response.activeFromLang) {
          fromLangSelect.value = response.activeFromLang;
        }
        
        if (toLangSelect && response.activeToLang) {
          toLangSelect.value = response.activeToLang;
        }
        
        // Update global variables
        isCapturing = response.isCapturing;
        captionMode = true;
        isTtsEnabled = true;
        backgroundMode = true;
        
        // Update UI elements for capture state
        updateUIForCapture(isCapturing);
        
        // Hide info message
        if (infoMessage) {
          infoMessage.style.display = 'none';
        }
      }
    }
  });
}

// Handle messages from the background script
function handleBackgroundMessage(message) {
  console.log('Popup received message:', message);
  
  switch(message.type) {
    case "serverStatus":
      isServerRunning = message.isRunning;
      if (isServerRunning) {
        serverStatus.style.display = 'none';
        startBtn.disabled = false;
      } else {
        serverStatus.style.display = 'block';
        startBtn.disabled = true;
      }
      break;
      
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
      
    case "backgroundModeSet":
      console.log("Background mode set:", message.enabled);
      backgroundMode = true; // Always true in this version
      
      // Update UI
      if (backgroundModeIndicator) {
        backgroundModeIndicator.style.display = 'block';
      }
      break;
      
    case "transcription":
      if (message.originalText) {
        // Add to transcription panel
        addTranscription(message.originalText);
      }
      
      if (message.translatedText) {
        // Add to translation panel
        addTranslation(message.translatedText);
      }
      break;
  }
}

// Add transcription to panel
function addTranscription(text) {
  const transcriptionItem = document.createElement('div');
  transcriptionItem.className = 'transcription-item';
  transcriptionItem.textContent = text;
  transcriptionDiv.appendChild(transcriptionItem);
  transcriptionDiv.scrollTop = transcriptionDiv.scrollHeight;
}

// Add translation to panel
function addTranslation(text) {
  const translationItem = document.createElement('div');
  translationItem.className = 'transcription-item';
  translationItem.textContent = text;
  translationDiv.appendChild(translationItem);
  translationDiv.scrollTop = translationDiv.scrollHeight;
}

// Start the capture process
function startCapture() {
  console.log('Starting capture');
  
  // Check if server is running
  if (!isServerRunning) {
    showError("Flask server is not running. Please start the server first.");
    return;
  }
  
  // Clear previous content
  transcriptionDiv.innerHTML = '';
  translationDiv.innerHTML = '';
  
  // Remove any error messages
  errorContainer.innerHTML = '';
  
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
  
  // Hide info message
  if (infoMessage) {
    infoMessage.style.display = 'none';
  }
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
    
    // Ensure caption container exists since caption mode is always enabled
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs && tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, { 
          type: 'CREATE_CAPTION_CONTAINER' 
        }).catch(error => {
          console.error("Error creating caption container:", error);
          showError("Couldn't create caption container. Try refreshing the page.");
        });
      }
    });
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
    
    // Reset audio chunks
    audioChunks = [];
    processingAudio = false;
    
    // Start processing interval (process every 2 seconds)
    processingInterval = setInterval(() => {
      if (audioChunks.length > 0 && !processingAudio) {
        processAudioBatch(fromLang, toLang);
      }
    }, 2000);
    
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
      
      // Only collect if there's actual audio (not just silence)
      if (average > 10) {
        // Get audio data
        const inputData = e.inputBuffer.getChannelData(0);
        
        // Convert to the format needed (16-bit PCM)
        const pcmData = convertFloat32ToInt16(inputData);
        
        // Add to chunks for batch processing
        audioChunks.push(pcmData);
      }
    };
    
    console.log('Audio processing set up successfully');
  } catch (error) {
    console.error('Error setting up audio processing:', error);
    showError(`Error processing audio: ${error.message}`);
    stopCapture();
  }
}

// Process a batch of audio data
async function processAudioBatch(fromLang, toLang) {
  if (!audioChunks.length || processingAudio) return;
  
  processingAudio = true;
  
  try {
    // Combine audio chunks
    const combinedChunks = combineAudioChunks(audioChunks.splice(0, audioChunks.length));
    
    // Convert to base64
    const base64Audio = arrayBufferToBase64(combinedChunks.buffer);
    
    // Send to server for recognition
    const response = await fetch(`${SERVER_URL}/recognize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        audio_data: base64Audio,
        from_lang: fromLang
      })
    });
    
    const data = await response.json();
    
    if (data.text && data.text.trim()) {
      // Handle recognized text
      handleRecognizedText(data.text, fromLang, toLang);
    }
  } catch (error) {
    console.error('Error processing audio batch:', error);
    showError("Speech recognition failed. Check your connection to the server.");
  } finally {
    processingAudio = false;
  }
}

// Combine multiple audio chunks
function combineAudioChunks(chunks) {
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
    result.set(chunk, offset);
    offset += chunk.length;
  });
  
  return result;
}

// Convert ArrayBuffer to base64
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Handle recognized text
function handleRecognizedText(text, fromLang, toLang) {
  // Add to transcription panel
  addTranscription(text);
  
  try {
    // Translate the text
    fetch(`${SERVER_URL}/translate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: text,
        from_lang: fromLang,
        to_lang: toLang
      })
    })
    .then(response => response.json())
    .then(data => {
      if (data.translated_text) {
        const translatedText = data.translated_text;
        
        // Add to translation panel
        addTranslation(translatedText);
        
        // Create a unique session ID for this translation/caption/audio
        const sessionId = 'session_' + Date.now();
        
        // Always show caption since caption mode is always enabled
        updateCaptionDisplay(translatedText, toLang, sessionId);
        
        // If we're currently playing TTS, hide the previous caption
        if (currentTtsSessionId) {
          hidePreviousCaption(currentTtsSessionId);
        }
        
        // Store the session ID
        currentTtsSessionId = sessionId;
        
        // Always play TTS since it's always enabled
        playTTSDirect(translatedText, toLang, sessionId);
      }
    })
    .catch(error => {
      console.error('Translation error:', error);
      showError(`Translation error: ${error.message || "Unknown error"}`);
    });
  } catch (error) {
    console.error('Translation error:', error);
    showError(`Translation error: ${error.message || "Unknown error"}`);
  }
}

// Hide the previous caption
function hidePreviousCaption(sessionId) {
  if (!sessionId) return;
  
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (tabs && tabs.length > 0) {
      chrome.tabs.sendMessage(tabs[0].id, {
        type: 'HIDE_CAPTION',
        sessionId: sessionId
      }).catch(error => {
        console.error("Error hiding caption:", error);
      });
    }
  });
}

// Process the TTS queue - play next audio if available
function processTTSQueue() {
  if (ttsQueue.length === 0 || isPlayingTTS) {
    return;
  }
  
  isPlayingTTS = true;
  const nextItem = ttsQueue.shift();
  playTTSDirectFromQueue(nextItem.text, nextItem.language, nextItem.sessionId);
}

// Modified TTS function to use queue system
function playTTSDirect(text, language, sessionId) {
  // Add to queue instead of playing immediately
  ttsQueue.push({ text, language, sessionId });
  processTTSQueue();
}

// The actual player function (called by the queue processor)
async function playTTSDirectFromQueue(text, language, sessionId) {
  try {
    console.log(`Processing queued TTS for: "${text.substring(0, 30)}..." in language: ${language}`);
    
    // Get the voice for the language
    const voice = getVoiceForLanguage(language);
    console.log("Using voice:", voice);
    
    // Create language format for SSML
    const langCode = language.includes('-') ? language : `${language}-${language.toUpperCase()}`;
    
    // Create SSML
    const ssml = `
      <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${langCode}">
        <voice name="${voice}">
          ${escapeXml(text)}
        </voice>
      </speak>
    `;
    
    // Make API call
    const response = await fetch(TTS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3',
        'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY
      },
      body: ssml
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }
    
    // Get the audio data
    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    
    // Update caption display when audio plays
    audio.onplay = () => {
      console.log('Audio playback started for session:', sessionId);
      
      // Update caption with the session ID
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (tabs && tabs.length > 0) {
          chrome.tabs.sendMessage(tabs[0].id, {
            type: 'CAPTION',
            text: text,
            language: language,
            sessionId: sessionId
          }).catch(error => {
            console.error("Error sending caption:", error);
          });
        }
      });
    };
    
    audio.onended = () => {
      console.log('Audio playback completed for session:', sessionId);
      URL.revokeObjectURL(audioUrl); // Clean up the URL object
      
      // Mark as done playing and process next item in queue
      isPlayingTTS = false;
      
      // If this is the current session, clear it
      if (currentTtsSessionId === sessionId) {
        currentTtsSessionId = null;
      }
      
      processTTSQueue();
    };
    
    audio.onerror = (e) => {
      console.error('Audio playback error:', e);
      showError(`Audio playback error: ${e.message || 'Unknown error'}`);
      URL.revokeObjectURL(audioUrl);
      
      // Mark as done playing and process next item in queue
      isPlayingTTS = false;
      
      // If this is the current session, clear it
      if (currentTtsSessionId === sessionId) {
        currentTtsSessionId = null;
      }
      
      processTTSQueue();
    };
    
    // Play the audio
    const playPromise = audio.play();
    
    // Handle play promise
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          console.log("Audio playback started successfully");
        })
        .catch(error => {
          console.error("Audio playback failed:", error);
          showError("Audio playback failed. This might be due to browser autoplay restrictions.");
          
          // Mark as done playing and process next item even if playback fails
          isPlayingTTS = false;
          
          // If this is the current session, clear it
          if (currentTtsSessionId === sessionId) {
            currentTtsSessionId = null;
          }
          
          processTTSQueue();
        });
    }
  } catch (error) {
    console.error('TTS error:', error);
    showError(`TTS error: ${error.message}`);
    
    // Mark as done playing and process next item even if playback fails
    isPlayingTTS = false;
    
    // If this is the current session, clear it
    if (currentTtsSessionId === sessionId) {
      currentTtsSessionId = null;
    }
    
    processTTSQueue();
  }
}

// Update the caption display
function updateCaptionDisplay(text, language, sessionId) {
  // Display caption in the active tab
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (tabs && tabs.length > 0) {
      chrome.tabs.sendMessage(tabs[0].id, {
        type: 'CAPTION',
        text: text,
        language: language,
        sessionId: sessionId
      }).catch(error => {
        console.error("Error sending caption:", error);
        
        // Try creating the container first, then sending again
        chrome.tabs.sendMessage(tabs[0].id, { 
          type: 'CREATE_CAPTION_CONTAINER' 
        }).then(() => {
          // Try sending the caption again after a short delay
          setTimeout(() => {
            chrome.tabs.sendMessage(tabs[0].id, {
              type: 'CAPTION',
              text: text,
              language: language,
              sessionId: sessionId
            }).catch(err => {
              console.error("Still couldn't send caption:", err);
              showError("Caption display failed. Try refreshing the page.");
            });
          }, 500);
        }).catch(err => {
          console.error("Couldn't create caption container:", err);
          showError("Caption display failed. Try refreshing the page.");
        });
      });
    }
  });
}

// Get voice for language
function getVoiceForLanguage(language) {
  // Convert language code to match voices
  const langBase = language.split('-')[0].toLowerCase();
  
  // Get preferred gender (default to female)
  let preferredGender = 'female';
  
  // Voice mapping with gender options
  const voiceMap = {
    'en': {
      'female': 'en-US-JennyNeural',
      'male': 'en-US-GuyNeural'
    },
    'es': {
      'female': 'es-ES-ElviraNeural',
      'male': 'es-ES-AlvaroNeural'
    },
    'fr': {
      'female': 'fr-FR-DeniseNeural',
      'male': 'fr-FR-HenriNeural'
    },
    'de': {
      'female': 'de-DE-KatjaNeural',
      'male': 'de-DE-ConradNeural'
    },
    'it': {
      'female': 'it-IT-ElsaNeural',
      'male': 'it-IT-DiegoNeural'
    },
    'ja': {
      'female': 'ja-JP-NanamiNeural',
      'male': 'ja-JP-KeitaNeural'
    },
    'ko': {
      'female': 'ko-KR-SunHiNeural',
      'male': 'ko-KR-InJoonNeural'
    },
    'pt': {
      'female': 'pt-BR-FranciscaNeural',
      'male': 'pt-BR-AntonioNeural'
    },
    'ru': {
      'female': 'ru-RU-SvetlanaNeural',
      'male': 'ru-RU-DmitryNeural'
    },
    'zh': {
      'female': 'zh-CN-XiaoxiaoNeural',
      'male': 'zh-CN-YunjianNeural'
    },
    // Indian languages
    'hi': {
      'female': 'hi-IN-SwaraNeural',
      'male': 'hi-IN-MadhurNeural'
    },
    'ta': {
      'female': 'ta-IN-PallaviNeural',
      'male': 'ta-IN-ValluvarNeural'
    },
    'te': {
      'female': 'te-IN-ShrutiNeural',
      'male': 'te-IN-MohanNeural'
    },
    'mr': {
      'female': 'mr-IN-AarohiNeural',
      'male': 'mr-IN-ManoharNeural'
    },
    'gu': {
      'female': 'gu-IN-DhwaniNeural',
      'male': 'gu-IN-NiranjanNeural'
    },
    'bn': {
      'female': 'bn-IN-TanishaaNeural',
      'male': 'bn-IN-BashkarNeural'
    },
    'kn': {
      'female': 'kn-IN-SapnaNeural',
      'male': 'kn-IN-GaganNeural'
    },
    'ml': {
      'female': 'ml-IN-SobhanaNeural',
      'male': 'ml-IN-MidhunNeural'
    },
    'pa': {
      'female': 'pa-IN-GurmanNeural', 
      'male': 'pa-IN-JaskaranNeural'
    },
    'ur': {
      'female': 'ur-IN-GulNeural',
      'male': 'ur-IN-SalmanNeural'
    }
  };
  
  // If we have the language and preferred gender, return that voice
  if (voiceMap[langBase] && voiceMap[langBase][preferredGender]) {
    return voiceMap[langBase][preferredGender];
  }
  
  // Otherwise, try the female voice for that language
  if (voiceMap[langBase] && voiceMap[langBase]['female']) {
    return voiceMap[langBase]['female'];
  }
  
  // Default fallback
  return 'en-US-JennyNeural';
}

// Helper function to escape XML special characters
function escapeXml(unsafe) {
  return unsafe.replace(/[<>&'"]/g, function (c) {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
    }
  });
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
  
  // Stop processing interval
  if (processingInterval) {
    clearInterval(processingInterval);
    processingInterval = null;
  }
  
  // Clear audio chunks
  audioChunks = [];
  processingAudio = false;
  
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
    startBtn.innerHTML = '<i class="fas fa-play"></i> Start Capture';
    stopBtn.innerHTML = '<i class="fas fa-stop"></i> Stop';
    statusDiv.innerHTML = '<span class="pulse"></span> Capturing audio...';
    statusDiv.classList.add('recording');
    infoMessage.style.display = 'none';
  } else {
    startBtn.disabled = !isServerRunning;
    stopBtn.disabled = true;
    startBtn.innerHTML = '<i class="fas fa-play"></i> Start Capture';
    stopBtn.innerHTML = '<i class="fas fa-stop"></i> Stop';
    statusDiv.textContent = 'Ready to start';
    statusDiv.classList.remove('recording');
    audioLevelBar.style.width = '0%';
    
    // Only show info message if not in background mode
    if (!backgroundMode) {
      infoMessage.style.display = 'block';
    }
  }
}

// Display error message
function showError(message) {
  console.error('Error:', message);
  
  const errorDiv = document.createElement('div');
  errorDiv.classList.add('error-message');
  
  const errorText = document.createElement('span');
  errorText.textContent = message;
  
  const closeButton = document.createElement('button');
  closeButton.classList.add('error-close');
  closeButton.innerHTML = '&times;';
  closeButton.addEventListener('click', function() {
    errorDiv.remove();
  });
  
  errorDiv.appendChild(errorText);
  errorDiv.appendChild(closeButton);
  
  errorContainer.appendChild(errorDiv);
  
  // Auto-hide after 5 seconds
  setTimeout(() => {
    if (errorDiv.parentNode) {
      errorDiv.style.opacity = '0';
      errorDiv.style.transform = 'translateY(-10px)';
      setTimeout(() => {
        if (errorDiv.parentNode) {
          errorDiv.remove();
        }
      }, 300);
    }
  }, 5000);
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