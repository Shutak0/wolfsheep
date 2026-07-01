// WolfSheep Service Worker — кэширует статику, поддерживает офлайн
const CACHE_NAME = 'wolfsheep-v3';

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
  '/manifest.json',
  '/css/style.css',
  '/imgs/Wolf.png',
  '/imgs/Sheep.png',
  '/imgs/icon-192.png',
  '/imgs/icon-512.png',
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

// Установка: кэшируем статику
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

// Fetch: cache-first для статики, network-first для API/socket.io
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Не перехватываем socket.io (оставляем как есть)
  if (url.pathname.startsWith('/socket.io')) return;

  // API-запросы — только сеть (не кэшируем)
  if (url.pathname.startsWith('/api/')) return;

  // Google OAuth / внешние скрипты — только сеть
  if (url.origin !== self.location.origin) return;

  // Статика — cache-first (мгновенно из кэша, фоном обновляем)
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        // Обновляем кэш в фоне
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return networkResponse;
      }).catch(() => cached);

      return cached || fetchPromise;
    })
  );
});