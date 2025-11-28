/**
 * GLTF模型缓存工具类
 * 提供IndexedDB存储、缓存管理、过期清理等功能
 */

interface GLTFModelCacheData {
  url: string;
  bufferData: ArrayBuffer;
  jsonData: any;
  timestamp: number;
  expiresAt: number;
}

class GLTFModelCache {
  private dbName: string = 'GLTFModelCache';
  private storeName: string = 'models';
  private version: number = 1;
  private db: IDBDatabase | null = null;
  private defaultExpiration: number = 7 * 24 * 60 * 60 * 1000; // 默认7天过期

  /**
   * 初始化数据库
   */
  private initDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (this.db) {
        resolve(this.db);
        return;
      }

      const request = indexedDB.open(this.dbName, this.version);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // 创建对象存储
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, {
            keyPath: 'url'
          });
          // 创建过期时间索引，用于清理过期缓存
          store.createIndex('expiresAt', 'expiresAt', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        reject((event.target as IDBOpenDBRequest).error);
      };
    });
  }

  /**
   * 存储模型数据到缓存
   * @param url 模型URL，作为唯一键
   * @param bufferData 原始buffer数据
   * @param jsonData 解析后的JSON数据
   * @param expiration 过期时间（毫秒），默认7天
   */
  async store(url: string, bufferData: ArrayBuffer, jsonData: any, expiration: number = this.defaultExpiration): Promise<void> {
    try {
      const db = await this.initDB();
      const transaction = db.transaction(this.storeName, 'readwrite');
      const store = transaction.objectStore(this.storeName);

      const cacheData: GLTFModelCacheData = {
        url,
        bufferData,
        jsonData,
        timestamp: Date.now(),
        expiresAt: Date.now() + expiration
      };

      store.put(cacheData);

      return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    } catch (error) {
      console.error('GLTFModelCache: 存储缓存失败', error);
      throw error;
    }
  }

  /**
   * 从缓存中读取模型数据
   * @param url 模型URL
   * @returns 缓存数据，如果不存在则返回null
   */
  async get(url: string): Promise<GLTFModelCacheData | null> {
    try {
      const db = await this.initDB();
      const transaction = db.transaction(this.storeName, 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(url);

      return new Promise((resolve, reject) => {
        request.onsuccess = () => {
          const result = request.result;
          if (result) {
            // 检查是否过期
            if (result.expiresAt > Date.now()) {
              resolve(result);
            } else {
              // 过期数据，删除并返回null
              this.delete(url);
              resolve(null);
            }
          } else {
            resolve(null);
          }
        };

        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('GLTFModelCache: 读取缓存失败', error);
      return null;
    }
  }

  /**
   * 删除指定URL的缓存
   * @param url 模型URL
   */
  async delete(url: string): Promise<void> {
    try {
      const db = await this.initDB();
      const transaction = db.transaction(this.storeName, 'readwrite');
      const store = transaction.objectStore(this.storeName);
      store.delete(url);

      return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    } catch (error) {
      console.error('GLTFModelCache: 删除缓存失败', error);
      throw error;
    }
  }

  /**
   * 清理所有过期缓存
   */
  async cleanupExpired(): Promise<void> {
    try {
      const db = await this.initDB();
      const transaction = db.transaction(this.storeName, 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const index = store.index('expiresAt');
      const now = Date.now();
      const request = index.openCursor(IDBKeyRange.upperBound(now));

      return new Promise((resolve, reject) => {
        request.onsuccess = () => {
          const cursor = request.result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          }
        };

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    } catch (error) {
      console.error('GLTFModelCache: 清理过期缓存失败', error);
      throw error;
    }
  }

  /**
   * 清空所有缓存
   */
  async clear(): Promise<void> {
    try {
      const db = await this.initDB();
      const transaction = db.transaction(this.storeName, 'readwrite');
      const store = transaction.objectStore(this.storeName);
      store.clear();

      return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    } catch (error) {
      console.error('GLTFModelCache: 清空缓存失败', error);
      throw error;
    }
  }

  /**
   * 获取缓存统计信息
   * @returns 缓存数量
   */
  async getStats(): Promise<number> {
    try {
      const db = await this.initDB();
      const transaction = db.transaction(this.storeName, 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.count();

      return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('GLTFModelCache: 获取缓存统计失败', error);
      return 0;
    }
  }
}

// 导出单例实例
export const gltfModelCache = new GLTFModelCache();
