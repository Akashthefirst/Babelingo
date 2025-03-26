// DOM elements
const bufferSizeSelect = document.getElementById('buffer-size');
const processingIntervalInput = document.getElementById('processing-interval');
const ttsEnabledCheckbox = document.getElementById('tts-enabled');
const voiceGenderSelect = document.getElementById('voice-gender');
const maxHistoryInput = document.getElementById('max-history');
const fontSizeSelect = document.getElementById('font-size');
const defaultFromLangSelect = document.getElementById('default-from-lang');
const defaultToLangSelect = document.getElementById('default-to-lang');
const saveButton = document.getElementById('save-btn');
const statusMessage = document.getElementById('status-message');
const serverStatusSpan = document.getElementById('server-status');

// Flask server URL
const SERVER_URL = 'http://127.0.0.1:5015';

// Default settings
const DEFAULT_SETTINGS = {
  bufferSize: 4096,
  processingInterval: 2000,
  ttsEnabled: true,
  voiceGender: 'female',
  maxHistory: 100,
  fontSize: 'medium',
  defaultFromLang: 'en-US',
  defaultToLang: 'es'
};

// Check server status
async function checkServerStatus() {
  try {
    const response = await fetch(`${SERVER_URL}/health`);
    const data = await response.json();
    
    if (data.status === 'OK') {
      serverStatusSpan.textContent = 'Running';
      serverStatusSpan.style.color = '#28a745';
    } else {
      serverStatusSpan.textContent = 'Error';
      serverStatusSpan.style.color = '#dc3545';
    }
  } catch (error) {
    serverStatusSpan.textContent = 'Not Running';
    serverStatusSpan.style.color = '#dc3545';
  }
}

// Load settings
function loadSettings() {
  chrome.storage.sync.get(DEFAULT_SETTINGS, function(items) {
    bufferSizeSelect.value = items.bufferSize;
    processingIntervalInput.value = items.processingInterval;
    ttsEnabledCheckbox.checked = items.ttsEnabled;
    voiceGenderSelect.value = items.voiceGender || 'female';
    maxHistoryInput.value = items.maxHistory;
    fontSizeSelect.value = items.fontSize;
    
    // Set language defaults if saved
    if (items.defaultFromLang) {
      defaultFromLangSelect.value = items.defaultFromLang;
    }
    
    if (items.defaultToLang) {
      defaultToLangSelect.value = items.defaultToLang;
    }
  });
}

// Save settings
function saveSettings() {
  const settings = {
    bufferSize: parseInt(bufferSizeSelect.value, 10),
    processingInterval: parseInt(processingIntervalInput.value, 10),
    ttsEnabled: ttsEnabledCheckbox.checked,
    voiceGender: voiceGenderSelect.value,
    maxHistory: parseInt(maxHistoryInput.value, 10),
    fontSize: fontSizeSelect.value,
    defaultFromLang: defaultFromLangSelect.value,
    defaultToLang: defaultToLangSelect.value
  };
  
  chrome.storage.sync.set(settings, function() {
    showStatus('Settings saved successfully!', 'success');
    
    // Also update any open popup windows with the new default languages
    chrome.runtime.sendMessage({
      action: 'settingsUpdated',
      settings: settings
    });
  });
}

// Show status message
function showStatus(message, type) {
  statusMessage.textContent = message;
  statusMessage.className = 'status-message ' + type;
  statusMessage.style.display = 'block';
  
  setTimeout(function() {
    statusMessage.style.display = 'none';
  }, 3000);
}

// Event listeners
document.addEventListener('DOMContentLoaded', function() {
  loadSettings();
  checkServerStatus();
  
  // Check server status every 5 seconds
  setInterval(checkServerStatus, 5000);
});

saveButton.addEventListener('click', saveSettings);

// Validate inputs
processingIntervalInput.addEventListener('change', function() {
  if (this.value < 500) this.value = 500;
  if (this.value > 5000) this.value = 5000;
});

maxHistoryInput.addEventListener('change', function() {
  if (this.value < 10) this.value = 10;
  if (this.value > 1000) this.value = 1000;
});