/**
 * GLTF模型缓存工具类
 * 提供IndexedDB存储、缓存管理、过期清理等功能
 */

export interface GLTFModelCacheData {
  /** 缓存数据ID */
  id: string
  /** 模型URL */
  url: string
  /** 模型数据 */
  modelData: any
  /** 二进制数据（可选） */
  binaryData?: ArrayBuffer
  /** 缓存元数据 */
  metadata: {
    /** 缓存时间戳 */
    cachedAt: number
    /** 最后访问时间 */
    lastAccessed: number
    /** 访问次数 */
    accessCount: number
    /** 模型大小估算 */
    estimatedSize: number
    /** 用户代理 */
    userAgent?: string
  }
}

export interface CacheStatistics {
  /** 总模型数量 */
  totalModels: number
  /** 总缓存大小（字节） */
  totalSize: number
  /** 平均模型大小 */
  averageModelSize: number
  /** 访问最多的模型 */
  mostAccessedModels: Array<{
    id: string
    url: string
    accessCount: number
  }>
  /** 最旧的缓存时间戳 */
  oldestCache: number
  /** 最新的缓存时间戳 */
  newestCache: number
}

export interface CacheConfig {
  /** 缓存数据库名称 */
  databaseName?: string
  /** 对象存储名称 */
  storeName?: string
  /** 最大缓存大小（字节） */
  maxCacheSize?: number
  /** 最大模型数量 */
  maxModels?: number
  /** 缓存TTL（毫秒） */
  ttl?: number
  /** 自动清理间隔（毫秒） */
  cleanupInterval?: number
}

export class GLTFModelCache {
  private db: IDBDatabase | null = null
  private storeName: string
  private config: Required<CacheConfig>
  private initialized: boolean = false
  private cleanupTimer: NodeJS.Timeout | null = null

  // 静态缓存管理器实例
  private static instance: GLTFModelCache | null = null

  constructor(config: CacheConfig = {}) {
    this.config = {
      databaseName: config.databaseName || 'GLTFModelCache',
      storeName: config.storeName || 'models',
      maxCacheSize: config.maxCacheSize || 50 * 1024 * 1024, // 50MB
      maxModels: config.maxModels || 100,
      ttl: config.ttl || 24 * 60 * 60 * 1000, // 24小时
      cleanupInterval: config.cleanupInterval || 10 * 60 * 1000, // 10分钟
    }
    this.storeName = this.config.storeName

    // 设置自动清理
    this.setupAutoCleanup()
  }

  /**
   * 获取单例实例
   */
  static async getInstance(config?: CacheConfig): Promise<GLTFModelCache> {
    if (!GLTFModelCache.instance) {
      GLTFModelCache.instance = new GLTFModelCache(config)
      await GLTFModelCache.instance.initialize()
    }
    return GLTFModelCache.instance
  }

  /**
   * 初始化缓存系统
   */
  async initialize(): Promise<void> {
    if (this.initialized) return

    try {
      await this.createDatabase()
      this.initialized = true
      console.log('[GLTFModelCache] 缓存系统初始化完成')
    } catch (error) {
      console.error('[GLTFModelCache] 缓存系统初始化失败:', error)
      throw error
    }
  }

