function playVideo() {
    const url = document.getElementById("videoUrl").value;
    const videoContainer = document.getElementById("videoContainer");
    videoContainer.innerHTML = ""; // Clear previous video
  
    if (url.includes("youtube.com") || url.includes("youtu.be")) {
      // Handle YouTube URLs
      const videoId = extractYouTubeId(url);
      const iframe = document.createElement("iframe");
      iframe.src = `https://www.youtube.com/embed/${videoId}`;
      iframe.frameBorder = "0";
      iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
      iframe.allowFullscreen = true;
      videoContainer.appendChild(iframe);
    } else if (url.endsWith(".m3u8")) {
      // Handle M3U8 URLs
      const video = document.createElement("video");
      video.controls = true;
      if (Hls.isSupported()) {
        const hls = new Hls();
        hls.loadSource(url);
        hls.attachMedia(video);
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = url;
      } else {
        alert("M3U8 format is not supported in your browser.");
        return;
      }
      videoContainer.appendChild(video);
      video.play();
    } else if (url.endsWith(".mp4")) {
      // Handle MP4 URLs
      const video = document.createElement("video");
      video.src = url;
      video.controls = true;
      videoContainer.appendChild(video);
      video.play();
    } else {
      alert("Unsupported video format!");
    }
  }
  
  function extractYouTubeId(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return match && match[2].length === 11 ? match[2] : null;
  }
  