const CACHE_NAME = 'fluxocaixa-v4'; // Mudei para v4 para garantir que ele pegue o novo arquivo de perfil

// LISTA SEGURA: Adicionei o profile.js que criamos hoje
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
  './js/modules/profile.js' // <--- NOVO ARQUIVO IMPORTANTE
];

// Instalação
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .catch((err) => {
        console.error('Erro ao fazer cache dos arquivos:', err);
      })
  );
});

// Ativação (Limpa caches antigos)
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
});

// Interceptação de Rede
self.addEventListener('fetch', (event) => {
  // Ignora requisições para o Firebase/Google (CDNs) para não dar erro de CORS no cache
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