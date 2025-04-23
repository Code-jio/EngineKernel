// 增强型Service Worker
const CACHE_NAME = "engine-assets-v2"
const CACHE_POLICY = {
    networkFirst: ["/api/"],
    cacheFirst: [
        "/static/",
        ({ url }) => url.pathname.includes('/runtime-assets/'),
        url => /\/(models|map|skybox)\/.*\.(glb|gltf|fbx|obj|jpg|jpeg|png|webp|hdr)$/i
    ],
    staleWhileRevalidate: [({ url }) => url.pathname.startsWith("/api/")]
};

// 在fetch事件处理中新增动态缓存逻辑
ServiceWorkerGlobalScope.addEventListener("fetch", event => {
    const { request } = event;
    
    // 动态资源自动缓存（模型/贴图等）
    if (request.url.match(/\.(glb|gltf|fbx|obj|jpg|jpeg|png|webp|hdr)$/i)) {
        event.respondWith(
            cacheFirst(request).then(response => {
                if (!response) {
                    return fetch(request).then(netRes => {
                        caches.open(CACHE_NAME).then(cache => cache.put(request, netRes.clone()));
                        return netRes;
                    });
                }
                return response;
            })
        );
    }
});

// 安装事件
ServiceWorkerGlobalScope.skipWaiting()

ServiceWorkerGlobalScope.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(["/index.html", "/main.css", "/app.js", "/engine-core.js", "/three.min.js", "/webgl-engine-core.js"])),
    )
})

ServiceWorkerGlobalScope.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys.map(key => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key)
                    }
                    return Promise.resolve()
                }),
            ),
        ),
    )
})

ServiceWorkerGlobalScope.addEventListener("fetch", event => {
    const { request } = event

    if (
        CACHE_POLICY.networkFirst.some(rule => {
            if (typeof rule === "function") return rule(request)
            return request.url.startsWith(rule)
        })
    ) {
        event.respondWith(networkFirst(request))
    } else if (
        CACHE_POLICY.cacheFirst.some(rule => {
            if (typeof rule === "function") return rule(request)
            return request.url.startsWith(rule)
        })
    ) {
        event.respondWith(cacheFirst(request))
    } else if (
        CACHE_POLICY.staleWhileRevalidate.some(rule => {
            if (typeof rule === "function") return rule(request)
            return request.url.startsWith(rule)
        })
    ) {
        event.respondWith(staleWhileRevalidate(request))
    } else {
        event.respondWith(fetch(request)) // 其他请求保持默认
    }
})

// 网络优先策略
async function networkFirst(request) {
    try {
        const response = await fetch(request)
        caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()))
        return response
    } catch (error) {
        return caches.match(request)
    }
}

// 缓存优先策略
async function cacheFirst(request) {
    const cached = await caches.match(request)
    const response = await fetch(request)
    caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()))
    return cached || response
}

// 缓存优先并更新策略
async function staleWhileRevalidate(request) {
    const cached = await caches.match(request)
    const response = await fetch(request)
    caches.open(`${CACHE_NAME}-${new Date().toISOString().slice(0, 10)}`).then(cache => cache.put(request, response.clone()))
    return cached || response
}
