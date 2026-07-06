// WolfSheep PWA — Service Worker registration + install prompt
// + online/offline detection, update notifications, connectivity indicators
(function () {
  'use strict';

  var deferredPrompt = null;
  var installBanner = null;
  var shownThisSession = false;
  var updateToast = null;
  var connectivityToast = null;
  var isOnline = navigator.onLine;
  var waitingWorker = null;

  // ======== 1. Register Service Worker ========
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js')
        .then(function (reg) {
          console.log('[PWA] SW registered:', reg.scope);

          if (reg.waiting) {
            console.log('[PWA] Waiting SW found — activating and reloading');
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
            navigator.serviceWorker.addEventListener('controllerchange', function () {
              window.location.reload();
            });
          }

          reg.onupdatefound = function () {
            var installing = reg.installing;
            if (!installing) return;
            installing.onstatechange = function () {
              if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                console.log('[PWA] New version detected — activating immediately');
                installing.postMessage({ type: 'SKIP_WAITING' });
                navigator.serviceWorker.addEventListener('controllerchange', function () {
                  console.log('[PWA] Reloading for new version');
                  window.location.reload();
                });
              }
            };
          };
        })
        .catch(function (err) {
          console.warn('[PWA] SW registration failed:', err);
        });
    });

    navigator.serviceWorker.addEventListener('controllerchange', function () {
      console.log('[PWA] New SW activated');
    });

    // ===== Периодическая проверка обновлений SW (каждые 5 минут) =====
    var updateInterval = 5 * 60 * 1000; // 5 минут
    window.addEventListener('load', function () {
      setTimeout(function () {
        setInterval(function () {
          if (navigator.serviceWorker.controller) {
            navigator.serviceWorker.ready.then(function (reg) {
              reg.update().catch(function (err) {
                console.log('[PWA] Update check skipped:', err.message);
              });
            });
          }
        }, updateInterval);
      }, updateInterval); // Первая проверка через 5 минут после загрузки
    });
  }

  // ======== 2. Intercept beforeinstallprompt ========
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    if (isStandalone()) return;
    if (shownThisSession) return;
    if (wasDismissedRecently()) return;
    showBanner();
  });

  // ======== 3. appinstalled event — hide banner ========
  window.addEventListener('appinstalled', function () {
    console.log('[PWA] App installed successfully');
    deferredPrompt = null;
    hideBanner();
  });

  // ======== 4. Check: already in standalone mode? ========
  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches
        || window.navigator.standalone
        || document.referrer.includes('android-app://');
  }

  // ======== 5. Check: was banner dismissed recently? ========
  function wasDismissedRecently() {
    try {
      var ts = localStorage.getItem('wolfsheep_pwa_dismissed');
      if (!ts) return false;
      var daysSince = (Date.now() - parseInt(ts, 10)) / (1000 * 60 * 60 * 24);
      return daysSince < 7;
    } catch (e) { return false; }
  }

  // ======== 6. Show install banner at bottom ========
  function showBanner() {
    if (installBanner) return;
    shownThisSession = true;

    installBanner = document.createElement('div');
    installBanner.id = 'pwa-install-banner';
    installBanner.innerHTML =
      '<div class="pwa-banner-inner">' +
        '<span class="pwa-banner-icon">🐺</span>' +
        '<span class="pwa-banner-text">📱 Install WolfSheep app</span>' +
        '<button class="pwa-banner-btn" id="pwa-install-yes">⚡ Install</button>' +
        '<button class="pwa-banner-close" id="pwa-install-close" aria-label="Close">✕</button>' +
      '</div>';

    document.body.appendChild(installBanner);
    requestAnimationFrame(function () { installBanner.classList.add('pwa-banner-visible'); });

    document.getElementById('pwa-install-yes').addEventListener('click', function () {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function (choice) {
        console.log('[PWA] User choice:', choice.outcome);
        deferredPrompt = null;
      });
      hideBanner();
    });

    document.getElementById('pwa-install-close').addEventListener('click', function () {
      hideBanner();
      try { localStorage.setItem('wolfsheep_pwa_dismissed', Date.now().toString()); } catch (e) {}
    });
  }

  // ======== 7. Hide banner ========
  function hideBanner() {
    if (!installBanner) return;
    installBanner.classList.remove('pwa-banner-visible');
    setTimeout(function () {
      if (installBanner && installBanner.parentNode) installBanner.parentNode.removeChild(installBanner);
      installBanner = null;
    }, 400);
  }

  // ======== 8. Hamburger menu & mobile navigation ========
  function initMobileNav() {
    var hamburger = document.getElementById('hamburger-btn');
    var navLeft = document.getElementById('nav-left-menu');
    var navOverlay = document.getElementById('nav-overlay');
    if (!hamburger || !navLeft) return;

    var isMenuOpen = false;

    function openMenu() {
      isMenuOpen = true;
      navLeft.classList.add('mobile-open');
      if (navOverlay) navOverlay.classList.add('show');
      hamburger.textContent = '✕';
      hamburger.setAttribute('aria-expanded', 'true');
      document.body.style.overflow = 'hidden';
    }

    function closeMenu() {
      isMenuOpen = false;
      navLeft.classList.remove('mobile-open');
      if (navOverlay) navOverlay.classList.remove('show');
      hamburger.textContent = '☰';
      hamburger.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    }

    hamburger.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      isMenuOpen ? closeMenu() : openMenu();
    });
    if (navOverlay) navOverlay.addEventListener('click', closeMenu);
    navLeft.querySelectorAll('.nav-link').forEach(function (l) { l.addEventListener('click', closeMenu); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && isMenuOpen) closeMenu(); });

    var touchStartX = 0;
    document.addEventListener('touchstart', function (e) { if (e.touches.length === 1) touchStartX = e.touches[0].clientX; }, { passive: true });
    document.addEventListener('touchend', function (e) { if (!isMenuOpen && touchStartX < 20 && e.changedTouches[0].clientX - touchStartX > 80) openMenu(); });
    if (navLeft) {
      navLeft.addEventListener('touchstart', function (e) { if (e.touches.length === 1) touchStartX = e.touches[0].clientX; }, { passive: true });
      navLeft.addEventListener('touchend', function (e) { if (isMenuOpen && touchStartX - e.changedTouches[0].clientX > 80) closeMenu(); });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initMobileNav);
  else initMobileNav();

  // ======== 9. Online/offline detection ========
  function updateOnlineStatus(online) {
    isOnline = online;
    var indicator = document.getElementById('connectivity-indicator');
    if (!indicator) return;
    if (online) {
      indicator.className = 'conn-indicator online';
      indicator.textContent = '🟢';
      indicator.title = 'Online — connection restored';
      hideConnectivityToast();
      hideOfflineBar();
      hideOfflineGameOverlay();
    } else {
      indicator.className = 'conn-indicator offline';
      indicator.textContent = '🔴';
      indicator.title = 'Offline — no internet connection';
      showOfflineToast();
      showOfflineBar();
      if (window.location.pathname.includes('game.html')) showOfflineGameOverlay();
    }
  }

  function showOfflineBar() {
    var bar = document.getElementById('offline-bar');
    if (bar) { bar.classList.add('show'); return; }
    bar = document.createElement('div');
    bar.id = 'offline-bar';
    bar.className = 'show';
    bar.textContent = '⚠️ No internet connection — you are offline';
    document.body.insertBefore(bar, document.body.firstChild);
  }

  function hideOfflineBar() {
    var bar = document.getElementById('offline-bar');
    if (bar) bar.classList.remove('show');
  }

  function showOfflineGameOverlay() {
    var overlay = document.getElementById('offline-game-overlay');
    if (overlay) { overlay.classList.add('show'); return; }
    overlay = document.createElement('div');
    overlay.id = 'offline-game-overlay';
    overlay.innerHTML =
      '<div class="og-icon">📡</div>' +
      '<div class="og-title">Connection Lost</div>' +
      '<div class="og-sub">Check your internet connection. The game cannot continue without a network.</div>' +
      '<button class="og-btn" id="og-retry-btn">🔄 Retry</button>';
    document.body.appendChild(overlay);
    requestAnimationFrame(function () { overlay.classList.add('show'); });

    document.getElementById('og-retry-btn').addEventListener('click', function () {
      if (navigator.onLine) { hideOfflineGameOverlay(); }
      else {
        var btn = document.getElementById('og-retry-btn');
        if (btn) { btn.textContent = '⏳ Checking...'; setTimeout(function () { if (btn) btn.textContent = '🔄 Retry'; }, 2000); }
      }
    });
  }

  function hideOfflineGameOverlay() {
    var overlay = document.getElementById('offline-game-overlay');
    if (overlay) overlay.classList.remove('show');
  }

  function createConnectivityIndicator() {
    var nc = document.querySelector('.nav-center');
    if (!nc) return;
    var ind = document.createElement('span');
    ind.id = 'connectivity-indicator';
    ind.className = 'conn-indicator ' + (isOnline ? 'online' : 'offline');
    ind.textContent = isOnline ? '🟢' : '🔴';
    ind.title = isOnline ? 'Online' : 'Offline — no internet connection';
    ind.style.cssText = 'font-size:10px;margin-left:8px;cursor:default;';
    nc.appendChild(ind);
  }

  window.addEventListener('online', function () { console.log('[PWA] Online'); updateOnlineStatus(true); });
  window.addEventListener('offline', function () { console.log('[PWA] Offline'); updateOnlineStatus(false); });

  // ======== 10. Offline toast ========
  function showOfflineToast() {
    if (connectivityToast) return;
    connectivityToast = document.createElement('div');
    connectivityToast.id = 'pwa-offline-toast';
    connectivityToast.className = 'pwa-toast pwa-toast-offline';
    connectivityToast.innerHTML =
      '<span class="pwa-toast-icon">📡</span>' +
      '<span class="pwa-toast-text">No internet connection</span>' +
      '<span class="pwa-toast-sub">Multiplayer and bot require an internet connection</span>' +
      '<button class="pwa-toast-close" id="pwa-offline-close" aria-label="Close">✕</button>';
    document.body.appendChild(connectivityToast);
    requestAnimationFrame(function () { connectivityToast.classList.add('pwa-toast-visible'); });
    document.getElementById('pwa-offline-close').addEventListener('click', hideConnectivityToast);
    setTimeout(hideConnectivityToast, 8000);
  }

  function hideConnectivityToast() {
    if (!connectivityToast) return;
    connectivityToast.classList.remove('pwa-toast-visible');
    setTimeout(function () {
      if (connectivityToast && connectivityToast.parentNode) connectivityToast.parentNode.removeChild(connectivityToast);
      connectivityToast = null;
    }, 400);
  }

  // ======== 11. Update available toast ========
  function showUpdateToast() {
    if (updateToast) return;
    updateToast = document.createElement('div');
    updateToast.id = 'pwa-update-toast';
    updateToast.className = 'pwa-toast pwa-toast-update';
    updateToast.innerHTML =
      '<span class="pwa-toast-icon">🔄</span>' +
      '<span class="pwa-toast-text">New version available</span>' +
      '<button class="pwa-toast-btn" id="pwa-update-yes">Update</button>' +
      '<button class="pwa-toast-close" id="pwa-update-close" aria-label="Close">✕</button>';
    document.body.appendChild(updateToast);
    updateToast.style.top = 'calc(var(--safe-top) + 70px)';
    updateToast.style.bottom = 'auto';
    requestAnimationFrame(function () { updateToast.classList.add('pwa-toast-visible'); });
    document.getElementById('pwa-update-yes').addEventListener('click', function () {
      if (waitingWorker) waitingWorker.postMessage({ type: 'SKIP_WAITING' });
      window.location.reload();
    });
    document.getElementById('pwa-update-close').addEventListener('click', hideUpdateToast);
  }

  function hideUpdateToast() {
    if (!updateToast) return;
    updateToast.classList.remove('pwa-toast-visible');
    setTimeout(function () {
      if (updateToast && updateToast.parentNode) updateToast.parentNode.removeChild(updateToast);
      updateToast = null;
    }, 400);
  }

  // ======== 12. Initialize ========
  function initPWAFeatures() {
    createConnectivityIndicator();
    if (!isOnline) showOfflineToast();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initPWAFeatures);
  else initPWAFeatures();
})();