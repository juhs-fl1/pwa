const STATIC_CACHE = 'zionhub-static-v1'
const DYNAMIC_CACHE = 'zionhub-dynamic-v1'

const BASE = self.registration.scope

const STATIC_ASSETS = [
    BASE + 'manifest.json',
]

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches
            .open(STATIC_CACHE)
            .then((cache) =>
                Promise.allSettled(STATIC_ASSETS.map((url) => cache.add(url))),
            )
            .then(() => self.skipWaiting()),
    )
})

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys
                    .filter((key) => key !== STATIC_CACHE && key !== DYNAMIC_CACHE)
                    .map((key) => caches.delete(key)),
            ),
        ),
    )
    self.clients.claim()
})

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return

    const url = new URL(event.request.url)

    // Next.js 정적 자산 (파일명에 해시 포함) → Cache-First
    if (url.pathname.startsWith('/_next/static/')) {
        event.respondWith(
            caches.match(event.request).then((cached) => {
                if (cached) return cached

                return fetch(event.request).then((response) => {
                    if (!response || response.status !== 200) return response
                    const cloned = response.clone()
                    caches.open(STATIC_CACHE).then((cache) => cache.put(event.request, cloned))
                    return response
                })
            }),
        )
        return
    }

    // HTML 네비게이션 → Network-First (항상 최신 페이지)
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    if (!response || response.status !== 200) return response
                    const cloned = response.clone()
                    caches.open(DYNAMIC_CACHE).then((cache) => cache.put(event.request, cloned))
                    return response
                })
                .catch(() => caches.match(event.request).then((cached) => cached || caches.match(BASE))),
        )
        return
    }

    // 그 외 → Network-First with dynamic cache fallback
    event.respondWith(
        fetch(event.request)
            .then((response) => {
                if (!response || response.status !== 200 || response.type === 'opaque') {
                    return response
                }
                const cloned = response.clone()
                caches.open(DYNAMIC_CACHE).then((cache) => cache.put(event.request, cloned))
                return response
            })
            .catch(() => caches.match(event.request)),
    )
})

self.addEventListener('message', (event) => {
    if (event.data === 'SKIP_WAITING') {
        self.skipWaiting()
    }
})