  /**
   * 确保已初始化
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize()
    }
  }

  /**
   * 创建数据库
   */
  private async createDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.config.databaseName, 1)

      request.onerror = () => {
        console.error('[GLTFModelCache] 数据库打开失败:', request.error)
        reject(request.error)
      }

      request.onsuccess = () => {
        this.db = request.result
        resolve()
      }

      request.onupgradeneeded = () => {
        const db = request.result
        console.log('[GLTFModelCache] 正在升级数据库版本...')

        // 创建对象存储
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id' })
          
          // 创建索引
          store.createIndex('url', 'url', { unique: false })
          store.createIndex('cachedAt', 'metadata.cachedAt', { unique: false })
          store.createIndex('lastAccessed', 'metadata.lastAccessed', { unique: false })
          store.createIndex('accessCount', 'metadata.accessCount', { unique: false })
          
          console.log('[GLTFModelCache] 对象存储和索引创建完成')
        }
      }
    })
  }

  /**
   * 生成模型ID
   */
  private generateModelId(url: string): string {
    // 使用URL和时间戳生成唯一ID
    const hash = this.simpleHash(url + Date.now())
    return `model_${hash}`
  }

  /**
   * 简单的哈希函数
   */
  private simpleHash(str: string): string {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36)
  }

  /**
   * 计算数据大小
   */
  private calculateSize(data: any): number {
    try {
      if (data === null || data === undefined) return 0
      
      if (typeof data === 'string') {
        return new Blob([data]).size
      }
      
      if (data instanceof ArrayBuffer) {
        return data.byteLength
      }
      
      if (Array.isArray(data)) {
        return data.reduce((sum, item) => sum + this.calculateSize(item), 0)
      }
      
      if (typeof data === 'object') {
        return JSON.stringify(data).length
      }
      
      return 0
    } catch (error) {
      console.warn('[GLTFModelCache] 计算数据大小失败:', error)
      return 0
    }
  }

  /**
   * 执行数据库事务
   */
  private async performTransaction<T>(
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => Promise<T>
  ): Promise<T> {
    if (!this.db) {
      throw new Error('[GLTFModelCache] 数据库未初始化')
    }

    return new Promise<T>((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], mode)
      const store = transaction.objectStore(this.storeName)

      transaction.oncomplete = () => {
        // 事务完成
      }

      transaction.onerror = () => {
        console.error('[GLTFModelCache] 事务执行失败:', transaction.error)
        reject(transaction.error)
      }

      operation(store).then(resolve, reject)
    })
  }

  /**
   * 存储模型到缓存
   */
  async storeModel(url: string, modelData: any, binaryData?: ArrayBuffer): Promise<void> {
    await this.ensureInitialized()

    try {
      const id = this.generateModelId(url)
      const estimatedSize = this.calculateSize(modelData) + (binaryData?.byteLength || 0)

      const cacheData: GLTFModelCacheData = {
        id,
        url,
        modelData,
        binaryData,
        metadata: {
          cachedAt: Date.now(),
          lastAccessed: Date.now(),
          accessCount: 1,
          estimatedSize,
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'
        }
      }

      await this.performTransaction('readwrite', (store) => {
        return new Promise<void>((resolve, reject) => {
          const request = store.put(cacheData)
          request.onsuccess = () => resolve()
          request.onerror = () => reject(request.error)
        })
      })

      console.log(`[GLTFModelCache] 模型已缓存: ${url} (${estimatedSize} bytes)`)
      
      // 检查是否需要清理缓存
      await this.cleanupIfNeeded()
    } catch (error) {
      console.error('[GLTFModelCache] 缓存模型失败:', error)
      throw error
    }
  }

  /**
   * 从缓存获取模型
   */
  async getModel(url: string): Promise<GLTFModelCacheData | null> {
    await this.ensureInitialized()

    try {
      const model = await this.getModelByUrl(url)
      if (!model) return null

      // 更新访问统计
      model.metadata.lastAccessed = Date.now()
      model.metadata.accessCount++

      await this.performTransaction('readwrite', (store) => {
        return new Promise<void>((resolve, reject) => {
          const request = store.put(model)
          request.onsuccess = () => resolve()
          request.onerror = () => reject(request.error)
        })
      })

      console.log(`[GLTFModelCache] 缓存命中: ${url}`)
      return model
    } catch (error) {
      console.error('[GLTFModelCache] 获取缓存模型失败:', error)
      throw error
    }
  }

  /**
   * 根据URL获取模型
   */
  async getModelByUrl(url: string): Promise<GLTFModelCacheData | null> {
    await this.ensureInitialized()

    try {
      const models = await this.performTransaction('readonly', (store) => {
        return new Promise<GLTFModelCacheData[]>((resolve, reject) => {
          const request = store.getAll()
          request.onsuccess = () => {
            resolve(request.result as GLTFModelCacheData[])
          }
          request.onerror = () => reject(request.error)
        })
      })

      // 查找匹配的模型
      const model = models.find(m => m.url === url)
      
      // 检查是否过期
      if (model && this.isExpired(model)) {
        await this.deleteModel(model.id)
        console.log(`[GLTFModelCache] 缓存已过期: ${url}`)
        return null
      }

      return model || null
    } catch (error) {
      console.error('[GLTFModelCache] 根据URL获取模型失败:', error)
      throw error
    }
  }

  /**
   * 检查缓存是否过期
   */
  private isExpired(model: GLTFModelCacheData): boolean {
    const now = Date.now()
    const age = now - model.metadata.cachedAt
    return age > this.config.ttl
  }

  /**
   * 获取所有模型列表
   */
  async getModelList(): Promise<GLTFModelCacheData[]> {
    await this.ensureInitialized()
    
    try {
      return await this.performTransaction('readonly', (store) => {
        return new Promise<GLTFModelCacheData[]>((resolve, reject) => {
          const request = store.getAll()
          request.onsuccess = () => {
            const results = request.result as GLTFModelCacheData[]
            // 按访问时间排序，最新的在前
            results.sort((a, b) => b.metadata.lastAccessed - a.metadata.lastAccessed)
            resolve(results)
          }
          request.onerror = () => reject(request.error)
        })
      })
    } catch (error) {
      console.error('[GLTFModelCache] 获取模型列表失败:', error)
      throw error
    }
  }

  /**
   * 删除模型
   */
  async deleteModel(id: string): Promise<boolean> {
    await this.ensureInitialized()
    
    try {
      await this.performTransaction('readwrite', (store) => {
        return new Promise<void>((resolve, reject) => {
          const request = store.delete(id)
          request.onsuccess = () => resolve()
          request.onerror = () => reject(request.error)
        })
      })
      
      console.log(`[GLTFModelCache] 模型已删除: ${id}`)
      return true
    } catch (error) {
      console.error('[GLTFModelCache] 删除模型失败:', error)
      throw error
    }
  }

  /**
   * 清空所有缓存
   */
  async clearAll(): Promise<void> {
    await this.ensureInitialized()
    
    try {
      await this.performTransaction('readwrite', (store) => {
        return new Promise<void>((resolve, reject) => {
          const request = store.clear()
          request.onsuccess = () => resolve()
          request.onerror = () => reject(request.error)
        })
      })
      
      console.log('[GLTFModelCache] 所有缓存已清空')
    } catch (error) {
      console.error('[GLTFModelCache] 清空缓存失败:', error)
      throw error
    }
  }

  /**
   * 获取缓存统计信息
   */
  async getStatistics(): Promise<CacheStatistics> {
    const models = await this.getModelList()
    
    if (models.length === 0) {
      return {
        totalModels: 0,
        totalSize: 0,
        averageModelSize: 0,
        mostAccessedModels: [],
        oldestCache: 0,
        newestCache: 0,
      }
    }

    const totalSize = models.reduce((sum, model) => {
      return sum + this.calculateSize(model.modelData) + 
             (model.binaryData?.byteLength || 0)
    }, 0)

    // 获取访问最多的模型
    const mostAccessed = models
      .sort((a, b) => b.metadata.accessCount - a.metadata.accessCount)
      .slice(0, 10)
      .map(model => ({
        id: model.id,
        url: model.url,
        accessCount: model.metadata.accessCount,
      }))

    const timestamps = models.map(m => m.metadata.cachedAt)
    
    return {
      totalModels: models.length,
      totalSize,
      averageModelSize: totalSize / models.length,
      mostAccessedModels: mostAccessed,
      oldestCache: Math.min(...timestamps),
      newestCache: Math.max(...timestamps),
    }
  }

  /**
   * 根据需要清理缓存
   */
  private async cleanupIfNeeded(): Promise<void> {
    const stats = await this.getStatistics()
    // 清理过期缓存
    await this.cleanupExpired()
  }



  /**
   * 清理过期缓存
   */
  async cleanupExpired(): Promise<number> {
    const models = await this.getModelList()
    const expired = models.filter(model => this.isExpired(model))
    
    for (const model of expired) {
      await this.deleteModel(model.id)
    }
    
    if (expired.length > 0) {
      console.log(`[GLTFModelCache] 清理过期缓存完成，删除 ${expired.length} 个过期模型`)
    }
    
    return expired.length
  }

  /**
   * 设置自动清理
   */
  private setupAutoCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
    }
    
    this.cleanupTimer = setInterval(() => {
      this.cleanupIfNeeded().catch(error => {
        console.error('[GLTFModelCache] 自动清理失败:', error)
      })
    }, this.config.cleanupInterval)
  }

  /**
   * 从URL提取文件名
   */
  private extractFileNameFromUrl(url: string): string {
    try {
      const cleanUrl = url.split('?')[0] // 移除查询参数
      const lastSlash = cleanUrl.lastIndexOf('/')
      const fileName = lastSlash > -1 ? cleanUrl.substring(lastSlash + 1) : cleanUrl
      return fileName || 'unknown_model'
    } catch (error) {
      return 'unknown_model'
    }
  }

  /**
   * 关闭数据库连接
   */
  close(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }

    if (this.db) {
      this.db.close()
      this.db = null
      this.initialized = false
      console.log('[GLTFModelCache] 数据库连接已关闭')
    }
  }
}