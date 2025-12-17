/**
 * GLTF Worker使用示例
 * 演示如何在项目中使用Web Worker来异步加载GLTF模型
 */

import { gltfWorkerManager, loadModelWithWorker } from './gltfWorkerManager'
import eventBus from '../eventBus/eventBus'
import { THREE } from '../utils/three-imports'

/**
 * 示例1: 基础使用Worker加载模型
 */
export async function exampleBasicWorkerLoading() {
  try {
    console.log('🎯 示例1: 基础Worker加载')
    
    // 初始化Worker（只需要调用一次）
    await gltfWorkerManager.initialize({
      enableDraco: true,
      enableKTX2: true,
      enableMeshopt: true,
      dracoPath: '/draco/',
      ktx2Path: '/ktx2/',
      meshoptPath: '/meshopt/'
    })

    // 加载模型
    const result = await loadModelWithWorker('/models/car.gltf', {
      onProgress: (progress) => {
        console.log(`加载进度: ${progress.progress.toFixed(1)}%`)
      },
      onComplete: (result) => {
        console.log('✅ 模型加载完成:', result.metadata)
        // 将模型添加到场景中
        // scene.add(result.scene)
      },
      onError: (error) => {
        console.error('❌ 加载失败:', error)
      }
    })

    return result
  } catch (error) {
    console.error('Worker加载失败:', error)
    throw error
  }
}

/**
 * 示例2: 使用Worker管理器进行多个模型加载
 */
export async function exampleMultipleModelLoading() {
  try {
    console.log('🎯 示例2: 多模型并行加载')
    
    // 确保Worker已初始化
    if (!gltfWorkerManager.isReady()) {
      await gltfWorkerManager.initialize({
        enableDraco: true,
        enableKTX2: true,
        enableMeshopt: true
      })
    }

    // 定义多个模型
    const models = [
      { url: '/models/building1.gltf', name: 'building1' },
      { url: '/models/vehicle.glb', name: 'vehicle' },
      { url: '/models/character.gltf', name: 'character' }
    ]

    const loadPromises = models.map(model => 
      loadModelWithWorker(model.url, {
        onProgress: (progress) => {
          console.log(`${model.name} 进度: ${progress.progress.toFixed(1)}%`)
        },
        onComplete: (result) => {
          console.log(`✅ ${model.name} 加载完成`)
          return result
        },
        onError: (error) => {
          console.error(`❌ ${model.name} 加载失败:`, error)
        }
      })
    )

    // 等待所有模型加载完成
    const results = await Promise.allSettled(loadPromises)
    
    console.log('所有模型加载完成，结果:', results)
    return results

  } catch (error) {
    console.error('多模型加载失败:', error)
    throw error
  }
}

/**
 * 示例3: 结合现有ResourceReaderPlugin使用Worker
 */
export async function exampleIntegrationWithResourceReader() {
  try {
    console.log('🎯 示例3: 与ResourceReaderPlugin集成')
    
    // 假设我们已经有了renderer
    // const renderer = new THREE.WebGLRenderer()
    
    // 初始化Worker
    await gltfWorkerManager.initialize({
      enableDraco: true,
      enableKTX2: true,
      enableMeshopt: true
      // 如果有renderer，可以传入进行KTX2支持检测
      // renderer: renderer
    })

    // 设置事件监听
    eventBus.on('worker:progress', ({ taskId, progress, stage }) => {
      console.log(`Worker进度 [${taskId}]: ${progress.toFixed(1)}% - ${stage}`)
    })

    eventBus.on('worker:error', ({ taskId, error }) => {
      console.error(`Worker错误 [${taskId}]:`, error)
    })

    // 使用Worker加载模型
    const taskId = gltfWorkerManager.loadModel(
      { 
        url: '/models/demo.gltf',
        config: {
          enableDraco: true,
          enableKTX2: true,
          enableMeshopt: true
        }
      },
      {
        onProgress: (data) => {
          console.log('详细进度:', data)
        },
        onComplete: (result) => {
          console.log('Worker模型加载完成')
          
          // 处理动画
          if (result.animations && result.animations.length > 0) {
            // 创建动画混合器
            const mixer = new THREE.AnimationMixer(result.scene)
            
            // 处理每个动画
            result.animations.forEach((clip: THREE.AnimationClip, index: number) => {
              const action = mixer.clipAction(clip)
              // 可以选择播放动画
              // action.play()
            })
          }
          
          // 返回场景对象供主线程使用
          return result
        },
        onError: (error) => {
          console.error('Worker加载错误:', error)
        }
      }
    )

    // 可以监控任务状态
    setTimeout(() => {
      const status = gltfWorkerManager.getTaskStatus(taskId)
      console.log(`任务 ${taskId} 状态:`, status)
      
      const activeCount = gltfWorkerManager.getActiveTaskCount()
      const queueCount = gltfWorkerManager.getQueueTaskCount()
      console.log(`活跃任务: ${activeCount}, 队列任务: ${queueCount}`)
    }, 2000)

    return taskId

  } catch (error) {
    console.error('Worker集成失败:', error)
    throw error
  }
}

