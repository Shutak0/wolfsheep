// WolfSheep Service Worker — всегда актуальная версия для всех ресурсов
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

// HTML-страницы (для офлайн-фолбэка на 404.html)
const HTML_PATHS = [
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
  return HTML_PATHS.some(p => p === path || p.replace(/\/$/, '') === path);
}

// ===== ЕДИНАЯ СТРАТЕГИЯ: NETWORK-FIRST ДЛЯ ВСЕХ РЕСУРСОВ САЙТА =====
// Это гарантирует, что ВСЕГДА загружается актуальная версия с сервера,
// а кэш используется ТОЛЬКО как fallback при отсутствии сети.
// Да, это немного медленнее чем cache-first, но обеспечивает 100% актуальность.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Не перехватываем socket.io
  if (url.pathname.startsWith('/socket.io')) return;

  // API-запросы — только сеть
  if (url.pathname.startsWith('/api/')) return;

  // Внешние ресурсы (Google OAuth, analytics и т.д.) — только сеть
  if (url.origin !== self.location.origin) return;

  // Для ВСЕХ локальных ресурсов: NETWORK-FIRST
  // (HTML, CSS, JS, изображения, шрифты, манифест — всё)
  event.respondWith(
    fetch(request, { cache: 'no-cache' }) // Принудительно без кэша браузера
      .then((response) => {
        // Кэшируем успешный ответ для офлайн-фолбэка
        if (response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => {
        // Офлайн: пробуем взять из кэша
        return caches.match(request).then((cached) => {
          if (cached) return cached;
          // Для HTML-страниц — фолбэк на 404.html
          if (isHtmlPage(url) || request.headers.get('accept')?.includes('text/html')) {
            return caches.match(OFFLINE_PAGE);
          }
          // Для остальных ресурсов — 503 или просто ошибка сети
          return new Response('Offline — resource not available', { status: 503 });
        });
      })
  );
});

// Обработка сообщений от клиента
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CHECK_VERSION') {
    event.ports && event.ports[0] && event.ports[0].postMessage({ version: BUILD_TIME });
  }
});