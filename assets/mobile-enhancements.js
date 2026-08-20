(() => {
  'use strict';

  const TAB_KEY = 'happy-lucky:last-tab';
  const SCROLL_KEY = 'happy-lucky:scroll:';
  const icons = { home: '🏠', calendar: '🗓️', search: '🔎', wishlist: '💗' };
  const labels = { home: '首頁', calendar: '行事曆', search: '查詢', wishlist: '想去' };
  let activeTab = 'home';
  let bannerTimer = 0;

  // 只有 index.html 這種捲動式版型才需要接管 viewport。
  // app-shell 頁（account.html、各旅程頁）自己排版並處理安全區，
  // 若硬塞 viewport-fit=cover，Android 會讓內容延伸到系統導覽列底下，
  // 底部 tab bar 就會被系統列蓋住。
  function updateViewport() {
    let meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'viewport';
      document.head.appendChild(meta);
    }
    meta.content = 'width=device-width, initial-scale=1, viewport-fit=cover';
  }

  // index.html 的分頁列：.tabs > .tab-btn[data-tab]
  function isIndexLayout() {
    return !!document.querySelector('.tabs .tab-btn[data-tab]');
  }

  function toast(message, duration = 2600) {
    let region = document.querySelector('.pwa-toast-region');
    if (!region) {
      region = document.createElement('div');
      region.className = 'pwa-toast-region';
      region.setAttribute('role', 'status');
      region.setAttribute('aria-live', 'polite');
      document.body.appendChild(region);
    }
    const item = document.createElement('div');
    item.className = 'pwa-toast';
    item.textContent = String(message);
    region.appendChild(item);
    while (region.children.length > 3) region.firstElementChild.remove();
    window.setTimeout(() => {
      item.classList.add('leave');
      item.addEventListener('animationend', () => item.remove(), { once: true });
    }, duration);
  }

  function showConnectionStatus(isOnline) {
    let banner = document.querySelector('.pwa-status-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.className = 'pwa-status-banner';
      banner.setAttribute('role', 'status');
      banner.setAttribute('aria-live', 'polite');
      document.body.appendChild(banner);
    }
    window.clearTimeout(bannerTimer);
    banner.textContent = isOnline ? '已恢復連線，資料會自動更新 ✨' : '目前離線，正在顯示已儲存的內容 ☁️';
    banner.classList.add('show');
    if (isOnline) bannerTimer = window.setTimeout(() => banner.classList.remove('show'), 2600);
  }

  function getRequestedTab() {
    const params = new URLSearchParams(location.search);
    const fromQuery = params.get('tab');
    const fromHash = location.hash.replace(/^#/, '');
    const saved = sessionStorage.getItem(TAB_KEY);
    return [fromQuery, fromHash, saved, 'home'].find(value => value && labels[value]) || 'home';
  }

  function saveScroll(tab) {
    sessionStorage.setItem(SCROLL_KEY + tab, String(window.scrollY || 0));
  }

  function restoreScroll(tab) {
    const y = Number(sessionStorage.getItem(SCROLL_KEY + tab) || 0);
    requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo({ top: y, behavior: 'auto' })));
  }

  function setupTabs() {
    const tabs = [...document.querySelectorAll('.tab-btn[data-tab]')];
    if (!tabs.length) return;

    const tabsContainer = document.querySelector('.tabs');
    if (tabsContainer) {
      tabsContainer.addEventListener('click', event => {
        if (event.target.closest('.tab-btn[data-tab]')) saveScroll(activeTab);
      }, { capture: true });
    }

    tabs.forEach(button => {
      const tab = button.dataset.tab;
      const label = labels[tab] || button.textContent.trim();
      button.innerHTML = `<span class="tab-icon" aria-hidden="true">${icons[tab] || '•'}</span><span>${label}</span>`;
      button.setAttribute('aria-label', label);
      button.setAttribute('type', 'button');
      button.addEventListener('click', () => {
        activeTab = tab;
        sessionStorage.setItem(TAB_KEY, tab);
        const url = new URL(location.href);
        url.searchParams.delete('tab');
        url.hash = tab === 'home' ? '' : tab;
        history.replaceState(null, '', url);
        restoreScroll(tab);
      });
    });

    activeTab = getRequestedTab();
    const target = tabs.find(button => button.dataset.tab === activeTab);
    if (target) {
      target.click();
      restoreScroll(activeTab);
    }

    window.addEventListener('pagehide', () => saveScroll(activeTab));
  }

  function setupInputs() {
    const search = document.getElementById('search-text');
    if (search) {
      search.setAttribute('enterkeyhint', 'search');
      search.setAttribute('inputmode', 'search');
      search.setAttribute('autocomplete', 'off');
    }

    const wishName = document.getElementById('wish-name');
    const wishCity = document.getElementById('wish-city-custom');
    const wishIg = document.getElementById('wish-ig');
    const wishNote = document.getElementById('wish-note');
    if (wishName) wishName.setAttribute('enterkeyhint', 'next');
    if (wishCity) wishCity.setAttribute('enterkeyhint', 'next');
    if (wishIg) {
      wishIg.setAttribute('autocomplete', 'url');
      wishIg.setAttribute('enterkeyhint', 'next');
    }
    if (wishNote) wishNote.setAttribute('enterkeyhint', 'done');
  }

  function setupKeyboardAwareness() {
    if (!window.visualViewport) return;
    const update = () => {
      const keyboardOpen = window.visualViewport.height < window.innerHeight * 0.72;
      document.documentElement.classList.toggle('keyboard-open', keyboardOpen);
    };
    visualViewport.addEventListener('resize', update);
    visualViewport.addEventListener('scroll', update);
    update();
  }

  function showUpdatePrompt(registration) {
    if (!registration || !registration.waiting || document.querySelector('.pwa-update-card')) return;
    const card = document.createElement('section');
    card.className = 'pwa-update-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', '有新版本可用');
    card.innerHTML = `
      <strong>有新版本可以使用</strong>
      <p>更新後會保留目前資料，並重新載入最新介面。</p>
      <div class="pwa-update-actions">
        <button class="pwa-update-later" type="button">稍後</button>
        <button class="pwa-update-now" type="button">立即更新</button>
      </div>`;
    card.querySelector('.pwa-update-later').addEventListener('click', () => card.remove());
    card.querySelector('.pwa-update-now').addEventListener('click', () => {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    });
    document.body.appendChild(card);
  }

  async function setupServiceWorkerUpdates() {
    if (!('serviceWorker' in navigator)) return;
    try {
      const registration = await navigator.serviceWorker.getRegistration('./');
      if (!registration) return;
      if (registration.waiting) showUpdatePrompt(registration);
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdatePrompt(registration);
          }
        });
      });
      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloading) return;
        reloading = true;
        location.reload();
      });
    } catch (error) {
      console.warn('PWA update check failed', error);
    }
  }

  function setupInstallPrompt() {
    let deferredPrompt = null;
    window.addEventListener('beforeinstallprompt', event => {
      event.preventDefault();
      deferredPrompt = event;
      window.dispatchEvent(new CustomEvent('happy-lucky-installable'));
    });
    window.happyLuckyInstall = async () => {
      if (!deferredPrompt) return false;
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      deferredPrompt = null;
      return choice.outcome === 'accepted';
    };
  }

  function setupAlertToasts() {
    const nativeAlert = window.alert.bind(window);
    window.alert = message => {
      try { toast(message, 3400); }
      catch { nativeAlert(message); }
    };
  }

  function init() {
    const indexLayout = isIndexLayout();
    if (indexLayout) updateViewport();
    document.documentElement.classList.add('pwa-mobile-enhanced');
    if (indexLayout) document.documentElement.classList.add('pwa-layout-index');
    if (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone) {
      document.documentElement.classList.add('is-standalone');
    }
    window.happyLuckyToast = toast;
    setupAlertToasts();
    setupTabs();
    setupInputs();
    setupKeyboardAwareness();
    setupServiceWorkerUpdates();
    setupInstallPrompt();

    window.addEventListener('offline', () => showConnectionStatus(false));
    window.addEventListener('online', () => {
      showConnectionStatus(true);
      window.dispatchEvent(new CustomEvent('happy-lucky-online'));
    });
    if (!navigator.onLine) showConnectionStatus(false);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
