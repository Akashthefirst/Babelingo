// This content script runs in the context of web pages
console.log("Web Audio Transcribe & Translate content script loaded");

// Caption container elements
let captionContainer = null;
let captionText = null;
let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;
let captionIntervals = {};
let captionTimers = {};
let activeSessionId = null;
let lastSessionId = null;

// Create the caption container
function createCaptionContainer() {
  console.log("Creating caption container");
  
  // Remove existing container if any
  let existingContainer = document.getElementById('web-caption-container');
  if (existingContainer) {
    existingContainer.remove();
  }
  
  // Load saved position
  let captionPosition = { bottom: '80px', left: '50%', transform: 'translateX(-50%)', top: 'auto' };
  try {
    const savedPosition = localStorage.getItem('captionContainerPosition');
    if (savedPosition) {
      captionPosition = JSON.parse(savedPosition);
    }
  } catch (e) {
    console.error("Error loading caption position:", e);
  }
  
  // Create the caption container
  captionContainer = document.createElement('div');
  captionContainer.id = 'web-caption-container';
  captionContainer.style.cssText = `
    position: fixed;
    z-index: 10000;
    background-color: rgba(0, 0, 0, 0.75);
    color: white;
    padding: 15px 20px;
    border-radius: 12px;
    box-shadow: 0 8px 16px rgba(0, 0, 0, 0.3);
    min-width: 200px;
    max-width: 80%;
    font-family: 'Segoe UI', Arial, sans-serif;
    font-size: 18px;
    line-height: 1.5;
    cursor: move;
    user-select: none;
    text-align: center;
    display: flex;
    flex-direction: column;
    bottom: 80px;
    left: 50%;
    transform: translateX(-50%);
    opacity: 0;
    transition: opacity 0.3s ease;
  `;
  
  // Apply saved position
  if (captionPosition.top !== 'auto') captionContainer.style.top = captionPosition.top;
  if (captionPosition.bottom !== 'auto') captionContainer.style.bottom = captionPosition.bottom;
  if (captionPosition.left) captionContainer.style.left = captionPosition.left;
  if (captionPosition.transform) captionContainer.style.transform = captionPosition.transform;
  
  // Add a handle for dragging
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
  captionContainer.appendChild(dragHandle);
  
  // Caption session ID (hidden)
  const sessionIdElement = document.createElement('div');
  sessionIdElement.id = 'caption-session-id';
  sessionIdElement.style.display = 'none';
  captionContainer.appendChild(sessionIdElement);
  
  // Caption text
  captionText = document.createElement('div');
  captionText.id = 'web-caption-text';
  captionText.style.cssText = `
    width: 100%;
    line-height: 1.5;
    word-spacing: 2px;
    text-shadow: 1px 1px 1px rgba(0, 0, 0, 0.5);
  `;
  
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
  captionContainer.appendChild(captionText);
  captionContainer.appendChild(progressBar);
  
  // Add to the body
  document.body.appendChild(captionContainer);
  
  // Set up dragging
  setupDragging(captionContainer);
  
  console.log("Caption container created");
  
  return captionContainer;
}

// Set up dragging functionality
function setupDragging(element) {
  element.addEventListener('mousedown', startDrag);
  
  function startDrag(e) {
    // Only allow dragging by the element itself or the handle
    if (e.target.id !== 'web-caption-container' && e.target.id !== 'caption-drag-handle') {
      return;
    }
    
    e.preventDefault();
    isDragging = true;
    
    // Calculate the offset
    const rect = element.getBoundingClientRect();
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;
    
    // Add the move and end events
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', endDrag);
    
    // Change cursor and opacity during drag
    element.style.opacity = '0.8';
  }
  
  function drag(e) {
    if (!isDragging) return;
    
    // Set the new position
    const left = e.clientX - dragOffsetX;
    const top = e.clientY - dragOffsetY;
    
    element.style.left = left + 'px';
    element.style.top = top + 'px';
    element.style.bottom = 'auto';
    element.style.transform = 'none';
  }
  
  function endDrag() {
    if (!isDragging) return;
    
    isDragging = false;
    document.removeEventListener('mousemove', drag);
    document.removeEventListener('mouseup', endDrag);
    
    // Restore opacity
    element.style.opacity = '1';
    
    // Save the position
    const position = {
      top: element.style.top,
      bottom: element.style.bottom,
      left: element.style.left,
      transform: element.style.transform
    };
    
    localStorage.setItem('captionContainerPosition', JSON.stringify(position));
  }
}

