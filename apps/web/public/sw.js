const CACHE_NAME = "sih26043-pwa-v1";

const PRECACHE_ASSETS = [
  "/",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon.svg",
];

// Install: Cache critical shell assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
      .catch((err) => {
        console.warn("[SW] Precache asset fetch warning:", err);
      })
  );
});

// Activate: Clean up old cache versions
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              return caches.delete(cacheName);
            }
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

// Fetch: Strategy dispatcher
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Security Hygiene: Explicitly NEVER cache authentication endpoints,
  // internal routes, or AWS S3 presigned URLs
  const isAuthRoute = url.pathname.startsWith("/api/v1/auth");
  const isUploadRoute = url.pathname.startsWith("/api/v1/uploads");
  const isS3Presigned =
    url.searchParams.has("X-Amz-Signature") ||
    url.searchParams.has("X-Amz-Credential") ||
    url.searchParams.has("X-Amz-Algorithm") ||
    url.hostname.includes("s3") ||
    url.port === "9000";

  if (isAuthRoute || isUploadRoute || isS3Presigned || request.method !== "GET") {
    // Direct network bypass
    return;
  }

  // 1. Navigation requests (HTML documents): Network-first with offline fallback
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return response;
        })
        .catch(async () => {
          // Offline fallback
          const cachedResponse = await caches.match(request);
          if (cachedResponse) {
            return cachedResponse;
          }
          const rootCached = await caches.match("/");
          if (rootCached) {
            return rootCached;
          }

          return new Response(
            `<!DOCTYPE html>
            <html lang="en">
              <head>
                <meta charset="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <title>Offline Mode - SIH26043</title>
                <style>
                  body { background: #020617; color: #f8fafc; font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; padding: 1rem; box-sizing: border-box; text-align: center; }
                  .card { background: #0f172a; border: 1px solid #1e293b; padding: 2.5rem; border-radius: 1rem; max-width: 440px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5); }
                  h1 { color: #38bdf8; margin: 0 0 1rem; font-size: 1.5rem; font-weight: 700; }
                  p { color: #94a3b8; font-size: 0.95rem; line-height: 1.5; margin: 0 0 1.5rem; }
                  button { background: #2563eb; color: #ffffff; border: 0; padding: 0.75rem 1.5rem; border-radius: 0.5rem; cursor: pointer; font-weight: 600; font-size: 0.95rem; transition: background 0.2s; }
                  button:hover { background: #1d4ed8; }
                </style>
              </head>
              <body>
                <div class="card">
                  <h1>Offline Mode Active</h1>
                  <p>You are currently offline. Any challenge drafts or observations created while offline are stored in your device's local outbox and will automatically sync when connectivity returns.</p>
                  <button onclick="window.location.reload()">Retry Connection</button>
                </div>
              </body>
            </html>`,
            {
              headers: { "Content-Type": "text/html; charset=utf-8" },
              status: 200,
            }
          );
        })
    );
    return;
  }

  // 2. Static Assets: Cache-first
  const isStaticAsset =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".webp") ||
    url.pathname.endsWith(".woff2");

  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(request).then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200) {
            return networkResponse;
          }
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
          return networkResponse;
        });
      })
    );
    return;
  }

  // 3. Security Hygiene: Never cache private /api/ JSON responses
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  // Default: Stale-while-revalidate for generic GET
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
