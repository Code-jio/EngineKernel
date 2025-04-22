// 增强型Service Worker
const CACHE_NAME = "engine-assets-v2"
const CACHE_POLICY = {
    networkFirst: ["/api/"],
    cacheFirst: ["/static/", "/models/"],
}

// 安装事件
ServiceWorkerGlobalScope.prototype.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(["/static/base.glb", "/static/environment.hdr"])),
    )
})

// 激活事件
ServiceWorkerGlobalScope.prototype.addEventListener("fetch", event => {
    const { request } = event

    // 网络优先策略
    if (CACHE_POLICY.networkFirst.some(path => request.url.includes(path))) {
        event.respondWith(networkFirst(request))
    } else {
        event.respondWith(cacheFirst(request))
    }
})

// 网络优先策略
async function networkFirst(request) {
    try {
        return await fetch(request)
    } catch (error) {
        return caches.match(request)
    }
}

// 缓存优先策略
async function cacheFirst(request) {
    const cached = await caches.match(request)
    return cached || fetch(request)
}
