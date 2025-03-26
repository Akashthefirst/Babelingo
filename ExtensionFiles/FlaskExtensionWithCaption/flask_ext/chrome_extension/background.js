// Global variables for state tracking
let isCapturing = false;
let isBackgroundActive = false;
let activeTabId = null;
let ports = {};
let activeFromLang = 'en-US';
let activeToLang = 'es';
let isTtsEnabled = true;
let captionMode = false;
let mediaStreamId = null;
let mediaStream = null;
let audioContext = null;
let audioProcessor = null;
let audioAnalyser = null;
let audioChunks = [];
let processingAudio = false;
let processingInterval = null;
let lastSessionId = null;

// Queue system for TTS playback
let ttsQueue = [];
let isPlayingTTS = false;

// Server URL and API
const SERVER_URL = 'http://127.0.0.1:5015';
const TTS_ENDPOINT = 'https://eastus2.tts.speech.microsoft.com/cognitiveservices/v1';
const SUBSCRIPTION_KEY = 'Fj1KPt7grC6bAkNja7daZUstpP8wZTXsV6Zjr2FOxkO7wsBQ5SzQJQQJ99BCACHYHv6XJ3w3AAAAACOGL3Xg';

// Indicate background service worker has started
console.log('Background service worker started');

// Keep service worker alive
let keepAliveInterval = setInterval(() => {
    console.log('Background service worker active, capturing:', isCapturing, 'background mode:', isBackgroundActive);
}, 20000);

// Check if Flask server is running
async function checkServerStatus() {
    try {
        const response = await fetch(`${SERVER_URL}/health`);
        const data = await response.json();
        return data.status === 'OK';
    } catch (error) {
        console.error('Flask server is not running:', error);
        return false;
    }
}

// Register service worker wakeup for Manifest V3
chrome.alarms.create('keepAlive', { periodInMinutes: 1 });

// Keep alive listener
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepAlive') {
    console.log('Keeping background service worker alive');
    
    // Request an active tab to keep the service worker active
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs && tabs.length > 0) {
        // Small no-op operation to keep worker active
        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: () => { return true; }
        }).catch(() => {}); // Ignore any errors
      }
    });
    
    // Log capture state
    if (isCapturing) {
      console.log('Still capturing audio');
      
      // Ping server to keep connection alive
      fetch(`${SERVER_URL}/health`)
        .then(response => response.json())
        .catch(error => console.log('Health check error:', error));
    }
  }
});

// Store active capture state in chrome.storage.local
function storeActiveState() {
  if (isCapturing && isBackgroundActive) {
    chrome.storage.local.set({
      captureActive: true,
      activeFromLang: activeFromLang,
      activeToLang: activeToLang,
      activeTabId: activeTabId,
      mediaStreamId: mediaStreamId,
      isTtsEnabled: isTtsEnabled,
      captionMode: captionMode
    });
    console.log("Stored active capture state to local storage");
  }
}

// Handle port connections (from popup)
chrome.runtime.onConnect.addListener(function(port) {
    console.log('Connected to port:', port.name);
    
    // Store the port
    const portId = port.name || 'default';
    ports[portId] = port;
    
    // Set up message listener
    port.onMessage.addListener(async function(message) {
        console.log('Background received message:', message);
        
        if (message.action === "checkServer") {
            const isServerRunning = await checkServerStatus();
            port.postMessage({
                type: "serverStatus",
                isRunning: isServerRunning
            });
        }
        else if (message.action === "startCapture") {
            await handleStartCapture(port, message);
        } 
        else if (message.action === "stopCapture") {
            handleStopCapture(port);
        }
        else if (message.action === "setBackgroundMode") {
            handleSetBackgroundMode(message.enabled, message.settings || {});
            port.postMessage({
                type: "backgroundModeSet",
                enabled: message.enabled
            });
        }
    });
    
    // Handle disconnection
    port.onDisconnect.addListener(function() {
        console.log('Port disconnected:', portId);
        delete ports[portId];
        
        // Store state when port disconnects if capturing is active
        if (isCapturing && isBackgroundActive) {
            storeActiveState();
        }
    });
});

