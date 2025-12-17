/**
 * GLTF Worker管理器
 * 提供在主线程中管理Web Worker的接口
 */

import { THREE } from '../utils/three-imports'
import eventBus from '../eventBus/eventBus'

// Worker消息类型
export interface WorkerMessage {
  type: 'init' | 'load' | 'progress' | 'complete' | 'error' | 'dispose'
  id?: string
  data?: any
}

// 加载任务接口
export interface LoadTask {
  id: string
  url: string
  config?: {
    dracoPath?: string
    ktx2Path?: string
    meshoptPath?: string
    enableDraco?: boolean
    enableKTX2?: boolean
    enableMeshopt?: boolean
  }
}

// 加载结果接口
export interface LoadResult {
  scene: THREE.Group | THREE.Scene | THREE.Object3D
  animations: any[]
  metadata: {
    url: string
    loadTime: number
    format: 'gltf' | 'glb'
  }
}

// Worker事件监听器类型
export type WorkerEventListener = (event: any) => void

/**
 * GLTF Worker管理器类
 */
export class GLTFWorkerManager {
  private worker: Worker | null = null
  private taskCallbacks: Map<string, {
    onProgress?: WorkerEventListener
    onComplete?: WorkerEventListener
    onError?: WorkerEventListener
  }> = new Map()
  private isInitialized: boolean = false
  private isInitializing: boolean = false
  private taskQueue: LoadTask[] = []
  private activeTasks: Set<string> = new Set()

  /**
   * 构造函数
   * @param workerScript Worker脚本路径
   */
  constructor(private workerScript?: string) {}

  /**
   * 初始化Worker
   * @param config 配置参数
   * @param renderer Three.js渲染器实例（可选，用于KTX2支持检测）
   */
  async initialize(config: any = {}, renderer?: THREE.WebGLRenderer): Promise<void> {
    if (this.isInitialized || this.isInitializing) {
      console.warn('[GLTF Worker Manager] Worker已经初始化或正在初始化')
      return
    }

    this.isInitializing = true

    try {
      // 创建Worker实例
      let workerPath = this.workerScript || this.getDefaultWorkerPath()
      
      // 确保worker脚本路径指向的是.js文件，而不是.ts文件
      if (workerPath.endsWith('.ts')) {
        workerPath = workerPath.replace('.ts', '.js')
      }
      
      this.worker = new Worker(workerPath)

      // 设置消息监听器
      this.setupMessageListener()

      // 发送初始化消息
      await this.sendMessage('init', {
        ...config,
        renderer: renderer || null
      })

      this.isInitialized = true
      this.isInitializing = false

      console.log('[GLTF Worker Manager] ✅ Worker初始化完成')
    } catch (error) {
      this.isInitializing = false
      console.error('[GLTF Worker Manager] ❌ Worker初始化失败:', error)
      // 不抛出错误，允许后续代码继续执行
      // 可以考虑添加降级机制
    }
  }

  /**
   * 获取默认Worker脚本路径
   */
  private getDefaultWorkerPath(): string {
    // 根据当前环境判断使用哪个版本
    if (typeof window !== 'undefined') {
      // 浏览器环境 - 返回正确的worker路径
      return '/engine/workers/gltfLoaderWorker.js'
    } else {
      // Node.js环境或其他
      return './public/engine/workers/gltfLoaderWorker.js'
    }
  }

  /**
   * 设置消息监听器
   */
  private setupMessageListener(): void {
    if (!this.worker) return

    this.worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const { type, id, data } = event.data

      console.log(`[GLTF Worker Manager] 收到消息: ${type}${id ? ` (任务ID: ${id})` : ''}`)

      switch (type) {
        case 'progress':
          // 处理进度更新
          if (id && this.taskCallbacks.has(id)) {
            const callbacks = this.taskCallbacks.get(id)!
            if (callbacks.onProgress) {
              callbacks.onProgress(data)
            }
          }
          // 同时发送事件总线消息
          eventBus.emit('worker:progress', {
            taskId: id,
            ...data
          })
          break

        case 'complete':
          // 处理完成消息
          if (id && this.taskCallbacks.has(id)) {
            const callbacks = this.taskCallbacks.get(id)!
            if (callbacks.onComplete) {
              callbacks.onComplete(data)
            }
            this.taskCallbacks.delete(id)
          }
          this.activeTasks.delete(id!)
          break

        case 'error':
          // 处理错误消息
          console.error(`[GLTF Worker Manager] Worker错误${id ? ` (任务ID: ${id})` : ''}:`, data)
          
          if (id && this.taskCallbacks.has(id)) {
            const callbacks = this.taskCallbacks.get(id)!
            if (callbacks.onError) {
              callbacks.onError(data)
            }
            this.taskCallbacks.delete(id)
          }
          this.activeTasks.delete(id!)
          
          // 发送错误事件总线消息
          eventBus.emit('worker:error', {
            taskId: id,
            ...data
          })
          break

        default:
          console.warn(`[GLTF Worker Manager] 未知的消息类型: ${type}`)
      }
    }