// Show caption with word highlighting
function showCaption(text, language = 'en', duration = 0, sessionId = null) {
  console.log("Showing caption:", text, "SessionId:", sessionId);
  
  // If no session ID provided, generate one
  if (!sessionId) {
    sessionId = 'caption_' + Date.now();
  }
  
  // IMPORTANT: Clear ALL previous sessions immediately
  Object.keys(captionIntervals).forEach(id => {
    clearCaptionInterval(id);
  });
  
  // Store the active session ID
  lastSessionId = activeSessionId;
  activeSessionId = sessionId;
  
  // Ensure container exists
  if (!captionContainer || !document.body.contains(captionContainer)) {
    captionContainer = createCaptionContainer();
  }
  
  // Store session ID
  const sessionIdElement = document.getElementById('caption-session-id');
  if (sessionIdElement) {
    sessionIdElement.textContent = sessionId;
  }
  
  // Make sure we have the caption text element
  captionText = document.getElementById('web-caption-text');
  if (!captionText) {
    return;
  }
  
  // Split the text into words
  const words = text.split(' ');
  
  // Create spans for each word for highlighting
  const wordSpans = words.map((word, index) => {
    return `<span id="caption-word-${sessionId}-${index}" class="caption-word caption-unspoken-word">${word}</span>`;
  }).join(' ');
  
  // Set the text with spans
  captionText.innerHTML = wordSpans;
  
  // Set language attribute for proper font rendering
  captionContainer.setAttribute('lang', language);
  
  // Show the container with a nice animation
  captionContainer.style.opacity = '1';
  
  // Calculate speech duration based on text length and language
  const totalTextLength = text.length;
  // Speed varies by language: Asian languages are slower, some European languages are faster
  const speedFactors = {
    'zh': 0.7, // Chinese
    'ja': 0.7, // Japanese
    'ko': 0.8, // Korean
    'es': 1.2, // Spanish
    'fr': 1.2, // French
    'en': 1.0, // English (baseline)
    'de': 0.9, // German
  };
  const speedFactor = speedFactors[language.split('-')[0]] || 1.0;
  
  // Base duration plus additional time per character, adjusted by language
  const estimatedTotalDuration = (1000 + (totalTextLength * 50)) / speedFactor;
  
  // Generate word timings
  const wordTimings = words.map(word => {
    // Calculate word proportion of total text
    const wordProportion = word.length / totalTextLength;
    // Allocate time based on proportion plus a small fixed time
    return Math.max(100, Math.floor(wordProportion * estimatedTotalDuration) + 100);
  });
  
  // Set up the progress bar
  const progressIndicator = document.getElementById('caption-progress-indicator');
  if (progressIndicator) {
    progressIndicator.style.width = '0%';
  }
  
  // Store timing info for this session
  captionTimers[sessionId] = {
    words: words,
    timings: wordTimings,
    totalDuration: estimatedTotalDuration,
    startTime: Date.now(),
    currentIndex: 0
  };
  
  // Use exact timers for each word rather than intervals
  scheduleWordHighlighting(sessionId, 0, 0);
  
  // Auto-hide after duration if specified
  if (duration > 0) {
    setTimeout(() => {
      hideCaption(sessionId);
    }, duration);
  }
}

