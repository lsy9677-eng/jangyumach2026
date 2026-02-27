const CACHE_NAME = "jangyu-tennis-v4";

// 정적 자산만 캐시 (index.html 제외 - 항상 최신본 사용)
const STATIC_ASSETS = [
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-180.png"
];

// SKIP_WAITING 메시지 수신 → 즉시 활성화
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    // 이전 버전 캐시 전부 삭제
    caches.keys()
      .then(keys => Promise.all(keys.map(k => k !== CACHE_NAME ? caches.delete(k) : null)))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // ① 외부 API / CDN → SW 개입 없이 그냥 통과
  if (
    url.hostname.includes("googleapis.com") ||
    url.hostname.includes("firebaseio.com") ||
    url.hostname.includes("firebase.com") ||
    url.hostname.includes("gstatic.com") ||
    url.hostname.includes("cdnjs.cloudflare.com") ||
    url.hostname.includes("fonts.gstatic.com")
  ) return;

  // ② HTML 네비게이션(루트/인덱스) → 항상 네트워크 우선 (캐시 무효화 핵심!)
  if (req.mode === "navigate" || url.pathname.endsWith("/") || url.pathname.endsWith("/index.html")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // ③ SW/manifest → 네트워크 우선 (업데이트 반영)
  if (url.pathname.endsWith("/sw.js") || url.pathname.endsWith("/manifest.json")) {
    event.respondWith(fetch(req).catch(() => caches.match(req)));
    return;
  }

  // ③ sw.js, manifest.json → 네트워크 우선 (구버전 SW 방지)
  if (url.pathname === "/sw.js" || url.pathname === "/manifest.json") {
    event.respondWith(fetch(req).catch(() => caches.match(req)));
    return;
  }

  // ④ 아이콘 등 정적 자산 → 캐시 우선
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(resp => {
        try {
          if (url.origin === self.location.origin) {
            caches.open(CACHE_NAME).then(c => c.put(req, resp.clone()));
          }
        } catch(e) {}
        return resp;
      }).catch(() => caches.match(req));
    })
  );
});