    this.worker.onerror = (error) => {
      console.error('[GLTF Worker Manager] Worker全局错误:', error)
      eventBus.emit('worker:error', {
        type: 'worker_error',
        error: error.message,
        stack: error.error?.stack
      })
    }
  }

  /**
   * 发送消息到Worker
   * @param type 消息类型
   * @param data 数据
   * @param id 任务ID
   */
  private sendMessage(type: string, data?: any, id?: string): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        reject(new Error('Worker未初始化'))
        return
      }

      const messageId = id || this.generateTaskId()
      const message: WorkerMessage = {
        type: type as any,
        id: messageId,
        data
      }

      // 如果是初始化消息，不需要等待回调
      if (type === 'init') {
        this.worker.postMessage(message)
        // 等待初始化完成的消息
        this.worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
          if (event.data.type === 'complete' && !event.data.id) {
            resolve(event.data.data)
          }
        }
        return
      }

      // 等待响应
      const timeoutId = setTimeout(() => {
        reject(new Error(`Worker消息超时: ${type}`))
      }, 30000) // 30秒超时

      const originalOnMessage = this.worker.onmessage
      this.worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
        if (event.data.id === messageId && event.data.type === 'complete') {
          clearTimeout(timeoutId)
          if (originalOnMessage) {
            originalOnMessage.call(this.worker!, event)
          }
          resolve(event.data.data)
        } else if (event.data.id === messageId && event.data.type === 'error') {
          clearTimeout(timeoutId)
          if (originalOnMessage) {
            originalOnMessage.call(this.worker!, event)
          }
          reject(new Error(event.data.data?.error || 'Worker处理失败'))
        } else if (originalOnMessage) {
          originalOnMessage.call(this.worker!, event)
        }
      }

      this.worker.postMessage(message)
    })
  }

  /**
   * 生成任务ID
   */
  private generateTaskId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 加载模型
   * @param task 加载任务
   * @param callbacks 回调函数
   */
  loadModel(
    task: Omit<LoadTask, 'id'>, 
    callbacks: {
      onProgress?: WorkerEventListener
      onComplete?: WorkerEventListener
      onError?: WorkerEventListener
    } = {}
  ): string {
    if (!this.isInitialized) {
      throw new Error('Worker未初始化')
    }

    const taskId = this.generateTaskId()
    const fullTask: LoadTask = {
      ...task,
      id: taskId
    }

    // 保存回调函数
    this.taskCallbacks.set(taskId, callbacks)

    // 如果Worker空闲，立即发送任务；否则加入队列
    if (this.activeTasks.size < 3) { // 假设最大并发数为3
      this.activeTasks.add(taskId)
      this.worker!.postMessage({
        type: 'load',
        id: taskId,
        data: {
          url: fullTask.url,
          config: fullTask.config
        }
      })
      console.log(`[GLTF Worker Manager] 开始加载模型: ${fullTask.url}`)
    } else {
      // 加入队列
      this.taskQueue.push(fullTask)
      console.log(`[GLTF Worker Manager] 任务已加入队列: ${fullTask.url}`)
    }

    return taskId
  }

  /**
   * 取消任务
   * @param taskId 任务ID
   */
  cancelTask(taskId: string): void {
    // 从队列中移除
    this.taskQueue = this.taskQueue.filter(task => task.id !== taskId)
    
    // 清理回调
    this.taskCallbacks.delete(taskId)
    
    // 如果是活动任务，可以发送取消消息到Worker
    if (this.activeTasks.has(taskId)) {
      // 注意：Worker当前版本不支持取消，这里只是清理状态
      this.activeTasks.delete(taskId)
      console.log(`[GLTF Worker Manager] 已取消任务: ${taskId}`)
    }
  }

  /**
   * 清理资源
   */
  async dispose(): Promise<void> {
    if (this.worker) {
      try {
        await this.sendMessage('dispose')
        this.worker.terminate()
        this.worker = null
      } catch (error) {
        console.warn('[GLTF Worker Manager] 清理Worker时出错:', error)
      }
    }

    this.taskCallbacks.clear()
    this.activeTasks.clear()
    this.taskQueue = []
    this.isInitialized = false
    this.isInitializing = false

    console.log('[GLTF Worker Manager] ✅ Worker管理器已清理')
  }

  /**
   * 获取任务状态
   */
  getTaskStatus(taskId: string): 'pending' | 'loading' | 'completed' | 'error' | 'cancelled' {
    if (this.activeTasks.has(taskId)) {
      return 'loading'
    }
    if (this.taskQueue.find(task => task.id === taskId)) {
      return 'pending'
    }
    if (this.taskCallbacks.has(taskId)) {
      return 'loading'
    }
    return 'cancelled'
  }

  /**
   * 获取活跃任务数量
   */
  getActiveTaskCount(): number {
    return this.activeTasks.size
  }

  /**
   * 获取队列任务数量
   */
  getQueueTaskCount(): number {
    return this.taskQueue.length
  }

  /**
   * 检查Worker是否已初始化
   */
  isReady(): boolean {
    return this.isInitialized
  }
}

// 导出单例实例
export const gltfWorkerManager = new GLTFWorkerManager()

// 便捷方法：直接加载模型
export async function loadModelWithWorker(
  url: string, 
  options: {
    config?: any
    onProgress?: WorkerEventListener
    onComplete?: (result: LoadResult) => void
    onError?: WorkerEventListener
  } = {}
): Promise<LoadResult> {
  const { config, onProgress, onComplete, onError } = options

  return new Promise((resolve, reject) => {
    try {
      const taskId = gltfWorkerManager.loadModel(
        { url, config },
        {
          onProgress: (data) => {
            if (onProgress) onProgress(data)
          },
          onComplete: (data) => {
            if (onComplete) onComplete(data)
            resolve(data)
          },
          onError: (error) => {
            if (onError) onError(error)
            reject(new Error(error.error || '加载失败'))
          }
        }
      )

      // 添加超时处理
      setTimeout(() => {
        if (gltfWorkerManager.getTaskStatus(taskId) === 'loading') {
          gltfWorkerManager.cancelTask(taskId)
          reject(new Error('加载超时'))
        }
      }, 120000) // 2分钟超时

    } catch (error) {
      reject(error)
    }
  })
}