// Listen for runtime messages
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    console.log('Background received runtime message:', message);
    
    if (message.type === "getCurrentState") {
        sendResponse({
            isCapturing: isCapturing,
            isBackgroundActive: isBackgroundActive,
            activeFromLang: activeFromLang,
            activeToLang: activeToLang,
            isTtsEnabled: isTtsEnabled,
            captionMode: captionMode
        });
        return true;
    }
    else if (message.type === "setBackgroundMode") {
        handleSetBackgroundMode(message.enabled, message.settings || {});
        
        // Create mini controller in active tab if enabling background mode
        if (message.enabled && activeTabId) {
            chrome.tabs.sendMessage(activeTabId, {
                type: 'CREATE_MINI_CONTROLLER'
            }).catch(error => {
                console.error("Error creating mini controller:", error);
            });
        }
        
        sendResponse({success: true});
        return true;
    }
    else if (message.type === "CAPTION_READY") {
        console.log("Caption system ready in tab:", sender.tab?.id);
        
        // If caption mode is active and we're capturing, send test caption
        if (captionMode && isCapturing) {
            try {
                chrome.tabs.sendMessage(sender.tab.id, {
                    type: 'SHOW_TEST_CAPTION'
                });
            } catch (error) {
                console.error("Error sending test caption:", error);
            }
        }
        
        // If we're in background mode, also create the mini controller
        if (isBackgroundActive && isCapturing) {
            try {
                chrome.tabs.sendMessage(sender.tab.id, {
                    type: 'CREATE_MINI_CONTROLLER'
                });
            } catch (error) {
                console.error("Error creating mini controller:", error);
            }
        }
        
        sendResponse({success: true});
        return true;
    }
    // Add handler for hiding captions
    else if (message.type === "HIDE_CAPTION") {
        console.log("Hide caption request received for session:", message.sessionId);
        
        try {
            chrome.tabs.sendMessage(activeTabId, {
                type: 'HIDE_CAPTION',
                sessionId: message.sessionId
            });
        } catch (error) {
            console.error("Error hiding caption:", error);
        }
        
        sendResponse({success: true});
        return true;
    }
    // Handle stopCapture requests from mini controller
    else if (message.type === "stopCapture") {
        console.log("Stop capture request from mini controller");
        stopCapture();
        
        // Clear stored state
        chrome.storage.local.remove(['captureActive', 'activeFromLang', 'activeToLang', 
                                     'activeTabId', 'mediaStreamId', 'isTtsEnabled', 'captionMode']);
        
        // Notify all connected popups
        Object.values(ports).forEach(port => {
            try {
                port.postMessage({
                    type: "captureStopped"
                });
            } catch (e) {
                console.error("Error notifying port about capture stop:", e);
            }
        });
        
        sendResponse({success: true});
        return true;
    }
    // Handle openPopup requests from mini controller
    else if (message.type === "openPopup") {
        console.log("Request to open popup from mini controller");
        
        // Store state before opening popup
        if (isCapturing && isBackgroundActive) {
            storeActiveState();
        }
        
        // Open the extension popup
        chrome.action.openPopup();
        
        sendResponse({success: true});
        return true;
    }
    // Handle minimize requests from popup
    else if (message.type === "minimizePopup") {
        console.log("Minimize request from popup");
        
        // Update settings if provided
        if (message.settings) {
            if (message.settings.fromLang) activeFromLang = message.settings.fromLang;
            if (message.settings.toLang) activeToLang = message.settings.toLang;
            if (message.settings.ttsEnabled !== undefined) isTtsEnabled = message.settings.ttsEnabled;
            if (message.settings.captionMode !== undefined) captionMode = message.settings.captionMode;
        }
        
        // Store active state when minimizing
        if (isCapturing) {
            isBackgroundActive = true;
            storeActiveState();
            
            // Create mini controller in the active tab
            if (activeTabId) {
                chrome.tabs.sendMessage(activeTabId, {
                    type: 'CREATE_MINI_CONTROLLER'
                }).catch(error => {
                    console.error("Error creating mini controller on minimize:", error);
                });
            }
        }
        
        sendResponse({success: true});
        return true;
    }
});

