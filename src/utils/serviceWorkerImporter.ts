/**
 * Service Worker 导入工具
 * 提供通过引擎包导入方式使用 Service Worker 的功能
 */

/**
 * 获取 Service Worker 的 URL
 * 支持通过引擎包导入和本地文件两种方式
 */
export async function getServiceWorkerUrl(): Promise<string> {
  // 在开发环境下，尝试通过相对路径访问EngineKernel的dist目录
  if (process.env.NODE_ENV === 'development') {
    // 检查是否可以通过相对路径访问EngineKernel的dist目录
    const relativePath = '../EngineKernel/dist/public/network-interceptor-sw.js';
    
    // 尝试通过fetch检查文件是否存在
    try {
      const response = await fetch(relativePath);
      if (response.ok) {
        return relativePath;
      }
    } catch (error) {
      console.warn('[ServiceWorkerImporter] 相对路径访问失败，尝试其他方式:', error);
    }
    
    // 如果相对路径失败，尝试使用绝对路径
    try {
      const absolutePath = '/network-interceptor-sw.js';
      const response = await fetch(absolutePath);
      if (response.ok) {
        return absolutePath;
      }
    } catch (error) {
      console.warn('[ServiceWorkerImporter] 绝对路径访问失败:', error);
    }
    
    // 如果都失败，返回默认路径
    return '/network-interceptor-sw.js';
  }

  // 在生产环境下，尝试通过引擎包导入
  try {
    // 检查是否可以通过引擎包导入
    const swModule = await dynamicImportServiceWorker();
    if (swModule && typeof swModule.default === 'string') {
      return swModule.default;
    }
  } catch (error) {
    // 引擎包导入失败，使用本地文件
    console.warn('[ServiceWorkerImporter] 引擎包导入失败，使用本地文件:', error);
  }

  // 使用本地文件路径
  return '/network-interceptor-sw.js';
}

/**
 * 动态导入 Service Worker 的包装函数
 * 使用eval来避免Webpack的静态分析
 */
async function dynamicImportServiceWorker() {
  // 只在生产环境下执行动态导入
  if (process.env.NODE_ENV === 'production') {
    // 使用Function构造函数来避免Webpack的静态分析
    const importFunc = new Function('return import("enginekernel/network-interceptor-sw.js")');
    return await importFunc();
  }
  return null;
}

/**
 * 动态导入 Service Worker 文件
 * 支持开发和生产环境
 */
export async function importServiceWorker(): Promise<string> {
  // 在开发环境下，使用本地文件
  if (process.env.NODE_ENV === 'development') {
    return '/network-interceptor-sw.js';
  }

  // 在生产环境下，尝试通过引擎包导入
  try {
    // 使用动态导入，但只在生产环境下
    if (process.env.NODE_ENV === 'production') {
      const swModule = await dynamicImportServiceWorker();
      if (swModule && typeof swModule.default === 'string') {
        return swModule.default;
      }
    }
  } catch (error) {
    console.warn('[ServiceWorkerImporter] 引擎包导入失败，使用本地文件:', error);
  }

  // 默认使用本地文件
  return '/network-interceptor-sw.js';
}

/**
 * 检查 Service Worker 是否可用
 */
export function isServiceWorkerSupported(): boolean {
  return 'serviceWorker' in navigator;
}

/**
 * 注册 Service Worker
 * @param swPath Service Worker 文件路径
 * @param scope Service Worker 作用域
 */
export async function registerServiceWorker(swPath?: string, scope = '/'): Promise<ServiceWorkerRegistration> {
  if (!isServiceWorkerSupported()) {
    throw new Error('Service Worker 不支持当前浏览器');
  }

  // 如果没有提供路径，自动获取
  const finalSwPath = swPath || await importServiceWorker();

  try {
    const registration = await navigator.serviceWorker.register(finalSwPath, {
      scope,
    });

    console.log('[ServiceWorkerImporter] Service Worker 注册成功:', registration);
    return registration;
  } catch (error) {
    console.error('[ServiceWorkerImporter] Service Worker 注册失败:', error);
    throw error;
  }
}

/**
 * 获取 Service Worker 注册状态
 */
export async function getServiceWorkerStatus(): Promise<{
  isRegistered: boolean;
  isActive: boolean;
  registration?: ServiceWorkerRegistration;
}> {
  if (!isServiceWorkerSupported()) {
    return { isRegistered: false, isActive: false };
  }

  const registration = await navigator.serviceWorker.ready;
  
  return {
    isRegistered: !!registration,
    isActive: registration?.active?.state === 'activated',
    registration,
  };
}