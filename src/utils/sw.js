const CACHE_VERSION = 'v3';
const CACHE_NAME = `engine-core-${CACHE_VERSION}-${new Date().toISOString().slice(0, 10)}`;
const CACHE_POLICY = {
    networkFirst: [
        // 网络优先策略的规则
        '/api/'
    ],
    cacheFirst: [
        // 缓存优先策略的规则
        /^\/static\//,
        /(\.wgsl|\.wasm|\.spv)$/
    ],
    staleWhileRevalidate: [
        // 缓存优先并更新策略的规则
        /(\.vert|\.frag|\.glsl)$/
    ],
}

// 跳过等待
this.skipWaiting()

// 安装事件处理逻辑
this.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => 
            cache.addAll([
                '/static/',
                '/static/css/main.css',
                '/static/js/bundle.js',
                '/static/media/logo.svg'
            ])
        )
    )
})

this.addEventListener("activate", event => {
    event.waitUntil(
        caches
            .keys()
            .then(keys =>
                Promise.all(
                    keys.map(key => {
                        if (!key.startsWith("engine-assets-")) {
                            return caches.delete(key)
                        }
                        if (key !== CACHE_NAME) {
                            return caches.delete(key)
                        }
                        return Promise.resolve()
                    }),
                ),
            )
            .then(() => this.clients.claim()),
    )
})

this.addEventListener("fetch", event => {
    const { request } = event

    if (
        CACHE_POLICY.networkFirst.some(rule => {
            if (typeof rule === "function") return rule(request)
            return request.url.startsWith(rule)
        })
    ) {
        event.respondWith(networkFirst(request))
    } else if (
        // 缓存优先策略
        CACHE_POLICY.cacheFirst.some(rule => {
            if (typeof rule === "function") return rule(request)
            return request.url.startsWith(rule)
        })
    ) {
        event.respondWith(cacheFirst(request))
    } else if (
        // 缓存优先并更新策略
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
    const startTime = performance.now();
    try {
        const response = await fetch(request)
        caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()))
        const duration = performance.now() - startTime;
        self.clients.matchAll().then(clients => {
            clients.forEach(client => client.postMessage({type: 'CACHE_PERF', url: request.url, duration}));
        });
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
    const duration = performance.now() - startTime;
    self.clients.matchAll().then(clients => {
        clients.forEach(client => client.postMessage({type: 'CACHE_PERF', url: request.url, duration}));
    });
    return cached || response
}

// 缓存优先并更新策略
async function staleWhileRevalidate(request) {
    const cached = await caches.match(request)
    const response = await fetch(request)
    caches
        .open(`${CACHE_NAME}-${new Date().toISOString().slice(0, 10)}`)
        .then(cache => cache.put(request, response.clone()))
    const duration = performance.now() - startTime;
    self.clients.matchAll().then(clients => {
        clients.forEach(client => client.postMessage({type: 'CACHE_PERF', url: request.url, duration}));
    });
    return cached || response
}
export { CACHE_VERSION }