// Enable or disable background mode
function handleSetBackgroundMode(enabled, settings) {
    isBackgroundActive = enabled;
    console.log(`Background mode ${enabled ? 'enabled' : 'disabled'}`);
    
    // Store settings
    if (settings) {
        if (settings.fromLang) activeFromLang = settings.fromLang;
        if (settings.toLang) activeToLang = settings.toLang;
        if (settings.ttsEnabled !== undefined) isTtsEnabled = settings.ttsEnabled;
        if (settings.captionMode !== undefined) captionMode = settings.captionMode;
    }
    
    // Save settings to storage
    chrome.storage.sync.set({
        backgroundMode: enabled,
        fromLang: activeFromLang,
        toLang: activeToLang,
        ttsEnabled: isTtsEnabled,
        captionMode: captionMode
    });
    
    // Store more detailed state if capture is active
    if (isCapturing && enabled) {
        storeActiveState();
    }
    
    // CRITICAL: We need to ensure mediaStreamId is preserved and restore capture
    // even if we're already capturing - this ensures continued operation after minimizing
    if (enabled && mediaStreamId) {
        // Stop and restart capture to ensure it works after minimizing
        const tempStreamId = mediaStreamId;
        
        // Don't actually stop capturing if we're already active
        if (isCapturing) {
            // Just recreate the stream with the existing ID
            console.log("Refreshing audio capture for background mode");
            
            // Get the media stream anew
            navigator.mediaDevices.getUserMedia({
                audio: {
                    mandatory: {
                        chromeMediaSource: 'tab',
                        chromeMediaSourceId: tempStreamId
                    }
                },
                video: false
            }).then(stream => {
                // If we already had a stream, stop its tracks
                if (mediaStream) {
                    mediaStream.getTracks().forEach(track => track.stop());
                }
                
                mediaStream = stream;
                
                // Set up audio processing
                setupAudioProcessing(mediaStream, activeFromLang, activeToLang);
                
                console.log("Audio capture refreshed successfully");
                
                // Create mini controller in active tab
                if (activeTabId) {
                    try {
                        chrome.tabs.sendMessage(activeTabId, {
                            type: 'CREATE_MINI_CONTROLLER'
                        }).catch(error => {
                            console.error("Error creating mini controller:", error);
                        });
                    } catch (error) {
                        console.error("Error sending message to tab:", error);
                    }
                }
            }).catch(error => {
                console.error("Error refreshing capture:", error);
            });
        } else {
            restoreCapture();
        }
    }
}

// Handle start capture request
async function handleStartCapture(port, message) {
    try {
        // Check if the server is running
        const isServerRunning = await checkServerStatus();
        if (!isServerRunning) {
            throw new Error("Flask server is not running. Please start the server and try again.");
        }
        
        console.log('Starting capture process');
        
        // Get the active tab
        const tabs = await chrome.tabs.query({active: true, currentWindow: true});
        if (!tabs || tabs.length === 0) {
            throw new Error("No active tab found");
        }
        
        const activeTab = tabs[0];
        activeTabId = activeTab.id;
        
        // Store language settings
        activeFromLang = message.fromLang || activeFromLang;
        activeToLang = message.toLang || activeToLang;
        
        console.log('Active tab:', activeTabId);
        
        // Generate a media stream ID for the active tab
        const streamId = await chrome.tabCapture.getMediaStreamId({
            targetTabId: activeTabId
        });
        
        // Store the stream ID for background use
        mediaStreamId = streamId;
        
        console.log('Stream ID obtained:', streamId ? 'Success' : 'Failed');
        
        // Send the stream ID back to the popup
        port.postMessage({
            type: "mediaStreamId",
            streamId: streamId,
            langData: {
                fromLang: activeFromLang,
                toLang: activeToLang
            }
        });
        
        isCapturing = true;
        
        // Store state if in background mode
        if (isBackgroundActive) {
            storeActiveState();
        }
        
        // Make sure caption container exists if caption mode is active
        if (captionMode) {
            ensureCaptionContainer();
        }
        
    } catch (error) {
        console.error('Error starting capture:', error);
        port.postMessage({
            type: "error",
            message: error.message
        });
    }
}

// Restore capture for background mode
async function restoreCapture() {
    try {
        if (!mediaStreamId || !activeTabId) {
            console.log("Can't restore capture: missing streamId or activeTabId");
            return;
        }
        
        console.log("Restoring capture in background mode");
        
        // Create constraints with the stream ID
        const constraints = {
            audio: {
                mandatory: {
                    chromeMediaSource: 'tab',
                    chromeMediaSourceId: mediaStreamId
                }
            },
            video: false
        };
        
        // Get the media stream
        mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // Set up audio processing
        setupAudioProcessing(mediaStream, activeFromLang, activeToLang);
        
        isCapturing = true;
        
        console.log("Capture restored in background mode");
        
    } catch (error) {
        console.error("Error restoring capture:", error);
        isCapturing = false;
    }
}

