// 引擎内核模块的类型声明

/**
 * Service Worker 网络拦截器模块声明
 * 用于支持 enginekernel/network-interceptor-sw.js 模块导入
 */
declare module 'enginekernel/network-interceptor-sw.js' {
    /**
     * Service Worker 网络拦截器模块
     * 这是一个虚拟模块，实际内容在运行时通过动态导入加载
     */
    const content: string;
    export default content;
}