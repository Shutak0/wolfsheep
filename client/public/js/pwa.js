// WolfSheep PWA — регистрация Service Worker + ненавязчивое предложение установки
// + офлайн-детекция, уведомление об обновлениях, индикаторы состояния
(function () {
  'use strict';

  var deferredPrompt = null;
  var installBanner = null;
  var bannerDismissed = null;
  var shownThisSession = false;
  var updateToast = null;
  var connectivityToast = null;
  var isOnline = navigator.onLine;
  var waitingWorker = null;

  // ======== 1. Регистрация Service Worker ========
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js')
        .then(function (reg) {
          console.log('[PWA] SW registered:', reg.scope);

          // Проверяем, есть ли ожидающий обновления воркер
          if (reg.waiting) {
            console.log('[PWA] Waiting SW found — activating and reloading');
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
            // Перезагружаем страницу после активации нового SW
            navigator.serviceWorker.addEventListener('controllerchange', function () {
              window.location.reload();
            });
          }

          // Следим за обновлением SW — мгновенно активируем и перезагружаем
          reg.onupdatefound = function () {
            var installing = reg.installing;
            if (!installing) return;
            installing.onstatechange = function () {
              if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                console.log('[PWA] New version detected — activating immediately');
                installing.postMessage({ type: 'SKIP_WAITING' });
                // Перезагрузка после активации
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

    // Отслеживаем смену контроллера (после skipWaiting)
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      console.log('[PWA] New SW activated');
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

  // ======== 9. Гамбургер-меню и мобильная навигация ========
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
      e.preventDefault();
      e.stopPropagation();
      if (isMenuOpen) {
        closeMenu();
      } else {
        openMenu();
      }
    });

    // Закрытие по клику на оверлей
    if (navOverlay) {
      navOverlay.addEventListener('click', function () {
        closeMenu();
      });
    }

    // Закрытие по клику на ссылку в меню
    navLeft.querySelectorAll('.nav-link').forEach(function (link) {
      link.addEventListener('click', function () {
        closeMenu();
      });
    });

    // Закрытие по Escape
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isMenuOpen) {
        closeMenu();
      }
    });

    // Свайп вправо для открытия меню (на мобильных)
    var touchStartX = 0;
    document.addEventListener('touchstart', function (e) {
      if (e.touches.length === 1) {
        touchStartX = e.touches[0].clientX;
      }
    }, { passive: true });

    document.addEventListener('touchend', function (e) {
      if (!isMenuOpen && touchStartX < 20) {
        var touchEndX = e.changedTouches[0].clientX;
        if (touchEndX - touchStartX > 80) {
          openMenu();
        }
      }
    });

    // Закрытие по свайпу влево
    if (navLeft) {
      navLeft.addEventListener('touchstart', function (e) {
        if (e.touches.length === 1) {
          touchStartX = e.touches[0].clientX;
        }
      }, { passive: true });

      navLeft.addEventListener('touchend', function (e) {
        if (isMenuOpen) {
          var touchEndX = e.changedTouches[0].clientX;
          if (touchStartX - touchEndX > 80) {
            closeMenu();
          }
        }
      });
    }
  }

  // Запускаем инициализацию мобильного меню при загрузке DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMobileNav);
  } else {
    initMobileNav();
  }

  // ======== 10. Детекция онлайна/офлайна ========
  function updateOnlineStatus(online) {
    isOnline = online;
    var indicator = document.getElementById('connectivity-indicator');
    if (indicator) {
      if (online) {
        indicator.className = 'conn-indicator online';
        indicator.textContent = '🟢';
        indicator.title = 'Онлайн — соединение восстановлено';
        hideConnectivityToast();
        hideOfflineBar();
        hideOfflineGameOverlay();
      } else {
        indicator.className = 'conn-indicator offline';
        indicator.textContent = '🔴';
        indicator.title = 'Офлайн — нет подключения к интернету';
        showOfflineToast();
        showOfflineBar();
        // Если на странице игры — показываем оверлей
        if (window.location.pathname.includes('game.html')) {
          showOfflineGameOverlay();
        }
      }
    }
  }

  // ===== Persistent offline bar (тонкая полоса под навбаром) =====
  function showOfflineBar() {
    var bar = document.getElementById('offline-bar');
    if (bar) {
      bar.classList.add('show');
      return;
    }
    bar = document.createElement('div');
    bar.id = 'offline-bar';
    bar.className = 'show';
    bar.textContent = '⚠️ Нет подключения к интернету — вы офлайн';
    document.body.insertBefore(bar, document.body.firstChild);
  }

  function hideOfflineBar() {
    var bar = document.getElementById('offline-bar');
    if (bar) {
      bar.classList.remove('show');
    }
  }

  // ===== Game offline overlay (полноэкранный при обрыве во время игры) =====
  function showOfflineGameOverlay() {
    var overlay = document.getElementById('offline-game-overlay');
    if (overlay) {
      overlay.classList.add('show');
      return;
    }
    overlay = document.createElement('div');
    overlay.id = 'offline-game-overlay';
    overlay.innerHTML =
      '<div class="og-icon">📡</div>' +
      '<div class="og-title">Соединение потеряно</div>' +
      '<div class="og-sub">Проверьте подключение к интернету. Игра будет восстановлена при появлении сети.</div>' +
      '<button class="og-btn" id="og-retry-btn">🔄 Попробовать снова</button>';
    document.body.appendChild(overlay);
    requestAnimationFrame(function () {
      overlay.classList.add('show');
    });

    document.getElementById('og-retry-btn').addEventListener('click', function () {
      if (navigator.onLine) {
        hideOfflineGameOverlay();
      } else {
        var btn = document.getElementById('og-retry-btn');
        if (btn) {
          btn.textContent = '⏳ Проверяем...';
          setTimeout(function () {
            if (btn) btn.textContent = '🔄 Попробовать снова';
          }, 2000);
        }
      }
    });
  }

  function hideOfflineGameOverlay() {
    var overlay = document.getElementById('offline-game-overlay');
    if (overlay) {
      overlay.classList.remove('show');
    }
  }

  function createConnectivityIndicator() {
    // Создаём индикатор в навбаре (рядом с числом игроков)
    var navCenter = document.querySelector('.nav-center');
    if (!navCenter) return;
    var indicator = document.createElement('span');
    indicator.id = 'connectivity-indicator';
    indicator.className = 'conn-indicator ' + (isOnline ? 'online' : 'offline');
    indicator.textContent = isOnline ? '🟢' : '🔴';
    indicator.title = isOnline ? 'Онлайн' : 'Офлайн — нет подключения';
    indicator.style.cssText = 'font-size:10px;margin-left:8px;cursor:default;';
    navCenter.appendChild(indicator);
  }

  window.addEventListener('online', function () {
    console.log('[PWA] 🌐 Online — connection restored');
    updateOnlineStatus(true);
  });

  window.addEventListener('offline', function () {
    console.log('[PWA] 🔴 Offline — no internet connection');
    updateOnlineStatus(false);
  });

  // ======== 11. Тост «Нет интернета» ========
  function showOfflineToast() {
    if (connectivityToast) return;
    connectivityToast = document.createElement('div');
    connectivityToast.id = 'pwa-offline-toast';
    connectivityToast.className = 'pwa-toast pwa-toast-offline';
    connectivityToast.innerHTML =
      '<span class="pwa-toast-icon">📡</span>' +
      '<span class="pwa-toast-text">Нет подключения к интернету</span>' +
      '<span class="pwa-toast-sub">Вы можете играть с ботом офлайн</span>' +
      '<button class="pwa-toast-close" id="pwa-offline-close" aria-label="Закрыть">✕</button>';
    document.body.appendChild(connectivityToast);

    requestAnimationFrame(function () {
      connectivityToast.classList.add('pwa-toast-visible');
    });

    document.getElementById('pwa-offline-close').addEventListener('click', hideConnectivityToast);

    // Авто-скрытие через 8 секунд
    setTimeout(hideConnectivityToast, 8000);
  }

  function hideConnectivityToast() {
    if (!connectivityToast) return;
    connectivityToast.classList.remove('pwa-toast-visible');
    setTimeout(function () {
      if (connectivityToast && connectivityToast.parentNode) {
        connectivityToast.parentNode.removeChild(connectivityToast);
      }
      connectivityToast = null;
    }, 400);
  }

  // ======== 12. Тост «Доступно обновление» ========
  function showUpdateToast() {
    if (updateToast) return;
    updateToast = document.createElement('div');
    updateToast.id = 'pwa-update-toast';
    updateToast.className = 'pwa-toast pwa-toast-update';
    updateToast.innerHTML =
      '<span class="pwa-toast-icon">🔄</span>' +
      '<span class="pwa-toast-text">Доступна новая версия</span>' +
      '<button class="pwa-toast-btn" id="pwa-update-yes">Обновить</button>' +
      '<button class="pwa-toast-close" id="pwa-update-close" aria-label="Закрыть">✕</button>';
    document.body.appendChild(updateToast);

    // Позиционируем сверху (в отличие от офлайн-тоста который снизу)
    updateToast.style.top = 'calc(var(--safe-top) + 70px)';
    updateToast.style.bottom = 'auto';

    requestAnimationFrame(function () {
      updateToast.classList.add('pwa-toast-visible');
    });

    document.getElementById('pwa-update-yes').addEventListener('click', function () {
      if (waitingWorker) {
        waitingWorker.postMessage({ type: 'SKIP_WAITING' });
      }
      window.location.reload();
    });

    document.getElementById('pwa-update-close').addEventListener('click', function () {
      hideUpdateToast();
    });
  }

  function hideUpdateToast() {
    if (!updateToast) return;
    updateToast.classList.remove('pwa-toast-visible');
    setTimeout(function () {
      if (updateToast && updateToast.parentNode) {
        updateToast.parentNode.removeChild(updateToast);
      }
      updateToast = null;
    }, 400);
  }

  // ======== 13. Инициализация всего при загрузке ========
  function initPWAFeatures() {
    createConnectivityIndicator();

    // Если офлайн при загрузке — показываем тост
    if (!isOnline) {
      showOfflineToast();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPWAFeatures);
  } else {
    initPWAFeatures();
  }
})();
