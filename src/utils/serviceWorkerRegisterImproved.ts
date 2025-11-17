export interface ServiceWorkerRegistrationOptions {
  swPath?: string;
  scope?: string;
  forceUpdate?: boolean; // 强制更新到最新版本
  timeout?: number; // 注册超时时间（毫秒）
}

/**
 * 等待Service Worker控制器变为可用
 */
function waitForController(timeout: number = 10000): Promise<ServiceWorker> {
  return new Promise((resolve, reject) => {
    // 如果已经有控制器，立即返回
    if (navigator.serviceWorker.controller) {
      resolve(navigator.serviceWorker.controller);
      return;
    }

    // 监听控制器变化
    const controllerChangeHandler = () => {
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.removeEventListener('controllerchange', controllerChangeHandler);
        resolve(navigator.serviceWorker.controller);
      }
    };

    navigator.serviceWorker.addEventListener('controllerchange', controllerChangeHandler);

    // 设置超时
    setTimeout(() => {
      navigator.serviceWorker.removeEventListener('controllerchange', controllerChangeHandler);
      reject(new Error(`等待Service Worker控制页面超时 (${timeout}ms)`));
    }, timeout);
  });
}

/**
 * 等待Service Worker激活
 */
function waitForActivation(registration: ServiceWorkerRegistration, timeout: number = 10000): Promise<void> {
  return new Promise((resolve, reject) => {
    const worker = registration.installing || registration.waiting || registration.active;
    
    if (!worker) {
      reject(new Error('无法获取Service Worker实例'));
      return;
    }

    if (worker.state === 'activated') {
      resolve();
      return;
    }

    const stateChangeHandler = () => {
      if (worker.state === 'activated') {
        worker.removeEventListener('statechange', stateChangeHandler);
        resolve();
      } else if (worker.state === 'redundant') {
        worker.removeEventListener('statechange', stateChangeHandler);
        reject(new Error('Service Worker被废弃'));
      }
    };

    worker.addEventListener('statechange', stateChangeHandler);

    // 设置超时
    setTimeout(() => {
      worker.removeEventListener('statechange', stateChangeHandler);
      reject(new Error(`等待Service Worker激活超时 (${timeout}ms)`));
    }, timeout);
  });
}

/**
 * 检查浏览器是否支持Service Worker
 */
export function isServiceWorkerSupported(): boolean {
  // 基本支持检查
  const hasServiceWorker = 'serviceWorker' in navigator;
  
  if (!hasServiceWorker) {
    console.warn('[ServiceWorkerRegisterImproved] navigator.serviceWorker不存在');
    return false;
  }
  
  // 检查是否是安全上下文（HTTPS或localhost）
  const isSecureContext = window.isSecureContext;
  
  if (!isSecureContext) {
    console.warn('[ServiceWorkerRegisterImproved] 非安全上下文，Service Worker可能无法正常工作');
    // 在非安全上下文中，我们仍然返回true，但会记录警告
  }
  
  // 检查是否在iframe中（某些情况下有限制）
  const inIframe = window !== window.parent;
  if (inIframe) {
    console.warn('[ServiceWorkerRegisterImproved] 在iframe中运行，Service Worker可能受限');
  }
  
  return true;
}

/**
 * 改进的Service Worker注册函数
 * 确保立即激活并开始拦截网络请求
 */
export async function registerServiceWorkerImproved(
  options: ServiceWorkerRegistrationOptions = {}
): Promise<{
  registration: ServiceWorkerRegistration;
  controller: ServiceWorker | null;
}> {
  if (!isServiceWorkerSupported()) {
    const errorMsg = '当前浏览器不支持Service Worker或环境不支持Service Worker运行';
    console.error('[ServiceWorkerRegisterImproved]', errorMsg);
    console.error('[ServiceWorkerRegisterImproved] 请检查：');
    console.error('[ServiceWorkerRegisterImproved] 1. 浏览器版本是否足够新');
    console.error('[ServiceWorkerRegisterImproved] 2. 是否在HTTPS或localhost环境下运行');
    console.error('[ServiceWorkerRegisterImproved] 3. 是否在iframe或有特殊限制的环境中运行');
    throw new Error(errorMsg);
  }

  const {
    swPath = '/network-interceptor-sw.js',
    scope = '/',
    forceUpdate = true,
    timeout = 15000
  } = options;

  try {
    // 1. 注销可能存在的旧Service Worker（可选）
    if (forceUpdate) {
      const existingRegs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(existingRegs.map(reg => reg.unregister()));
    }

    // 2. 注册Service Worker
    const registration = await navigator.serviceWorker.register(swPath, {
      scope,
      updateViaCache: 'none' // 禁用缓存更新，确保获取最新版本
    });

    // 3. 等待Service Worker激活
    await waitForActivation(registration, timeout);

    // 4. 等待Service Worker开始控制页面
    const controller = await waitForController(timeout);

    // 5. 如果有等待的Service Worker，强制激活
    if (registration.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      
      // 再次等待激活
      await waitForActivation(registration, timeout);
    }

    // 6. 确认Service Worker已经控制页面
    if (!navigator.serviceWorker.controller) {
      const errorMsg = 'Service Worker注册成功但未控制页面';
      console.error('[ServiceWorkerRegisterImproved] ❌', errorMsg);
      throw new Error(errorMsg);
    }

    return {
      registration,
      controller: navigator.serviceWorker.controller
    };

  } catch (error) {
    console.error('[ServiceWorkerRegisterImproved] ❌ Service Worker 注册失败:', error);
    
    // 提供更详细的错误信息
    if (error instanceof Error) {
      console.error('[ServiceWorkerRegisterImproved] 错误详情:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
    }
    
    throw error;
  }
}

/**
 * 检查Service Worker是否完全激活并控制页面
 */
export async function isServiceWorkerActive(): Promise<boolean> {
  if (!isServiceWorkerSupported()) {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const isActive = registration.active?.state === 'activated';
    const hasController = !!navigator.serviceWorker.controller;
    
    return isActive && hasController;
  } catch {
    return false;
  }
}

/**
 * 立即激活Service Worker并确保控制页面
 */
export async function registerAndActivateImmediately(
  options: ServiceWorkerRegistrationOptions = {}
): Promise<{
  registration: ServiceWorkerRegistration;
  controller: ServiceWorker | null;
}> {
  const result = await registerServiceWorkerImproved({
    ...options,
    forceUpdate: true, // 强制更新
    timeout: 20000 // 增加超时时间
  });
  
  // 立即发送消息确保激活
  if (result.controller) {
    result.controller.postMessage({ type: 'IMMEDIATE_ACTIVATION' });
  }
  
  return result;
}

/**
 * 强制激活Service Worker（如果存在等待的版本）
 */
export async function forceActivateServiceWorker(): Promise<boolean> {
  try {
    const registration = await navigator.serviceWorker.ready;
    
    if (registration.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      
      // 等待激活完成
      await waitForActivation(registration);
      
      // 确认控制器状态
      await waitForController();
      
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('[ServiceWorkerRegisterImproved] 强制激活失败:', error);
    return false;
  }
}