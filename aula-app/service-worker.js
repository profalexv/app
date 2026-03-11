/**
 * Service Worker - AULA App
 * Permite funcionamento offline e instalação como PWA
 */

const CACHE_NAME = 'aula-app-v1';
const OFFLINE_URL = '/offline.html';

const CACHE_FILES = [
  '/',
  '/index.html',
  '/app.js',
  '/styles.css',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// Instalação - cacheia arquivos estáticos
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Arquivos cacheados');
        return cache.addAll(CACHE_FILES);
      })
      .then(() => self.skipWaiting())
  );
});

// Ativação - limpa caches antigos
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(name => name !== CACHE_NAME)
            .map(name => caches.delete(name))
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch - estratégia Network First para API, Cache First para assets
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // API requests - Network First
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          // Cacheia resposta se for GET
          if (request.method === 'GET') {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // Se offline, tenta cache
          return caches.match(request)
            .then(cached => cached || new Response(
              JSON.stringify({ error: 'Offline' }),
              { status: 503, headers: { 'Content-Type': 'application/json' } }
            ));
        })
    );
    return;
  }

  // Assets estáticos - Cache First
  event.respondWith(
    caches.match(request)
      .then(cached => {
        if (cached) return cached;
        
        return fetch(request).then(response => {
          // Cacheia novos assets
          if (request.method === 'GET') {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(request, responseClone);
            });
          }
          return response;
        });
      })
      .catch(() => {
        // Fallback para offline
        if (request.mode === 'navigate') {
          return caches.match(OFFLINE_URL);
        }
        return new Response('Offline', { status: 503 });
      })
  );
});

// Sincronização em background (futuro)
self.addEventListener('sync', event => {
  if (event.tag === 'sync-bookings') {
    event.waitUntil(syncBookings());
  }
});

async function syncBookings() {
  // TODO: Implementar sincronização de agendamentos pendentes
  console.log('Sincronizando agendamentos...');
}

// Push notifications (futuro)
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'AULA';
  const options = {
    body: data.body || 'Nova notificação',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-72.png',
    vibrate: [200, 100, 200],
    data: data.data
  };
  
  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data?.url || '/')
  );
});
