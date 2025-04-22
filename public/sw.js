// 增强型Service Worker
const CACHE_NAME = "engine-assets-v2"
const CACHE_POLICY = {
    networkFirst: ["/api/"],
    cacheFirst: ["/static/", "/models/"],
}

ServiceWorkerGlobalScope.prototype.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(["/static/base.glb", "/static/environment.hdr"])),
    )
})

ServiceWorkerGlobalScope.prototype.addEventListener("fetch", event => {
    const { request } = event

    // 网络优先策略
    if (CACHE_POLICY.networkFirst.some(path => request.url.includes(path))) {
        event.respondWith(networkFirst(request))
    } else {
        event.respondWith(cacheFirst(request))
    }
})

async function networkFirst(request) {
    try {
        return await fetch(request)
    } catch (error) {
        return caches.match(request)
    }
}

async function cacheFirst(request) {
    const cached = await caches.match(request)
    return cached || fetch(request)
}
