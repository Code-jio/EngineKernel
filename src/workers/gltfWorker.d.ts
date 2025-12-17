/**
 * GLTF Worker类型定义
 * 为Web Worker提供TypeScript支持
 */

import { THREE } from '../utils/three-imports'

// Worker消息类型
export type WorkerMessageType = 'init' | 'load' | 'progress' | 'complete' | 'error' | 'dispose'

// Worker消息接口
export interface WorkerMessage {
  type: WorkerMessageType
  id?: string
  data?: any
}

// 加载任务配置
export interface WorkerLoadConfig {
  dracoPath?: string
  ktx2Path?: string
  meshoptPath?: string
  enableDraco?: boolean
  enableKTX2?: boolean
  enableMeshopt?: boolean
}

// 加载任务接口
export interface LoadTask {
  id: string
  url: string
  config?: WorkerLoadConfig
}

// 加载结果元数据
export interface LoadMetadata {
  url: string
  loadTime: number
  format: 'gltf' | 'glb'
}

// 加载结果接口
export interface LoadResult {
  scene: THREE.Group | THREE.Scene | THREE.Object3D
  animations: any[]
  metadata: LoadMetadata
}

// 进度信息
export interface ProgressInfo {
  progress: number
  stage: 'starting' | 'loading' | 'processing'
  loaded?: number
  total?: number
  indeterminate?: boolean
}

// 错误信息
export interface WorkerError {
  url?: string
  error: string
  message?: string
  stack?: string
  type?: string
}

// Worker事件监听器类型
export type WorkerEventListener<T = any> = (data: T) => void

// Worker管理器配置
export interface WorkerManagerConfig {
  workerScript?: string
  maxConcurrentTasks?: number
  defaultTimeout?: number
}

// Worker管理器状态
export type TaskStatus = 'pending' | 'loading' | 'completed' | 'error' | 'cancelled'

// 扩展的Web Worker类型
declare global {
  interface Window {
    GLTFWorkerManager: typeof GLTFWorkerManager
  }
}

// 声明Worker类
declare class Worker {
  constructor(public readonly scriptURL: string | URL)
  postMessage(message: any, transfer?: Transferable[]): void
  terminate(): void
  onmessage: ((event: MessageEvent) => void) | null
  onerror: ((error: any) => void) | null
}

// 导出所有类型
export * from './gltfWorkerManager'

// 便捷类型
export type WorkerProgressCallback = WorkerEventListener<ProgressInfo>
export type WorkerCompleteCallback = WorkerEventListener<LoadResult>
export type WorkerErrorCallback = WorkerEventListener<WorkerError>