// This content script runs in the context of web pages
// It can be used for more advanced functionality like controlling video playback

// Listen for messages from the extension
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    // Example: You could add functionality to pause/play videos
    if (request.action === "getVideoInfo") {
      // Get video elements on the page
      const videos = document.querySelectorAll('video');
      const videoInfo = [];
      
      videos.forEach((video, index) => {
        videoInfo.push({
          index: index,
          duration: video.duration,
          currentTime: video.currentTime,
          paused: video.paused,
          muted: video.muted,
          src: video.currentSrc
        });
      });
      
      sendResponse({ success: true, videoInfo: videoInfo });
    }
    
    // Return true to indicate you will send a response asynchronously
    return true;
  });