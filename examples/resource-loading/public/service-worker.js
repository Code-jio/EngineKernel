// 资源缓存服务工作线程 - 使用Workbox API
importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js');

// 设置调试模式（生产环境中应禁用）
workbox.setConfig({ debug: false });

// 使用Workbox的预缓存功能
workbox.precaching.precacheAndRoute([
  // 这里可以放置需要预缓存的静态资源
  // 如：{ url: '/index.html', revision: '123456' }
]);

// 缓存策略配置
const resourceCacheConfig = {
  // 图片缓存策略
  images: {
    cacheName: 'image-cache',
    maxEntries: 50,
    maxAgeSeconds: 7 * 24 * 60 * 60 // 一周
  },
  // 模型文件缓存策略
  models: {
    cacheName: 'model-cache',
    maxEntries: 30,
    maxAgeSeconds: 14 * 24 * 60 * 60 // 两周
  },
  // 天空盒缓存策略
  skyboxes: {
    cacheName: 'skybox-cache',
    maxEntries: 10,
    maxAgeSeconds: 30 * 24 * 60 * 60 // 一个月
  },
  // 地图数据缓存策略
  maps: {
    cacheName: 'map-cache',
    maxEntries: 20,
    maxAgeSeconds: 7 * 24 * 60 * 60 // 一周
  }
};

// 注册图片缓存路由
workbox.routing.registerRoute(
  ({ request }) => request.destination === 'image',
  new workbox.strategies.CacheFirst({
    cacheName: resourceCacheConfig.images.cacheName,
    plugins: [
      new workbox.expiration.ExpirationPlugin({
        maxEntries: resourceCacheConfig.images.maxEntries,
        maxAgeSeconds: resourceCacheConfig.images.maxAgeSeconds
      }),
      new workbox.cacheableResponse.CacheableResponsePlugin({
        statuses: [0, 200]
      })
    ]
  })
);

// 注册模型文件缓存路由 (gltf, glb, obj, fbx等)
workbox.routing.registerRoute(
  ({ url }) => 
    url.pathname.endsWith('.gltf') || 
    url.pathname.endsWith('.glb') || 
    url.pathname.endsWith('.obj') || 
    url.pathname.endsWith('.fbx'),
  new workbox.strategies.CacheFirst({
    cacheName: resourceCacheConfig.models.cacheName,
    plugins: [
      new workbox.expiration.ExpirationPlugin({
        maxEntries: resourceCacheConfig.models.maxEntries,
        maxAgeSeconds: resourceCacheConfig.models.maxAgeSeconds
      }),
      new workbox.cacheableResponse.CacheableResponsePlugin({
        statuses: [0, 200]
      })
    ]
  })
);

// 注册天空盒文件缓存路由
workbox.routing.registerRoute(
  ({ url }) => 
    url.pathname.includes('/skybox/') || 
    url.pathname.endsWith('.hdr') || 
    url.pathname.endsWith('.dds') || 
    url.pathname.endsWith('.env'),
  new workbox.strategies.CacheFirst({
    cacheName: resourceCacheConfig.skyboxes.cacheName,
    plugins: [
      new workbox.expiration.ExpirationPlugin({
        maxEntries: resourceCacheConfig.skyboxes.maxEntries,
        maxAgeSeconds: resourceCacheConfig.skyboxes.maxAgeSeconds
      }),
      new workbox.cacheableResponse.CacheableResponsePlugin({
        statuses: [0, 200]
      })
    ]
  })
);

// 注册地图数据缓存路由
workbox.routing.registerRoute(
  ({ url }) => 
    url.pathname.includes('/maps/') || 
    url.pathname.endsWith('.json') || 
    url.pathname.endsWith('.geojson'),
  new workbox.strategies.NetworkFirst({
    cacheName: resourceCacheConfig.maps.cacheName,
    plugins: [
      new workbox.expiration.ExpirationPlugin({
        maxEntries: resourceCacheConfig.maps.maxEntries,
        maxAgeSeconds: resourceCacheConfig.maps.maxAgeSeconds
      }),
      new workbox.cacheableResponse.CacheableResponsePlugin({
        statuses: [0, 200]
      })
    ]
  })
);

// 拦截资源加载请求，并向主线程发送加载进度消息
self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  if (url.includes('/models/') || url.includes('/textures/') || url.includes('/skybox/') || url.includes('/maps/')) {
    // 这里不中断默认的fetch处理，只是添加进度跟踪
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // 克隆响应以便可以读取内容
          const clonedResponse = response.clone();
          
          // 获取响应内容大小
          const contentLength = response.headers.get('content-length');
          const total = contentLength ? parseInt(contentLength, 10) : 0;
          
          // 创建响应流读取器
          const reader = clonedResponse.body.getReader();
          let loaded = 0;
          
          // 定期向主线程发送进度更新
          const stream = new ReadableStream({
            start(controller) {
              function push() {
                reader.read().then(({ done, value }) => {
                  if (done) {
                    controller.close();
                    
                    // 加载完成后发送消息
                    self.clients.matchAll().then(clients => {
                      clients.forEach(client => {
                        client.postMessage({
                          type: 'CACHE_COMPLETE',
                          url: url,
                          total: total,
                          loaded: loaded
                        });
                      });
                    });
                    
                    return;
                  }
                  
                  loaded += value.length;
                  
                  // 每增加10%发送一次进度更新
                  if (total && loaded % Math.floor(total / 10) < value.length) {
                    const progress = Math.round((loaded / total) * 100);
                    
                    self.clients.matchAll().then(clients => {
                      clients.forEach(client => {
                        client.postMessage({
                          type: 'CACHE_PROGRESS',
                          url: url,
                          total: total,
                          loaded: loaded,
                          progress: progress
                        });
                      });
                    });
                  }
                  
                  controller.enqueue(value);
                  push();
                }).catch(error => {
                  console.error('读取流错误:', error);
                  controller.error(error);
                });
              }
              
              push();
            }
          });
          
          // 创建新的响应对象
          return new Response(stream, {
            headers: response.headers,
            status: response.status,
            statusText: response.statusText
          });
        })
        .catch(error => {
          console.error('资源加载错误:', error);
          throw error;
        })
    );
  }
});

// 安装事件 - 预缓存关键资源
self.addEventListener('install', event => {
  console.log('Service Worker 安装完成');
  self.skipWaiting(); // 立即激活
});

// 激活事件 - 清理旧缓存
self.addEventListener('activate', event => {
  console.log('Service Worker 已激活');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // 删除不在配置中的旧缓存
          const isConfiguredCache = Object.values(resourceCacheConfig)
            .some(config => config.cacheName === cacheName);
          
          if (!isConfiguredCache) {
            console.log('删除旧缓存:', cacheName);
            return caches.delete(cacheName);
          }
          
          return null;
        }).filter(Boolean)
      );
    }).then(() => {
      console.log('缓存清理完成');
      return self.clients.claim(); // 接管所有客户端
    })
  );
}); 