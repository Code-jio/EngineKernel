// Workbox 配置
module.exports = {
    globDirectory: "dist/",
    globPatterns: ["**/*.{gltf,png,jpg,hdr}"],
    swDest: "dist/sw.js", // 生成的 Service Worker 文件路径
    runtimeCaching: [
        {
            urlPattern: /.(gltf)$/,
            handler: "StaleWhileRevalidate",
            options: {
                cacheName: "gltf-cache-v1",
                expiration: {
                    maxEntries: 5000,
                    maxAgeSeconds: 30 * 24 * 60 * 60,
                },
            },
        },
        {
            urlPattern: /.(png|jpg)$/,
            handler: "CacheFirst",
            options: {
                cacheName: "texture-cache-v1",
                expiration: {
                    maxEntries: 10000,
                    maxAgeSeconds: 60 * 24 * 60 * 60,
                },
            },
        },
        {
            urlPattern: /.hdr$/,
            handler: "CacheFirst",
            options: {
                cacheName: "skybox-cache-v1",
                expiration: {
                    maxEntries: 20,
                    maxAgeSeconds: 60 * 24 * 60 * 60,
                },
            },
        },
    ],
}
