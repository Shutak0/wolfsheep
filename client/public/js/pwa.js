// WolfSheep PWA — регистрация Service Worker + ненавязчивое предложение установки
(function () {
  'use strict';

  var deferredPrompt = null;
  var installBanner = null;
  var bannerDismissed = null;
  var shownThisSession = false;

  // ======== 1. Регистрация Service Worker ========
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js')
        .then(function (reg) {
          console.log('[PWA] SW registered:', reg.scope);

          // Следим за обновлением SW — автоматически перезагружаем при новом кэше
          reg.onupdatefound = function () {
            var installing = reg.installing;
            if (!installing) return;
            installing.onstatechange = function () {
              if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                console.log('[PWA] New content available — reloading silently');
                window.location.reload();
              }
            };
          };
        })
        .catch(function (err) {
          console.warn('[PWA] SW registration failed:', err);
        });
    });
  }

  // ======== 2. Перехватываем beforeinstallprompt ========
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;

    // Не показываем, если уже установлено (standalone / fullscreen)
    if (isStandalone()) return;

    // Не показываем повторно в этой сессии
    if (shownThisSession) return;

    // Не показываем, если юзер уже закрывал баннер недавно (< 7 дней)
    if (wasDismissedRecently()) return;

    // Показываем баннер сразу на мобильных устройствах
    showBanner();
  });

  // ======== 3. Событие appinstalled — скрываем баннер ========
  window.addEventListener('appinstalled', function () {
    console.log('[PWA] App installed successfully');
    deferredPrompt = null;
    hideBanner();
  });

  // ======== 4. Проверка: уже в standalone-режиме? ========
  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches
        || window.navigator.standalone
        || document.referrer.includes('android-app://');
  }

  // ======== 5. Проверка: закрывал ли юзер баннер недавно ========
  function wasDismissedRecently() {
    try {
      var ts = localStorage.getItem('wolfsheep_pwa_dismissed');
      if (!ts) return false;
      var daysSince = (Date.now() - parseInt(ts, 10)) / (1000 * 60 * 60 * 24);
      return daysSince < 7;
    } catch (e) {
      return false;
    }
  }

  // ======== 6. Показываем мини-баннер внизу (сразу) ========
  function showBanner() {
    if (installBanner) return;

    shownThisSession = true;

    installBanner = document.createElement('div');
    installBanner.id = 'pwa-install-banner';
    installBanner.innerHTML =
      '<div class="pwa-banner-inner">' +
        '<span class="pwa-banner-icon">🐺</span>' +
        '<span class="pwa-banner-text">📱 Установи приложение WolfSheep (APK)</span>' +
        '<button class="pwa-banner-btn" id="pwa-install-yes">⚡ Установить APK</button>' +
        '<button class="pwa-banner-close" id="pwa-install-close" aria-label="Закрыть">✕</button>' +
      '</div>';

    document.body.appendChild(installBanner);

    // Анимация появления
    requestAnimationFrame(function () {
      installBanner.classList.add('pwa-banner-visible');
    });

    // Обработчики
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
      try {
        localStorage.setItem('wolfsheep_pwa_dismissed', Date.now().toString());
      } catch (e) {}
    });
  }

  // ======== 8. Скрываем баннер ========
  function hideBanner() {
    if (!installBanner) return;
    installBanner.classList.remove('pwa-banner-visible');
    setTimeout(function () {
      if (installBanner && installBanner.parentNode) {
        installBanner.parentNode.removeChild(installBanner);
      }
      installBanner = null;
    }, 400);
  }
})();