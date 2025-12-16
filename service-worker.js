const CACHE_NAME = 'fluxocaixa-v3'; // Mudei para v2 para forçar atualização

// LISTA SEGURA: Apenas arquivos locais que temos CERTEZA que existem.
// Removi os links https:// (CDNs) e os ícones para evitar o erro "Failed to fetch".
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
  './js/modules/finance.js'
];

// Instalação
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        // Tenta adicionar os arquivos. Se um falhar, vamos ver no console quem foi,
        // mas aqui forçamos o cache.addAll que é o padrão.
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

// Interceptação de Rede (Estratégia: Cache First, falling back to Network)
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Se achou no cache, retorna. Se não, busca na rede.
        return response || fetch(event.request);
      })
  );
});