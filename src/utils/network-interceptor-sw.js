// Service Worker 网络请求拦截器
// 用于拦截和记录所有网络请求

const CACHE_NAME = 'network-interceptor-v1';
const LOG_PREFIX = '[SW-Network-Interceptor]';

class NetworkInterceptor {
    constructor() {
        this.requestMap = new Map(); // 用于跟踪请求和响应时间
        this.init();
    }

    init() {
        self.addEventListener('install', this.handleInstall.bind(this));
        self.addEventListener('activate', this.handleActivate.bind(this));
        self.addEventListener('fetch', this.handleFetch.bind(this));
        self.addEventListener('message', this.handleMessage.bind(this));
        
    }

    // 安装事件处理
    handleInstall(event) {
        
        event.waitUntil(
            // 可选的预缓存逻辑
            caches.open(CACHE_NAME)
                .then(cache => {
                    return cache; // 这里可以添加需要预缓存的资源
                })
                .then(() => {
                    return self.skipWaiting(); // 关键：立即激活
                })
                .catch(error => {
                    console.error(`${LOG_PREFIX} 安装失败:`, error);
                })
        );
    }

    // 激活事件处理
    handleActivate(event) {
        
        event.waitUntil(
            Promise.all([
                // 清理旧缓存
                this.cleanupOldCaches(),
                // 立即控制所有客户端
                self.clients.claim().then(() => {
                    return this.notifyClients('SW_ACTIVATED');
                })
            ]).then(() => {
            })
        );
        
    }

    // 清理旧缓存
    async cleanupOldCaches() {
        try {
            const cacheKeys = await caches.keys();
            const deletePromises = cacheKeys
                .filter(key => key.startsWith('network-interceptor-') && key !== CACHE_NAME)
                .map(key => {
                    return caches.delete(key);
                });
            
            await Promise.all(deletePromises);
        } catch (error) {
            console.warn(`${LOG_PREFIX} 清理缓存失败:`, error);
        }
    }

    // 拦截网络请求
    handleFetch(event) {
        const { request } = event;
        const requestId = this.generateRequestId(request);
        const startTime = Date.now();

        // 记录请求开始时间
        this.requestMap.set(requestId, { startTime, request });

        // 发送请求信息
        this.sendRequestInfo(request, requestId, startTime);

        // 处理请求
        event.respondWith(this.processRequest(event, request, requestId, startTime));
    }

