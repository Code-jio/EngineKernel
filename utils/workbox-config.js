// Workbox 核心配置
module.exports = {
    globDirectory: "./dist/",
    globPatterns: ["**/*.{wasm,glsl,js,css,html,png,jpg,glb,bin}"],
    runtimeCaching: [
        {
            urlPattern: /\\.(wasm|glsl)$/,
            handler: "CacheFirst",
            options: {
                cacheName: "webgl-shaders-v1",
                expiration: {
                    maxEntries: 50,
                    maxAgeSeconds: 30 * 24 * 60 * 60,
                },
            },
        },
        {
            urlPattern: /\\.(glb|bin)$/,
            handler: "StaleWhileRevalidate",
            options: {
                cacheName: "3d-models-v1",
                cacheableResponse: { statuses: [0, 200] },
            },
        },
    ],
    skipWaiting: true,
    clientsClaim: true,
    navigateFallback: "/index.html",
}
