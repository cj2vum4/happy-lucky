(function () {
  function setup() {
    const audio = document.getElementById('bgm');
    if (!audio) return;

    function stopAudio() {
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch (_) {}
    }

    function isHidden() {
      if (typeof document.visibilityState === 'string') {
        return document.visibilityState !== 'visible';
      }
      if ('hidden' in document) {
        return document.hidden === true;
      }
      return false;
    }

    function shouldStop() {
      const hiddenByVisibility = isHidden();
      const lostFocus = typeof document.hasFocus === 'function' ? !document.hasFocus() : false;
      return hiddenByVisibility || lostFocus;
    }

    function onVisibilityChange() {
      if (shouldStop()) stopAudio();
    }

    document.addEventListener('visibilitychange', onVisibilityChange, { passive: true });
    document.addEventListener('webkitvisibilitychange', onVisibilityChange, { passive: true });
    window.addEventListener('pagehide', stopAudio, { capture: true });
    window.addEventListener('beforeunload', stopAudio);
    window.addEventListener('blur', stopAudio);
    document.addEventListener('freeze', stopAudio);

    audio.addEventListener('playing', () => { if (shouldStop()) stopAudio(); });
    audio.addEventListener('timeupdate', () => { if (shouldStop()) stopAudio(); });

    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.setActionHandler('pause', stopAudio);
        navigator.mediaSession.setActionHandler('stop', stopAudio);
      } catch (_) {}
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup, { once: true });
  } else {
    setup();
  }
})();