// Schedule highlighting for each word with precise timing
function scheduleWordHighlighting(sessionId, wordIndex, elapsedTime) {
  const timer = captionTimers[sessionId];
  if (!timer || !timer.words || activeSessionId !== sessionId) {
    return;
  }
  
  // Get total words
  const totalWords = timer.words.length;
  
  if (wordIndex >= totalWords) {
    // We've reached the end
    const progressIndicator = document.getElementById('caption-progress-indicator');
    if (progressIndicator) {
      progressIndicator.style.width = '100%';
    }
    // Reset all words to default style
    for (let i = 0; i < totalWords; i++) {
      const wordEl = document.getElementById(`caption-word-${sessionId}-${i}`);
      if (wordEl) {
        wordEl.className = 'caption-word caption-spoken-word';
      }
    }
    return;
  }
  
  // Highlight current word
  setTimeout(() => {
    // Check if this session is still active
    if (activeSessionId !== sessionId) {
      return;
    }
    
    // Update all words (mark previous as spoken, current as active, rest as unspoken)
    for (let i = 0; i < totalWords; i++) {
      const wordEl = document.getElementById(`caption-word-${sessionId}-${i}`);
      if (!wordEl) continue;
      
      if (i < wordIndex) {
        wordEl.className = 'caption-word caption-spoken-word';
      } else if (i === wordIndex) {
        wordEl.className = 'caption-word caption-active-word';
      } else {
        wordEl.className = 'caption-word caption-unspoken-word';
      }
    }
    
    // Update progress bar
    const progressIndicator = document.getElementById('caption-progress-indicator');
    if (progressIndicator) {
      const progress = (elapsedTime / timer.totalDuration) * 100;
      progressIndicator.style.width = `${Math.min(100, progress)}%`;
    }
    
    // Schedule next word
    const nextElapsedTime = elapsedTime + timer.timings[wordIndex];
    scheduleWordHighlighting(sessionId, wordIndex + 1, nextElapsedTime);
    
  }, wordIndex === 0 ? 0 : timer.timings[wordIndex - 1]);
}

// Clear caption interval for a specific session
function clearCaptionInterval(sessionId) {
  if (captionIntervals[sessionId]) {
    clearInterval(captionIntervals[sessionId]);
    delete captionIntervals[sessionId];
  }
  
  // Clean up timer data
  delete captionTimers[sessionId];
}

// Hide caption
function hideCaption(sessionId = null) {
  if (!captionContainer) return;
  
  // If sessionId is provided, only hide if it matches the active session
  if (sessionId && sessionId !== activeSessionId) {
    return;
  }
  
  captionContainer.style.opacity = '0';
  
  // Clean up all intervals if no specific session is provided
  if (!sessionId) {
    Object.keys(captionIntervals).forEach(id => {
      clearCaptionInterval(id);
    });
  } else {
    clearCaptionInterval(sessionId);
  }
}

// Remove caption container
function removeCaptionContainer() {
  // Clear all intervals
  Object.keys(captionIntervals).forEach(id => {
    clearCaptionInterval(id);
  });
  
  if (captionContainer) {
    captionContainer.remove();
    captionContainer = null;
  }
}

