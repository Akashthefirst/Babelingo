// DOM elements
const subscriptionKeyInput = document.getElementById('subscription-key');
const regionInput = document.getElementById('region');
const translatorEndpointInput = document.getElementById('translator-endpoint');
const bufferSizeSelect = document.getElementById('buffer-size');
const sampleRateSelect = document.getElementById('sample-rate');
const maxHistoryInput = document.getElementById('max-history');
const fontSizeSelect = document.getElementById('font-size');
const ttsEnabledCheckbox = document.getElementById('tts-enabled');
const saveButton = document.getElementById('save-btn');
const statusMessage = document.getElementById('status-message');

// Default settings
const DEFAULT_SETTINGS = {
  subscriptionKey: "Fj1KPt7grC6bAkNja7daZUstpP8wZTXsV6Zjr2FOxkO7wsBQ5SzQJQQJ99BCACHYHv6XJ3w3AAAAACOGL3Xg",
  region: "eastus2",
  translatorEndpoint: "https://ai-aihackthonhub282549186415.cognitiveservices.azure.com/translator/text/v3.0/translate",
  bufferSize: 4096,
  sampleRate: 16000,
  maxHistory: 100,
  fontSize: "medium",
  ttsEnabled: false
};

// Load saved settings
document.addEventListener('DOMContentLoaded', function() {
  chrome.storage.sync.get(DEFAULT_SETTINGS, function(items) {
    subscriptionKeyInput.value = items.subscriptionKey || DEFAULT_SETTINGS.subscriptionKey;
    regionInput.value = items.region || DEFAULT_SETTINGS.region;
    translatorEndpointInput.value = items.translatorEndpoint || DEFAULT_SETTINGS.translatorEndpoint;
    bufferSizeSelect.value = items.bufferSize || DEFAULT_SETTINGS.bufferSize;
    sampleRateSelect.value = items.sampleRate || DEFAULT_SETTINGS.sampleRate;
    maxHistoryInput.value = items.maxHistory || DEFAULT_SETTINGS.maxHistory;
    fontSizeSelect.value = items.fontSize || DEFAULT_SETTINGS.fontSize;
    
    // Set TTS checkbox if it exists
    if (ttsEnabledCheckbox) {
      ttsEnabledCheckbox.checked = items.ttsEnabled !== undefined ? items.ttsEnabled : DEFAULT_SETTINGS.ttsEnabled;
    }
  });
});

// Save settings
saveButton.addEventListener('click', function() {
  const settings = {
    subscriptionKey: subscriptionKeyInput.value.trim(),
    region: regionInput.value.trim(),
    translatorEndpoint: translatorEndpointInput.value.trim(),
    bufferSize: parseInt(bufferSizeSelect.value),
    sampleRate: parseInt(sampleRateSelect.value),
    maxHistory: parseInt(maxHistoryInput.value),
    fontSize: fontSizeSelect.value
  };
  
  // Add TTS setting if the checkbox exists
  if (ttsEnabledCheckbox) {
    settings.ttsEnabled = ttsEnabledCheckbox.checked;
  }
  
  // Validate settings
  if (!settings.subscriptionKey) {
    showStatus("Please enter a valid subscription key", "error");
    return;
  }
  
  if (!settings.region) {
    showStatus("Please enter a valid region", "error");
    return;
  }
  
  if (!settings.translatorEndpoint) {
    showStatus("Please enter a valid translator endpoint", "error");
    return;
  }
  
  // Save settings
  chrome.storage.sync.set(settings, function() {
    showStatus("Settings saved successfully", "success");
  });
});

// Display status message
function showStatus(message, type) {
  statusMessage.textContent = message;
  statusMessage.className = "status-message " + type;
  statusMessage.style.display = "block";
  
  // Hide the message after 3 seconds
  setTimeout(function() {
    statusMessage.style.display = "none";
  }, 3000);
}