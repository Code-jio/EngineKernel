/**
 * GLTF模型加载Web Worker
 * 专门处理GLTF/GLB模型的异步加载，支持Draco、KTX2、Meshopt解码
 */

import { GLTFLoader, DRACOLoader, KTX2Loader, MeshoptDecoder } from '../utils/three-imports'

// Worker消息类型定义
interface WorkerMessage {
  type: 'init' | 'load' | 'progress' | 'complete' | 'error' | 'dispose'
  id?: string
  data?: any
}

// 加载任务接口
interface LoadTask {
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

// 全局变量
let gltfLoader: GLTFLoader | null = null
let dracoLoader: DRACOLoader | null = null
let ktx2Loader: KTX2Loader | null = null
let meshoptDecoder: any = null
let activeTasks: Map<string, AbortController> = new Map()

/**
 * 初始化GLTF加载器和各种解码器
 */
async function initializeLoaders(config: any = {}): Promise<void> {
  try {
    console.log('[GLTF Worker] 正在初始化加载器...')
    
    // 创建GLTFLoader实例
    gltfLoader = new GLTFLoader()
    
    // 初始化Draco解码器
    if (config.enableDraco !== false) {
      try {
        dracoLoader = new DRACOLoader()
        const dracoPath = config.dracoPath || '/draco/'
        dracoLoader.setDecoderPath(dracoPath)
        dracoLoader.setDecoderConfig({ type: 'js' })
        dracoLoader.setWorkerLimit(4)
        gltfLoader.setDRACOLoader(dracoLoader)
        console.log('[GLTF Worker] ✅ Draco解码器初始化成功')
      } catch (error) {
        console.warn('[GLTF Worker] ⚠️ Draco解码器初始化失败:', error)
        dracoLoader = null
      }
    }
    
    // 初始化KTX2解码器
    if (config.enableKTX2 !== false) {
      try {
        ktx2Loader = new KTX2Loader()
        const ktx2Path = config.ktx2Path || '/ktx2/'
        ktx2Loader.setTranscoderPath(ktx2Path)
        gltfLoader.setKTX2Loader(ktx2Loader)
        console.log('[GLTF Worker] ✅ KTX2解码器初始化成功')
      } catch (error) {
        console.warn('[GLTF Worker] ⚠️ KTX2解码器初始化失败:', error)
        ktx2Loader = null
      }
    }
    
    // 初始化Meshopt解码器
    if (config.enableMeshopt !== false) {
      try {
        await MeshoptDecoder.ready
        meshoptDecoder = MeshoptDecoder
        gltfLoader.setMeshoptDecoder(MeshoptDecoder)
        console.log('[GLTF Worker] ✅ Meshopt解码器初始化成功')
      } catch (error) {
        console.warn('[GLTF Worker] ⚠️ Meshopt解码器初始化失败:', error)
        meshoptDecoder = null
      }
    }
    
    console.log('[GLTF Worker] ✅ 所有加载器初始化完成')
  } catch (error) {
    console.error('[GLTF Worker] ❌ 加载器初始化失败:', error)
    throw error
  }
}

/**
 * 异步初始化KTX2Loader（需要WebGL上下文）
 */
async function initializeKTX2Async(renderer: any): Promise<void> {
  if (!ktx2Loader || !renderer) {
    console.warn('[GLTF Worker] ⚠️ KTX2Loader或渲染器未就绪，跳过异步初始化')
    return
  }
  
  try {
    ktx2Loader.detectSupport(renderer)
    console.log('[GLTF Worker] ✅ KTX2异步初始化完成')
  } catch (error) {
    console.warn('[GLTF Worker] ⚠️ KTX2异步初始化失败:', error)
  }
}

/**
 * 自定义fetch文件数据（带进度）
 */
async function fetchFileWithProgress(url: string, onProgress?: (progress: number, loaded: number, total: number) => void): Promise<ArrayBuffer> {
  const response = await fetch(url)
  
  if (!response.ok) {
    throw new Error(`HTTP错误: ${response.status} ${response.statusText}`)
  }
  
  const contentLength = response.headers.get('content-length')
  const total = contentLength ? parseInt(contentLength, 10) : 0
  const reader = response.body?.getReader()
  
  if (!reader) {
    throw new Error('无法读取响应流')
  }
  
  let receivedLength = 0
  const chunks: Uint8Array[] = []
  
  while (true) {
    const { done, value } = await reader.read()
    
    if (done) break
    
    if (value) {
      chunks.push(value)
      receivedLength += value.length
      
      if (onProgress && total > 0) {
        onProgress(receivedLength, total, (receivedLength / total) * 100)
      }
    }
  }
  
  // 合并所有chunks
  const allBytes = new Uint8Array(receivedLength)
  let position = 0
  
  for (const chunk of chunks) {
    allBytes.set(chunk, position)
    position += chunk.length
  }
  
  return allBytes.buffer
}

/**
 * 解析GLB二进制文件（完整解析，包括二进制数据）
 */
function parseGLB(glbBuffer: ArrayBuffer): { gltf: any, binaryChunk?: ArrayBuffer } {
  const dataView = new DataView(glbBuffer)
  const magic = dataView.getUint32(0, true)
  
  if (magic !== 0x46546C67) { // 'glTF' in ASCII
    throw new Error('无效的GLB文件：魔术字节不匹配')
  }
  
  const version = dataView.getUint32(4, true)
  if (version !== 2) {
    throw new Error(`不支持的GLB版本: ${version} (仅支持版本2)`)
  }
  
  const length = dataView.getUint32(8, true)
  
  // 读取JSON chunk
  let offset = 12 // 文件头后开始
  const jsonChunkLength = dataView.getUint32(offset, true)
  offset += 4
  const jsonChunkType = dataView.getUint32(offset, true)
  offset += 4
  
  if (jsonChunkType !== 0x4E4F534A) { // 'JSON' in ASCII
    throw new Error('GLB文件格式错误：缺少JSON chunk')
  }
  
  const jsonBytes = new Uint8Array(glbBuffer, offset, jsonChunkLength)
  const jsonText = new TextDecoder().decode(jsonBytes)
  const gltf = JSON.parse(jsonText)
  offset += jsonChunkLength
  
  // 读取二进制chunk（如果存在）
  let binaryChunk: ArrayBuffer | undefined
  if (offset < length) {
    const binaryChunkLength = dataView.getUint32(offset, true)
    offset += 4
    const binaryChunkType = dataView.getUint32(offset, true)
    offset += 4
    
    if (binaryChunkType !== 0x004E4942) { // 'BIN' in ASCII
      throw new Error('GLB文件格式错误：二进制chunk类型不匹配')
    }
    
    binaryChunk = glbBuffer.slice(offset, offset + binaryChunkLength)
    gltf.buffers = gltf.buffers || []
    
    // 如果GLTF中没有buffer定义，添加一个默认的buffer引用
    if (gltf.buffers.length === 0) {
      gltf.buffers.push({
        byteLength: binaryChunkLength,
        uri: undefined // 二进制数据已内联
      })
    }
  }
  
  console.log('[GLTF Worker] ✅ GLB二进制完整解析完成，版本:', version, '包含二进制chunk:', !!binaryChunk)
  
  return { gltf, binaryChunk }
}

/**
 * 解析GLTF JSON文件（从ArrayBuffer）
 */
function parseGLTFJSON(fileBuffer: ArrayBuffer): any {
  const jsonText = new TextDecoder().decode(fileBuffer)
  const gltf = JSON.parse(jsonText)
  console.log('[GLTF Worker] ✅ GLTF JSON解析完成')
  return gltf
}

/**
 * 处理模型加载（完全在worker中处理）
 */
async function loadModel(task: LoadTask): Promise<void> {
  const abortController = new AbortController()
  activeTasks.set(task.id, abortController)
  
  try {
    console.log(`[GLTF Worker] 开始加载模型: ${task.url}`)
    
    // 发送进度更新 - 开始阶段
    postMessage({
      type: 'progress',
      id: task.id,
      data: { progress: 0, stage: 'starting', step: '准备加载模型' }
    } as WorkerMessage)
    
    // 检测文件类型
    const isGLB = task.url.toLowerCase().endsWith('.glb')
    const isGLTF = task.url.toLowerCase().endsWith('.gltf')
    
    if (!isGLB && !isGLTF) {
      throw new Error(`不支持的文件格式: ${task.url}`)
    }
    
    // 阶段1: 网络请求和下载 (0-30%)
    postMessage({
      type: 'progress',
      id: task.id,
      data: { progress: 5, stage: 'downloading', step: '开始下载模型文件' }
    } as WorkerMessage)
    
    // 自定义下载文件，支持进度跟踪
    const fileBuffer = await fetchFileWithProgress(
      task.url,
      (loaded, total, percentage) => {
        if (abortController.signal.aborted) return
        
        const scaledProgress = 5 + (percentage * 0.25) // 下载阶段占25%
        postMessage({
          type: 'progress',
          id: task.id,
          data: {
            progress: Math.min(scaledProgress, 30),
            loaded,
            total,
            stage: 'downloading',
            step: '下载模型文件'
          }
        } as WorkerMessage)
      }
    )
    
    if (abortController.signal.aborted) {
      return
    }
    
    // 阶段2: 数据解析 (30-50%)
    postMessage({
      type: 'progress',
      id: task.id,
      data: { progress: 30, stage: 'parsing', step: isGLB ? '二进制GLB解包' : 'JSON.parse解析' }
    } as WorkerMessage)
    
    let gltfData: any
    let binaryData: ArrayBuffer | undefined
    
    if (isGLB) {
      // GLB格式：在worker中完整解析二进制文件
      console.log('[GLTF Worker] 🔄 执行GLB二进制完整解析...')
      const result = parseGLB(fileBuffer)
      gltfData = result.gltf
      binaryData = result.binaryChunk
      console.log('[GLTF Worker] ✅ GLB二进制完整解析完成')
    } else {
      // GLTF格式：在worker中解析JSON
      console.log('[GLTF Worker] 🔄 执行GLTF JSON解析...')
      gltfData = parseGLTFJSON(fileBuffer)
      console.log('[GLTF Worker] ✅ GLTF JSON解析完成')
    }
    
    if (abortController.signal.aborted) {
      return
    }
    
    // 阶段3: GLTF加载器解析 (50-70%)
    postMessage({
      type: 'progress',
      id: task.id,
      data: { progress: 50, stage: 'loading', step: 'GLTF加载器解析' }
    } as WorkerMessage)
    
    if (!gltfLoader) {
      // 如果加载器未初始化，先初始化
      await initializeLoaders(task.config || {})
    }
    
    // 使用GLTFLoader解析模型数据
    console.log('[GLTF Worker] 🔄 使用GLTFLoader解析模型数据...')
    const gltf = await gltfLoader.parseAsync(
      isGLB ? JSON.stringify(gltfData) : fileBuffer,
      '', // 基础路径
      binaryData // 二进制数据（如果是GLB）
    )
    console.log('[GLTF Worker] ✅ GLTFLoader解析完成')
    
    // 阶段4: 模型数据处理 (70-90%)
    postMessage({
      type: 'progress',
      id: task.id,
      data: { progress: 70, stage: 'processing', step: '模型数据处理' }
    } as WorkerMessage)
    
    // 处理加载的模型
    const processedModel = processModelData(gltf, task.url, isGLB)
    
    // 阶段5: 完成 (90-100%)
    postMessage({
      type: 'progress',
      id: task.id,
      data: { progress: 90, stage: 'finalizing', step: '完成加载' }
    } as WorkerMessage)
    
    // 发送完成消息
    postMessage({
      type: 'complete',
      id: task.id,
      data: {
        scene: processedModel.scene,
        animations: processedModel.animations,
        metadata: {
          url: task.url,
          loadTime: Date.now(),
          format: isGLB ? 'glb' : 'gltf',
          loadSteps: [
            '下载模型文件',
            isGLB ? '二进制GLB解包' : 'JSON.parse解析',
            'GLTF加载器解析',
            '模型数据处理'
          ]
        }
      }
    } as WorkerMessage)
    
    // 最终进度更新
    postMessage({
      type: 'progress',
      id: task.id,
      data: { progress: 100, stage: 'completed', step: '加载完成' }
    } as WorkerMessage)
    
    console.log(`[GLTF Worker] ✅ 模型加载完成: ${task.url}`)
    
  } catch (error) {
    console.error(`[GLTF Worker] ❌ 模型加载失败: ${task.url}`, error)
    
    // 发送错误消息
    postMessage({
      type: 'error',
      id: task.id,
      data: {
        url: task.url,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      }
    } as WorkerMessage)
  } finally {
    activeTasks.delete(task.id)
  }
}

/**
 * 处理模型数据
 */
function processModelData(gltf: any, url: string, isGLB: boolean = false): any {
  const scene = gltf.scene || gltf.scenes?.[0]
  const animations = gltf.animations || []
  
  // 添加加载元数据到场景
  if (scene && !scene.userData) {
    scene.userData = {}
  }
  if (scene && scene.userData) {
    scene.userData.loadInfo = {
      url,
      loadTime: Date.now(),
      format: isGLB ? 'glb' : 'gltf',
      source: 'worker'
    }
  }
  
  return {
    scene,
    animations
  }
}

/**
 * 取消加载任务
 */
function cancelTask(taskId: string): void {
  const controller = activeTasks.get(taskId)
  if (controller) {
    controller.abort()
    activeTasks.delete(taskId)
    console.log(`[GLTF Worker] 任务已取消: ${taskId}`)
  }
}

/**
 * 清理资源
 */
function dispose(): void {
  // 取消所有活动任务
  for (const [taskId, controller] of Array.from(activeTasks.entries())) {
    controller.abort()
    console.log(`[GLTF Worker] 取消任务: ${taskId}`)
  }
  activeTasks.clear()
  
  // 清理解码器
  if (dracoLoader) {
    dracoLoader.dispose()
    dracoLoader = null
  }
  
  if (ktx2Loader) {
    ktx2Loader.dispose()
    ktx2Loader = null
  }
  
  gltfLoader = null
  meshoptDecoder = null
  
  console.log('[GLTF Worker] ✅ 资源清理完成')
}

// 监听主线程消息
self.addEventListener('message', async (event: MessageEvent<WorkerMessage>) => {
  const { type, id, data } = event.data
  console.log(`[GLTF Worker] 收到消息: ${type}`)
  try {
    switch (type) {
      case 'init':
        // 初始化加载器
        await initializeLoaders(data)
        
        // 如果提供了渲染器，初始化KTX2异步功能
        if (data?.renderer) {
          await initializeKTX2Async(data.renderer)
        }
        
        postMessage({
          type: 'complete',
          data: { success: true, message: '初始化完成' }
        } as WorkerMessage)
        break
        
      case 'load':
        // 加载模型
        await loadModel({
          id: id!,
          url: data.url,
          config: data.config
        })
        break
        
      case 'dispose':
        // 清理资源
        dispose()
        postMessage({
          type: 'complete',
          data: { success: true, message: '资源清理完成' }
        } as WorkerMessage)
        break
        
      default:
        console.warn(`[GLTF Worker] 未知的消息类型: ${type}`)
    }
  } catch (error) {
    console.error(`[GLTF Worker] 处理消息失败: ${type}`, error)
    
    postMessage({
      type: 'error',
      id,
      data: {
        message: `处理消息失败: ${type}`,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      }
    } as WorkerMessage)
  }
})

// 错误处理
self.addEventListener('error', (event) => {
  console.error('[GLTF Worker] 全局错误:', event.error)
  
  postMessage({
    type: 'error',
    data: {
      message: 'Worker全局错误',
      error: event.error?.message || String(event.error),
      stack: event.error?.stack
    }
  } as WorkerMessage)
})

// 警告处理
self.addEventListener('unhandledrejection', (event) => {
  console.warn('[GLTF Worker] 未处理的Promise拒绝:', event.reason)
  
  postMessage({
    type: 'error',
    data: {
      message: '未处理的Promise拒绝',
      error: event.reason?.message || String(event.reason),
      stack: event.reason?.stack
    }
  } as WorkerMessage)
})