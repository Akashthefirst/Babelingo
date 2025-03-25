// Global variables to track connections and state
let ports = {};
let activeTabId = null;
let isCapturing = false;

// Listen for connections from the popup
chrome.runtime.onConnect.addListener(function(port) {
  console.log('Connected to popup');
  
  // Store the port
  const portId = port.name || 'default';
  ports[portId] = port;
  
  // Set up message listener
  port.onMessage.addListener(async function(message) {
    console.log('Background received message:', message);
    
    if (message.action === "startCapture") {
      await handleStartCapture(port, message);
    } 
    else if (message.action === "stopCapture") {
      handleStopCapture(port);
    }
  });
  
  // Handle disconnection
  port.onDisconnect.addListener(function() {
    console.log('Popup disconnected');
    delete ports[portId];
    
    // If this port was capturing, clean up
    if (isCapturing) {
      isCapturing = false;
    }
  });
});

// Handle start capture request
async function handleStartCapture(port, message) {
  try {
    console.log('Starting capture process');
    
    // Get the active tab
    const tabs = await chrome.tabs.query({active: true, currentWindow: true});
    if (!tabs || tabs.length === 0) {
      throw new Error("No active tab found");
    }
    
    const activeTab = tabs[0];
    activeTabId = activeTab.id;
    
    console.log('Active tab:', activeTabId);
    
    // Generate a media stream ID for the active tab
    const streamId = await chrome.tabCapture.getMediaStreamId({
      targetTabId: activeTabId
    });
    
    console.log('Stream ID obtained:', streamId ? 'Success' : 'Failed');
    
    // Send the stream ID back to the popup
    port.postMessage({
      type: "mediaStreamId",
      streamId: streamId,
      langData: {
        fromLang: message.fromLang,
        toLang: message.toLang
      }
    });
    
    isCapturing = true;
    
  } catch (error) {
    console.error('Error starting capture:', error);
    port.postMessage({
      type: "error",
      message: error.message
    });
  }
}

// Handle stop capture request
function handleStopCapture(port) {
  console.log('Stopping capture');
  
  isCapturing = false;
  activeTabId = null;
  
  // Notify the popup
  port.postMessage({
    type: "captureStopped"
  });
}

// Handle tab closing
chrome.tabs.onRemoved.addListener(function(tabId) {
  if (tabId === activeTabId) {
    console.log('Active tab closed, stopping capture');
    isCapturing = false;
    activeTabId = null;
    
    // Notify all connected popups
    Object.values(ports).forEach(port => {
      port.postMessage({
        type: "captureStopped"
      });
    });
  }
});