/**
 * 示例4: 错误处理和重试机制
 */
export async function exampleErrorHandlingAndRetry() {
  try {
    console.log('🎯 示例4: 错误处理和重试')

    // 初始化Worker
    await gltfWorkerManager.initialize()

    const models = [
      { url: '/models/valid-model.gltf', retryCount: 0 },
      { url: '/models/invalid-model.gltf', retryCount: 0 },
      { url: '/models/missing-model.gltf', retryCount: 0 }
    ]

    const results = []

    for (const model of models) {
      let success = false
      let attempts = 0
      const maxAttempts = 3

      while (!success && attempts < maxAttempts) {
        try {
          attempts++
          console.log(`尝试加载 ${model.url} (第${attempts}次)`)
          
          const result = await loadModelWithWorker(model.url, {
            onProgress: (progress) => {
              if (progress.progress % 25 === 0) { // 每25%输出一次
                console.log(`${model.url}: ${progress.progress.toFixed(1)}%`)
              }
            },
            onComplete: (result) => {
              console.log(`✅ ${model.url} 成功加载`)
              return result
            },
            onError: (error) => {
              console.error(`❌ ${model.url} 加载失败:`, error)
              throw error
            }
          })
          
          results.push({ success: true, model: model.url, result })
          success = true
          
        } catch (error) {
          console.error(`${model.url} 第${attempts}次尝试失败:`, error)
          
          if (attempts >= maxAttempts) {
            results.push({ success: false, model: model.url, error })
          } else {
            // 等待一段时间后重试
            await new Promise(resolve => setTimeout(resolve, 1000 * attempts))
          }
        }
      }
    }

    console.log('加载结果汇总:', results)
    return results

  } catch (error) {
    console.error('错误处理示例失败:', error)
    throw error
  }
}

/**
 * 示例5: 取消任务和清理资源
 */
export async function exampleTaskCancellationAndCleanup() {
  try {
    console.log('🎯 示例5: 任务取消和清理')

    // 初始化Worker
    await gltfWorkerManager.initialize()

    // 启动一个长时间加载的任务
    const taskId = gltfWorkerManager.loadModel(
      { url: '/models/large-model.gltf' },
      {
        onProgress: (progress) => {
          console.log(`加载进度: ${progress.progress.toFixed(1)}%`)
        },
        onComplete: (result) => {
          console.log('模型加载完成')
        },
        onError: (error) => {
          console.error('加载错误:', error)
        }
      }
    )

    console.log(`任务已启动: ${taskId}`)

    // 5秒后取消任务
    setTimeout(() => {
      console.log('取消任务...')
      gltfWorkerManager.cancelTask(taskId)
      console.log('任务已取消')
    }, 5000)

    // 10秒后清理Worker
    setTimeout(async () => {
      console.log('清理Worker资源...')
      await gltfWorkerManager.dispose()
      console.log('Worker资源已清理')
    }, 10000)

  } catch (error) {
    console.error('取消和清理示例失败:', error)
    throw error
  }
}

/**
 * 主函数：运行所有示例
 */
export async function runAllExamples() {
  console.log('🚀 开始运行GLTF Worker示例')
  
  try {
    // 运行各个示例（可以根据需要注释掉某些示例）
    await exampleBasicWorkerLoading()
    
    // await exampleMultipleModelLoading()
    // await exampleIntegrationWithResourceReader()
    // await exampleErrorHandlingAndRetry()
    // await exampleTaskCancellationAndCleanup()
    
    console.log('✅ 所有示例运行完成')
  } catch (error) {
    console.error('❌ 示例运行失败:', error)
  }
}

// 函数已通过export async function语法直接导出，无需重复导出

// 如果直接运行此文件，执行示例
if (typeof window !== 'undefined' && window === globalThis) {
  // 在浏览器环境中，可以手动调用示例
  (window as any).GLTFWorkerExamples = {
    runAllExamples,
    exampleBasicWorkerLoading,
    exampleMultipleModelLoading,
    exampleIntegrationWithResourceReader,
    exampleErrorHandlingAndRetry,
    exampleTaskCancellationAndCleanup
  }
  
  console.log('📋 GLTF Worker示例已准备就绪，可在控制台中调用:')
  console.log('- GLTFWorkerExamples.runAllExamples()')
  console.log('- GLTFWorkerExamples.exampleBasicWorkerLoading()')
  console.log('等方法')
}