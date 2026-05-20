(function () {
  function setup() {
    const audio = document.getElementById('bgm');
    if (!audio) return;

    let wasPlaying = false;

    function tryResume() {
      if (wasPlaying && audio.paused) {
        audio.play().catch(() => {});
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        wasPlaying = !audio.paused;
      } else if (document.visibilityState === 'visible') {
        tryResume();
      }
    }

    function stopAudio() {
      wasPlaying = false;
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch (_) {}
    }

    audio.addEventListener('play', () => { wasPlaying = true; });
    audio.addEventListener('ended', () => { wasPlaying = false; });

    document.addEventListener('visibilitychange', onVisibilityChange, { passive: true });
    window.addEventListener('pagehide', stopAudio, { capture: true });

    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.setActionHandler('play', tryResume);
        navigator.mediaSession.setActionHandler('pause', () => {
          wasPlaying = false;
          audio.pause();
        });
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