// Create the mini controller
function createMiniController() {
  // First check if it already exists
  if (document.getElementById('audio-translator-mini')) {
    console.log("Mini controller already exists, not creating a new one");
    return;
  }

  console.log("Creating mini controller");

  // Create container
  const miniController = document.createElement('div');
  miniController.id = 'audio-translator-mini';
  miniController.style.cssText = `
    position: fixed;
    right: 20px;
    top: 20px;
    width: 240px;
    background-color: #ffffff;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    border-radius: 12px;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    transition: all 0.3s ease;
    border: 1px solid rgba(0, 0, 0, 0.1);
  `;

  // Create header with drag handle
  const header = document.createElement('div');
  header.style.cssText = `
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 15px;
    background-color: #4361ee;
    color: white;
    font-family: 'Segoe UI', Arial, sans-serif;
    font-size: 14px;
    font-weight: 600;
    cursor: move;
    user-select: none;
  `;
  header.textContent = 'Audio Translator';

  // Create controls
  const buttonsContainer = document.createElement('div');
  buttonsContainer.style.cssText = `
    display: flex;
    justify-content: space-between;
    padding: 12px;
  `;

  // Create stop button
  const stopButton = document.createElement('button');
  stopButton.textContent = 'Stop';
  stopButton.style.cssText = `
    background-color: #e63946;
    color: white;
    border: none;
    border-radius: 6px;
    padding: 8px 15px;
    cursor: pointer;
    font-family: 'Segoe UI', Arial, sans-serif;
    font-size: 13px;
    flex: 1;
    margin-right: 8px;
    font-weight: 500;
  `;

  // Create expand button
  const expandButton = document.createElement('button');
  expandButton.textContent = 'Expand';
  expandButton.style.cssText = `
    background-color: #4361ee;
    color: white;
    border: none;
    border-radius: 6px;
    padding: 8px 15px;
    cursor: pointer;
    font-family: 'Segoe UI', Arial, sans-serif;
    font-size: 13px;
    flex: 1;
    font-weight: 500;
  `;

  // Add status indicator
  const statusIndicator = document.createElement('div');
  statusIndicator.style.cssText = `
    padding: 8px 12px;
    font-family: 'Segoe UI', Arial, sans-serif;
    font-size: 12px;
    color: #4361ee;
    text-align: center;
    border-top: 1px solid rgba(0, 0, 0, 0.05);
    display: flex;
    align-items: center;
    justify-content: center;
  `;

  // Add pulsing dot
  const pulsingDot = document.createElement('span');
  pulsingDot.style.cssText = `
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background-color: #4CAF50;
    margin-right: 8px;
    animation: pulse 1.5s infinite;
  `;
  
  // Add style for animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes pulse {
      0% { opacity: 1; }
      50% { opacity: 0.5; }
      100% { opacity: 1; }
    }
  `;
  document.head.appendChild(style);

  statusIndicator.appendChild(pulsingDot);
  statusIndicator.appendChild(document.createTextNode('Translating in background'));

  // Add close button to header
  const closeButton = document.createElement('button');
  closeButton.innerHTML = '&times;';
  closeButton.style.cssText = `
    background: none;
    border: none;
    color: white;
    font-size: 18px;
    cursor: pointer;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
  `;

  // Make draggable
  let isDragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  header.addEventListener('mousedown', (e) => {
    isDragging = true;
    const rect = miniController.getBoundingClientRect();
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', () => {
      isDragging = false;
      document.removeEventListener('mousemove', handleMouseMove);
      // Save the position when dragging ends
      const rect = miniController.getBoundingClientRect();
      localStorage.setItem('audioTranslatorMiniPosition', JSON.stringify({
        left: rect.left,
        top: rect.top
      }));
    }, { once: true });
  });

  function handleMouseMove(e) {
    if (!isDragging) return;
    
    const x = e.clientX - dragOffsetX;
    const y = e.clientY - dragOffsetY;
    
    // Keep within viewport bounds
    const maxX = window.innerWidth - miniController.offsetWidth;
    const maxY = window.innerHeight - miniController.offsetHeight;
    
    miniController.style.left = `${Math.max(0, Math.min(maxX, x))}px`;
    miniController.style.top = `${Math.max(0, Math.min(maxY, y))}px`;
    
    // Remove the default right positioning when manually positioned
    miniController.style.right = 'auto';
  }

  // Add event listeners
  closeButton.addEventListener('click', () => {
    console.log("Close button clicked on mini controller");
    // Send message to stop capture
    chrome.runtime.sendMessage({
      type: "stopCapture"
    });
    
    // Remove the mini controller
    miniController.remove();
  });

  stopButton.addEventListener('click', () => {
    console.log("Stop button clicked on mini controller");
    // Send message to stop capture
    chrome.runtime.sendMessage({
      type: "stopCapture"
    });
    
    // Remove the mini controller
    miniController.remove();
  });

  expandButton.addEventListener('click', () => {
    console.log("Expand button clicked on mini controller");
    
    // Open the popup
    chrome.runtime.sendMessage({
      type: "openPopup"
    }).then(() => {
      console.log("openPopup message sent successfully");
      // Remove the mini controller after a slight delay
      setTimeout(() => {
        miniController.remove();
      }, 300);
    }).catch(err => {
      console.error("Error sending openPopup message:", err);
    });
  });

  // Assemble the mini controller
  header.appendChild(closeButton);
  buttonsContainer.appendChild(stopButton);
  buttonsContainer.appendChild(expandButton);
  
  miniController.appendChild(header);
  miniController.appendChild(buttonsContainer);
  miniController.appendChild(statusIndicator);
  
  // Add to the page
  document.body.appendChild(miniController);
  
  // Try to restore position
  try {
    const savedPosition = localStorage.getItem('audioTranslatorMiniPosition');
    if (savedPosition) {
      const position = JSON.parse(savedPosition);
      miniController.style.right = 'auto';
      miniController.style.left = `${position.left}px`;
      miniController.style.top = `${position.top}px`;
    }
  } catch (e) {
    console.error("Error restoring mini controller position:", e);
  }
  
  console.log("Mini controller created successfully");
  
  // Ensure captions are visible
  setTimeout(() => {
    // Check if there's a caption container
    let existingContainer = document.getElementById('web-caption-container');
    if (existingContainer) {
      // Make sure it's visible
      existingContainer.style.opacity = '1';
    } else {
      // Create one if it doesn't exist
      createCaptionContainer();
    }
  }, 500);
}

// Remove mini controller
function removeMiniController() {
  const controller = document.getElementById('audio-translator-mini');
  if (controller) {
    controller.remove();
    console.log("Mini controller removed");
  }
}

// Listen for messages from the extension
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  console.log("Content script received message:", request);
  
  if (request.type === 'CAPTION') {
    showCaption(request.text, request.language, request.duration || 0, request.sessionId);
    sendResponse({success: true});
    return true;
  } else if (request.type === 'CREATE_CAPTION_CONTAINER') {
    createCaptionContainer();
    sendResponse({success: true});
    return true;
  } else if (request.type === 'REMOVE_CAPTION_CONTAINER') {
    removeCaptionContainer();
    sendResponse({success: true});
    return true;
  } else if (request.type === 'SHOW_TEST_CAPTION') {
    showCaption("Caption system is working properly. You can drag this box to reposition it.", "en", 5000, "test_caption");
    sendResponse({success: true});
    return true;
  } else if (request.type === 'HIDE_CAPTION') {
    hideCaption(request.sessionId);
    sendResponse({success: true});
    return true;
  } else if (request.type === 'CREATE_MINI_CONTROLLER') {
    createMiniController();
    sendResponse({success: true});
    return true;
  } else if (request.type === 'REMOVE_MINI_CONTROLLER') {
    removeMiniController();
    sendResponse({success: true});
    return true;
  }
});

// Create caption container when the script loads
setTimeout(() => {
  createCaptionContainer();
  
  // Signal that we're ready
  chrome.runtime.sendMessage({type: 'CAPTION_READY'}, function(response) {
    console.log("Caption system ready signal sent", response);
  });
}, 1000);

// Add CSS styles for captions
const style = document.createElement('style');
style.textContent = `
/* Word highlighting effects */
.caption-word {
  display: inline-block;
  transition: all 0.2s ease;
  padding: 0 1px;
  border-radius: 3px;
  margin: 0 1px;
}

/* Active word highlighting */
.caption-active-word {
  color: #4CAF50;
  transform: scale(1.1);
  text-shadow: 0 0 8px rgba(76, 175, 80, 0.7);
  position: relative;
  font-weight: 500;
}

/* Add subtle underline to active word */
.caption-active-word::after {
  content: '';
  position: absolute;
  bottom: -2px;
  left: 0;
  width: 100%;
  height: 2px;
  background-color: #4CAF50;
  border-radius: 2px;
}

/* Spoken words */
.caption-spoken-word {
  color: white;
  transform: scale(1);
  text-shadow: none;
  opacity: 1;
}

/* Unspoken words */
.caption-unspoken-word {
  color: rgba(255, 255, 255, 0.6);
  transform: scale(1);
  text-shadow: none;
  opacity: 0.9;
}
`;
document.head.appendChild(style);