// Set up audio processing in the background
function setupAudioProcessing(stream, fromLang, toLang) {
    try {
        console.log('Setting up audio processing in background');
        
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
        
        console.log('Audio processing set up successfully in background');
    } catch (error) {
        console.error('Error setting up audio processing:', error);
    }
}

// Process a batch of audio data in the background
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
            // Handle recognized text in background
            handleRecognizedText(data.text, fromLang, toLang);
        }
    } catch (error) {
        console.error('Error processing audio batch in background:', error);
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

// Handle recognized text in background
async function handleRecognizedText(text, fromLang, toLang) {
    console.log("Background processing recognized text:", text);
    
    try {
        // Translate the text
        const response = await fetch(`${SERVER_URL}/translate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                text: text,
                from_lang: fromLang,
                to_lang: toLang
            })
        });
        
        const data = await response.json();
        
        if (data.translated_text) {
            const translatedText = data.translated_text;
            console.log("Background translation:", translatedText);
            
            // Generate a unique session ID
            const sessionId = 'bg_session_' + Date.now();
            
            // Send notification to any connected ports
            Object.values(ports).forEach(port => {
                try {
                    port.postMessage({
                        type: "transcription",
                        originalText: text,
                        translatedText: translatedText,
                        sessionId: sessionId
                    });
                } catch (e) {
                    console.error("Error sending to port:", e);
                }
            });
            
            // If caption mode is active, display captions
            if (captionMode && activeTabId) {
                // Hide previous caption if applicable
                if (lastSessionId) {
                    chrome.tabs.sendMessage(activeTabId, {
                        type: 'HIDE_CAPTION',
                        sessionId: lastSessionId
                    }).catch(error => {
                        console.error("Error hiding previous caption:", error);
                    });
                }
                
                // Store current session ID
                lastSessionId = sessionId;
                
                // Show new caption
                showCaption(translatedText, toLang, sessionId);
            }
            
            // If TTS is enabled, play the translation
            if (isTtsEnabled) {
                playTTSDirect(translatedText, toLang, sessionId);
            }
        }
    } catch (error) {
        console.error('Background translation error:', error);
    }
}

// Display caption in the active tab
function showCaption(text, language, sessionId) {
    if (!captionMode || !activeTabId) return;
    
    console.log("Showing caption in tab:", activeTabId, "SessionId:", sessionId);
    
    // First make sure the tab still exists
    chrome.tabs.get(activeTabId, (tab) => {
        if (chrome.runtime.lastError) {
            console.error("Tab no longer exists:", chrome.runtime.lastError);
            return;
        }
        
        // Send caption to tab
        chrome.tabs.sendMessage(activeTabId, {
            type: 'CAPTION',
            text: text,
            language: language,
            sessionId: sessionId
        }).catch(error => {
            console.error("Error sending caption to tab:", error);
            
            // Try to create the container first then send again
            ensureCaptionContainer();
        });
    });
}

// Ensure caption container exists in the active tab
function ensureCaptionContainer() {
    if (!activeTabId) return;
    
    chrome.tabs.get(activeTabId, (tab) => {
        if (chrome.runtime.lastError) {
            console.error("Tab no longer exists:", chrome.runtime.lastError);
            return;
        }
        
        chrome.tabs.sendMessage(activeTabId, {
            type: 'CREATE_CAPTION_CONTAINER'
        }).catch(error => {
            console.error("Error creating caption container:", error);
            
            // Try using executeScript as a fallback
            chrome.scripting.executeScript({
                target: { tabId: activeTabId },
                function: function() {
                    // Create the caption container if it doesn't exist
                    if (!document.getElementById('web-caption-container')) {
                        const container = document.createElement('div');
                        container.id = 'web-caption-container';
                        container.style.cssText = `
                            position: fixed;
                            left: 50%;
                            transform: translateX(-50%);
                            bottom: 80px;
                            background-color: rgba(0, 0, 0, 0.7);
                            color: white;
                            padding: 15px 20px;
                            text-align: center;
                            z-index: 10000;
                            font-size: 20px;
                            max-width: 80%;
                            border-radius: 12px;
                            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
                            opacity: 1;
                            transition: opacity 0.3s ease;
                            cursor: move;
                        `;
                        
                        // Add drag handle
                        const dragHandle = document.createElement('div');
                        dragHandle.id = 'caption-drag-handle';
                        dragHandle.style.cssText = `
                            height: 6px;
                            width: 40px;
                            background-color: rgba(255, 255, 255, 0.3);
                            border-radius: 3px;
                            margin: 0 auto 10px;
                            cursor: move;
                        `;
                        container.appendChild(dragHandle);
                        
                        // Session ID element (hidden)
                        const sessionIdElement = document.createElement('div');
                        sessionIdElement.id = 'caption-session-id';
                        sessionIdElement.style.display = 'none';
                        container.appendChild(sessionIdElement);
                        
                        // Caption text element
                        const captionText = document.createElement('div');
                        captionText.id = 'web-caption-text';
                        container.appendChild(captionText);
                        
                        // Progress bar
                        const progressBar = document.createElement('div');
                        progressBar.id = 'caption-progress-bar';
                        progressBar.style.cssText = `
                            width: 100%;
                            height: 4px;
                            background-color: rgba(255, 255, 255, 0.2);
                            border-radius: 2px;
                            margin-top: 10px;
                            overflow: hidden;
                        `;
                        
                        const progressIndicator = document.createElement('div');
                        progressIndicator.id = 'caption-progress-indicator';
                        progressIndicator.style.cssText = `
                            height: 100%;
                            width: 0%;
                            background-color: #4CAF50;
                            border-radius: 2px;
                            transition: width 0.1s linear;
                        `;
                        
                        progressBar.appendChild(progressIndicator);
                        container.appendChild(progressBar);
                        
                        // Add to body
                        document.body.appendChild(container);
                        
                        // Make draggable (simplified version)
                        container.addEventListener('mousedown', function(e) {
                            if (e.target.id !== 'web-caption-container' && 
                                e.target.id !== 'caption-drag-handle') return;
                                
                            const rect = container.getBoundingClientRect();
                            const offsetX = e.clientX - rect.left;
                            const offsetY = e.clientY - rect.top;
                            
                            function moveAt(x, y) {
                                container.style.left = (x - offsetX) + 'px';
                                container.style.top = (y - offsetY) + 'px';
                                container.style.transform = 'none';
                                container.style.bottom = 'auto';
                            }
                            
                            function onMouseMove(e) {
                                moveAt(e.clientX, e.clientY);
                            }
                            
                            document.addEventListener('mousemove', onMouseMove);
                            
                            document.addEventListener('mouseup', function() {
                                document.removeEventListener('mousemove', onMouseMove);
                            }, { once: true });
                        });
                    }
                }
            });
        });
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

// Add to TTS queue
function playTTSDirect(text, language, sessionId) {
    ttsQueue.push({ text, language, sessionId });
    processTTSQueue();
}

// The actual player function (called by the queue processor)
async function playTTSDirectFromQueue(text, language, sessionId) {
    try {
        console.log(`Background processing queued TTS for: "${text.substring(0, 30)}..." in language: ${language}, sessionId: ${sessionId}`);
        
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
        const audioData = await response.arrayBuffer();
        
        // Create an audio context
        const audioCtx = new AudioContext();
        
        // Decode the audio data
        const audioBuffer = await audioCtx.decodeAudioData(audioData);
        
        // Create a source node
        const source = audioCtx.createBufferSource();
        source.buffer = audioBuffer;
        
        // Connect the source to the destination
        source.connect(audioCtx.destination);
        
        // If caption mode is active, show caption synchronized with audio
        if (captionMode && activeTabId) {
            showCaption(text, language, sessionId);
        }
        
        // When the audio ends, process the next item in the queue
        source.onended = function() {
            audioCtx.close();
            console.log("Background TTS playback completed");
            isPlayingTTS = false;
            processTTSQueue();
        };
        
        // Start playback
        source.start(0);
        console.log("Background TTS playback started");
        
    } catch (error) {
        console.error('Background TTS error:', error);
        
        // Mark as done playing and process next item in queue
        isPlayingTTS = false;
        processTTSQueue();
    }
}

// Get voice for language
function getVoiceForLanguage(language) {
    // Convert language code to match voices
    const langBase = language.split('-')[0].toLowerCase();
    
    // Get preferred gender (read from storage, default to female)
    let preferredGender = 'female';
    chrome.storage.sync.get(['voiceGender'], function(result) {
        if (result.voiceGender) {
            preferredGender = result.voiceGender;
        }
    });
    
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

// Handle stop capture request
function handleStopCapture(port) {
    console.log('Stopping capture');
    
    // Only stop completely if not in background mode
    if (!isBackgroundActive) {
        stopCapture();
    } else {
        console.log("Background mode active, capture continues to run in background");
    }
    
    // Notify the popup
    port.postMessage({
        type: "captureStopped"
    });
}

// Stop capture completely
function stopCapture() {
    console.log('Stopping all capture');
    isCapturing = false;
    
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
            audioContext = null;
        }).catch(err => {
            console.error('Error closing audio context:', err);
        });
    }
    
    // Clear media stream ID
    mediaStreamId = null;
    
    // Clear stored capture state from local storage
    chrome.storage.local.remove(['captureActive', 'activeFromLang', 'activeToLang', 
                                'activeTabId', 'mediaStreamId', 'isTtsEnabled', 'captionMode']);
}

// Handle tab closing
chrome.tabs.onRemoved.addListener(function(tabId) {
    if (tabId === activeTabId) {
        console.log('Active tab closed');
        
        // If background mode is enabled, just mark the tab as inactive
        if (isBackgroundActive) {
            activeTabId = null;
            console.log('Background mode active, capture continues to run');
        } else {
            // Otherwise stop capturing
            console.log('Stopping capture due to tab close');
            stopCapture();
            
            // Notify all connected popups
            Object.values(ports).forEach(port => {
                port.postMessage({
                    type: "captureStopped"
                });
            });
        }
    }
});

// Handle tab switching - important for keeping the activeTabId up to date
chrome.tabs.onActivated.addListener(function(activeInfo) {
    // Only update if we're in background mode
    if (isBackgroundActive && isCapturing) {
        console.log('Tab switched, updating activeTabId from', activeTabId, 'to', activeInfo.tabId);
        activeTabId = activeInfo.tabId;
        
        // If caption mode is active, ensure caption container exists in the new tab
        if (captionMode) {
            ensureCaptionContainer();
        }
    }
});

// Startup handling
chrome.runtime.onStartup.addListener(() => {
    console.log("Extension starting up");
    loadSavedSettings();
});

// Install handling
chrome.runtime.onInstalled.addListener(() => {
    console.log("Extension installed or updated");
    loadSavedSettings();
});

// Load saved settings and restore any active capture state
function loadSavedSettings() {
    // Load general settings
    chrome.storage.sync.get(['backgroundMode', 'fromLang', 'toLang', 'ttsEnabled', 'captionMode'], function(result) {
        isBackgroundActive = result.backgroundMode === true;
        
        if (result.fromLang) activeFromLang = result.fromLang;
        if (result.toLang) activeToLang = result.toLang;
        if (result.ttsEnabled !== undefined) isTtsEnabled = result.ttsEnabled;
        if (result.captionMode !== undefined) captionMode = result.captionMode;
        
        console.log('Loaded settings from storage:', {
            isBackgroundActive, activeFromLang, activeToLang, isTtsEnabled, captionMode
        });
        
        // Check for active capture state
        chrome.storage.local.get(['captureActive', 'activeFromLang', 'activeToLang', 'activeTabId', 
                                  'mediaStreamId', 'isTtsEnabled', 'captionMode'], function(state) {
            if (state.captureActive) {
                console.log("Restoring active capture state from storage");
                
                // Restore settings
                if (state.activeFromLang) activeFromLang = state.activeFromLang;
                if (state.activeToLang) activeToLang = state.activeToLang;
                if (state.activeTabId) activeTabId = state.activeTabId;
                if (state.mediaStreamId) mediaStreamId = state.mediaStreamId;
                if (state.isTtsEnabled !== undefined) isTtsEnabled = state.isTtsEnabled;
                if (state.captionMode !== undefined) captionMode = state.captionMode;
                
                // Set background mode
                isBackgroundActive = true;
                
                // Wait a moment for extension to initialize
                setTimeout(() => {
                    // Try to restore capture
                    restoreCapture();
                }, 1000);
            }
        });
    });
}