const CACHE_NAME = "ai-athlete-360-public-v2";
const PUBLIC_SHELL_ASSETS = [
  "/offline.html",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PUBLIC_SHELL_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((cacheName) => cacheName !== CACHE_NAME)
            .map((cacheName) => caches.delete(cacheName)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/")
  )
    return;

  if (request.mode === "navigate") {
    event.respondWith(navigationWithOfflineFallback(request));
    return;
  }

  if (isPublicStaticAsset(url.pathname)) event.respondWith(cacheFirst(request));
});

function isPublicStaticAsset(pathname) {
  return pathname.startsWith("/assets/") || PUBLIC_SHELL_ASSETS.includes(pathname);
}

async function navigationWithOfflineFallback(request) {
  try {
    return await fetch(request);
  } catch {
    return (
      (await caches.match("/offline.html")) ??
      new Response("Offline. Reconnect once to load this screen.", {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
        status: 503,
      })
    );
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const network = fetch(request).then((response) => {
    if (response.ok && response.type === "basic") void cache.put(request, response.clone());
    return response;
  });

  if (cached) {
    void network.catch(() => undefined);
    return cached;
  }

  try {
    return await network;
  } catch {
    throw new Error(`No cached response for ${request.url}`);
  }
}
