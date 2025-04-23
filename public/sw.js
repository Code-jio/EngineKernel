// 增强型Service Worker
const CACHE_NAME = "engine-assets-v2"
const CACHE_POLICY = {
    networkFirst: ["/api/"],
    cacheFirst: ["/static/", "/models/"],
}

// 安装事件
// 强制跳过等待阶段
ServiceWorkerGlobalScope.skipWaiting()

ServiceWorkerGlobalScope.addEventListener("install", event => {
    event.waitUntil(
        caches
            .open(CACHE_NAME)
            .then(cache =>
                cache.addAll([
                    "/static/base.glb",
                    "/static/environment.hdr",
                    "/models/main_scene.glb",
                    "/models/characters/",
                    "/materials/pbr/",
                    "/textures/compressed/",
                ]),
            ),
    )
})

// 激活事件
// 清理旧版本缓存
ServiceWorkerGlobalScope.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                // 修正 map 方法中箭头函数必须返回值的问题
                keys.map(key => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key)
                    }
                    // 当 key 等于 CACHE_NAME 时，返回一个已解决的 Promise
                    return Promise.resolve()
                }),
            ),
        ),
    )
})

ServiceWorkerGlobalScope.addEventListener("fetch", event => {
    const { request } = event

    // 网络优先策略
    if (CACHE_POLICY.networkFirst.some(path => request.url.startsWith(path))) {
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
