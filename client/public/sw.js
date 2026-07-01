// WolfSheep Service Worker — авто-обновление, мгновенная активация, офлайн-фолбэк
// Версия генерируется динамически при каждой установке = старый кэш всегда сбрасывается
const BUILD_TIME = Date.now();
const CACHE_NAME = 'wolfsheep-v' + BUILD_TIME;
const OFFLINE_PAGE = '/404.html';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/game.html',
  '/login.html',
  '/profile.html',
  '/about.html',
  '/rules.html',
  '/privacy.html',
  '/terms.html',
  '/404.html',
  '/manifest.json',
  '/css/style.css',
  '/imgs/Wolf.png',
  '/imgs/Sheep.png',
  '/imgs/logo-192.png',
  '/imgs/logo-512.png',
  '/imgs/icon-192.png',
  '/imgs/icon-512.png',
  '/js/pwa.js',
  '/js/i18n.js',
  '/js/home.js',
  '/js/login.js',
  '/js/profile.js',
  '/js/game-app.js',
  '/js/game-ui.js',
  '/js/network.js',
  '/js/quoridor-engine.js',
  '/js/nav-players.js',
  '/emotes/emote-1.webp',
  '/emotes/emote-2.webp',
  '/emotes/emote-3.webp',
  '/emotes/emote-4.webp'
];

// HTML-страницы (для network-first стратегии)
const HTML_PAGES = [
  '/', '/index.html', '/game.html', '/login.html', '/profile.html',
  '/about.html', '/rules.html', '/privacy.html', '/terms.html'
];

// ===== НЕМЕДЛЕННАЯ установка и активация =====
self.addEventListener('install', (event) => {
  console.log('[SW] Installing new version:', BUILD_TIME);
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        STATIC_ASSETS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('[SW] failed to cache:', url, err.message);
          })
        )
      );
    }).then(() => {
      // НЕМЕДЛЕННО активируемся, не ждём закрытия вкладок
      return self.skipWaiting();
    })
  );
});

// Активация: чистим ВСЕ старые кэши, захватываем клиентов
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating version:', BUILD_TIME);
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => {
          console.log('[SW] Deleting old cache:', k);
          return caches.delete(k);
        })
      )
    ).then(() => {
      // Захватываем все открытые вкладки немедленно
      return self.clients.claim();
    }).then(() => {
      console.log('[SW] Activated and claimed all clients');
    })
  );
});

// Вспомогательная функция: является ли запрос HTML-страницей
function isHtmlPage(url) {
  const path = url.pathname === '/' ? '/' : url.pathname.replace(/\/$/, '');
  return HTML_PAGES.some(p => p === path || p.replace(/\/$/, '') === path);
}

// Fetch: разные стратегии для разных типов ресурсов
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Не перехватываем socket.io
  if (url.pathname.startsWith('/socket.io')) return;

  // API-запросы — только сеть
  if (url.pathname.startsWith('/api/')) return;

  // Внешние ресурсы (Google OAuth, analytics и т.д.) — только сеть
  if (url.origin !== self.location.origin) return;

  // HTML-страницы: ВСЕГДА сеть, кэш только при офлайне
  if (isHtmlPage(url) || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request, { cache: 'no-cache' }) // Принудительно без кэша браузера
        .then((response) => {
          if (response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => {
          return caches.match(request).then((cached) => {
            return cached || caches.match(OFFLINE_PAGE);
          });
        })
    );
    return;
  }

  // Статика (CSS, JS, изображения): cache-first, НО фоном всегда обновляем
  event.respondWith(
    caches.match(request).then((cached) => {
      // Фоновое обновление из сети
      const fetchPromise = fetch(request, { cache: 'no-cache' }).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return networkResponse;
      }).catch(() => cached);

      // Если есть в кэше — отдаём мгновенно, но ОДНОВРЕМЕННО запускаем обновление
      // Если нет в кэше — ждём сеть
      return cached || fetchPromise;
    })
  );
});

// Обработка сообщения SKIP_WAITING — уже не нужно, т.к. skipWaiting вызывается сразу
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CHECK_VERSION') {
    // Клиент запросил версию — сообщаем
    event.ports && event.ports[0] && event.ports[0].postMessage({ version: BUILD_TIME });
  }
});
