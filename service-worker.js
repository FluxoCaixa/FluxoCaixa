const CACHE_NAME = 'fluxocaixa-v6'; // Versão nova

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/app.js',
  './js/utils.js',
  './js/config.js',
  './js/modules/auth.js',
  './js/modules/calendar.js',
  './js/modules/dashboard.js',
  './js/modules/finance.js',
  './js/modules/profile.js' 
];

// Instalação
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .catch((err) => {
        console.error('ERRO CRÍTICO: Falha ao baixar arquivos.', err);
      })
  );
});

// Ativação e Limpeza
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME) {
          return caches.delete(key);
        }
      }));
    })
  );
  self.clients.claim();
});

// Interceptação
self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('firebase') || event.request.url.includes('googleapis')) {
    return; 
  }
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        return response || fetch(event.request);
      })
  );
});