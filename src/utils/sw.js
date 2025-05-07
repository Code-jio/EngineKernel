import { precacheAndRoute } from "workbox-precaching"
import { registerRoute } from "workbox-routing"
import { CacheFirst, StaleWhileRevalidate } from "workbox-strategies"
import { ExpirationPlugin } from "workbox-expiration"

// 预缓存webpack生成的清单
precacheAndRoute(self.__WB_MANIFEST)

// 静态资源缓存策略
registerRoute(
    ({ request }) => request.destination === "script" || request.destination === "style",
    new StaleWhileRevalidate({
        cacheName: "engine-core-v1-static",
        plugins: [
            new ExpirationPlugin({
                maxEntries: 50,
                maxAgeSeconds: 30 * 24 * 60 * 60,
            }),
        ],
    }),
)

// 动态资源缓存策略
registerRoute(
    ({ request }) => request.destination === "image",
    new CacheFirst({
        cacheName: "engine-core-v1-dynamic",
        plugins: [
            new ExpirationPlugin({
                maxEntries: 100,
                maxAgeSeconds: 7 * 24 * 60 * 60,
            }),
        ],
    }),
)
