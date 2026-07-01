// WolfSheep Service Worker — улучшенное кэширование, офлайн-фолбэк
const CACHE_NAME = 'wolfsheep-v4';
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

// Установка: кэшируем статику заранее
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        STATIC_ASSETS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('[SW] failed to cache:', url, err.message);
          })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// Активация: чистим старые кэши
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
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
  if (url.origin !== self.location.origin) {
    // Для Google OAuth и других внешних скриптов — только сеть
    return;
  }

  // HTML-страницы: network-first с офлайн-фолбэком
  if (isHtmlPage(url) || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Кэшируем свежую версию
          if (response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => {
          // Нет сети — отдаём из кэша или офлайн-страницу
          return caches.match(request).then((cached) => {
            return cached || caches.match(OFFLINE_PAGE);
          });
        })
    );
    return;
  }

  // Статика (CSS, JS, изображения): cache-first, фоном обновляем
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return networkResponse;
      }).catch(() => cached);

      return cached || fetchPromise;
    })
  );
});

// Обработка сообщения о пропуске ожидания (для немедленной активации)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