    // 生成请求ID
    generateRequestId(request) {
        return `${request.url}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    // 发送请求信息到客户端
    sendRequestInfo(request, requestId, startTime) {
        const requestInfo = {
            requestId,
            type: 'request',
            timestamp: startTime,
            url: request.url,
            method: request.method,
            headers: this.serializeHeaders(request.headers),
            mode: request.mode,
            credentials: request.credentials,
            cache: request.cache,
            redirect: request.redirect,
            referrer: request.referrer,
            referrerPolicy: request.referrerPolicy
        };


        this.sendToClients({
            type: 'NETWORK_REQUEST',
            data: requestInfo
        });
    }

    // 处理请求
    async processRequest(event, request, requestId, startTime) {
        try {
            const response = await fetch(request.clone());
            await this.handleResponse(response, request, requestId, startTime);
            return response;
            
        } catch (error) {
            await this.handleError(error, request, requestId, startTime);
            throw error; // 重新抛出错误，让页面也能收到
        }
    }

    // 处理成功响应
    async handleResponse(response, request, requestId, startTime) {
        const endTime = Date.now();
        const responseTime = endTime - startTime;

        // 克隆响应以读取内容
        const responseClone = response.clone();
        
        const responseInfo = {
            requestId,
            type: 'response',
            timestamp: endTime,
            url: request.url,
            status: response.status,
            statusText: response.statusText,
            headers: this.serializeHeaders(response.headers),
            ok: response.ok,
            redirected: response.redirected,
            type: response.type,
            responseTime
        };

        // 尝试获取响应体大小（非阻塞）
        this.getResponseSize(responseClone).then(size => {
            responseInfo.size = size;
            this.sendResponseInfo(responseInfo);
        }).catch(() => {
            this.sendResponseInfo(responseInfo);
        });

        this.requestMap.delete(requestId);
    }

    // 处理错误
    async handleError(error, request, requestId, startTime) {
        const endTime = Date.now();
        const errorTime = endTime - startTime;

        const errorInfo = {
            requestId,
            type: 'error',
            timestamp: endTime,
            url: request.url,
            method: request.method,
            error: error.toString(),
            errorTime
        };

        console.error(`${LOG_PREFIX} 请求失败`, {
            '❌ 错误时间:': new Date(endTime).toISOString(),
            '🔗 URL:': request.url,
            '⚡ 方法:': request.method,
            '💥 错误信息:': error.toString(),
            '🆔 请求ID:': requestId
        });

        this.sendToClients({
            type: 'NETWORK_ERROR',
            data: errorInfo
        });

        this.requestMap.delete(requestId);
    }

    // 发送响应信息
    sendResponseInfo(responseInfo) {

        this.sendToClients({
            type: 'NETWORK_RESPONSE',
            data: responseInfo
        });
    }

    // 获取响应体大小
    async getResponseSize(response) {
        try {
            const blob = await response.blob();
            return blob.size;
        } catch (error) {
            return null;
        }
    }

    // 格式化字节大小
    formatBytes(bytes) {
        if (!bytes) return '未知';
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // 序列化Headers对象
    serializeHeaders(headers) {
        const result = {};
        for (const [key, value] of headers.entries()) {
            result[key] = value;
        }
        return result;
    }

    // 发送消息到所有客户端
    sendToClients(message) {
        self.clients.matchAll({
            includeUncontrolled: true, // 包括未控制的客户端
            type: 'window'
        }).then(clients => {
            clients.forEach(client => {
                try {
                    client.postMessage(message);
                } catch (error) {
                    console.warn(`${LOG_PREFIX} 发送消息到客户端失败:`, error);
                }
            });
        }).catch(error => {
            console.warn(`${LOG_PREFIX} 获取客户端列表失败:`, error);
        });
    }

    // 通知客户端特定事件
    notifyClients(eventType, data = {}) {
        this.sendToClients({
            type: eventType,
            data: {
                timestamp: Date.now(),
                ...data
            }
        });
    }

    // 处理来自客户端的消息
    handleMessage(event) {
        const { type, data } = event.data;
        const client = event.source;
        

        switch (type) {
            case 'SKIP_WAITING':
                self.skipWaiting();
                break;
                
            case 'IMMEDIATE_ACTIVATION':
                self.skipWaiting();
                // 立即通知客户端激活完成
                client.postMessage({
                    type: 'IMMEDIATE_ACTIVATION_CONFIRMED',
                    data: {
                        timestamp: Date.now(),
                        message: 'Service Worker已立即激活'
                    }
                });
                break;
                
            case 'GET_NETWORK_STATS':
                this.sendNetworkStats(client);
                break;
                
            case 'CLEAR_NETWORK_LOGS':
                this.requestMap.clear();
                break;
                
            case 'PING':
                // 返回连接确认消息（而不是PONG），让客户端能够识别为连接已建立
                client.postMessage({
                    type: 'CONNECTION_CONFIRMED',
                    data: { 
                        timestamp: Date.now(),
                        serviceWorkerTimestamp: data?.timestamp || Date.now(),
                        message: 'Service Worker连接确认'
                    }
                });
                break;
                
            case 'CONNECTION_ESTABLISHED':
                // 确认连接已建立
                client.postMessage({
                    type: 'CONNECTION_CONFIRMED',
                    data: {
                        timestamp: Date.now(),
                        message: 'Service Worker已确认连接'
                    }
                });
                break;
                
            default:
        }
    }

    // 发送网络统计信息
    sendNetworkStats(client) {
        const stats = {
            activeRequests: this.requestMap.size,
            timestamp: Date.now()
        };
        
        client.postMessage({
            type: 'NETWORK_STATS',
            data: stats
        });
    }
}

// 初始化网络拦截器
new NetworkInterceptor();