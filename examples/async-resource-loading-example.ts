// 异步资源加载示例
import { ResourceReaderPlugin } from '../src/plugins/webgl/resourceReaderPlugin'
import { TaskPriority, TaskProgress, TaskResult } from '../src/plugins/webgl/asyncTaskScheduler'
import eventBus from '../src/eventBus/eventBus'

/**
 * 异步资源加载示例
 * 展示新的异步任务调度器功能
 */
async function asyncResourceLoadingExample() {
  console.log('🚀 异步资源加载示例开始')

  // 创建资源读取插件
  const resourcePlugin = ResourceReaderPlugin.createHighPerformance({
    url: '/models/',
    maxConcurrentLoads: 5,
    enableDraco: true,
    dracoPath: '/draco/'
  })

  // 初始化插件
  await resourcePlugin.init(null)

  // 监听加载事件
  eventBus.on('task:progress', (progress: TaskProgress) => {
    console.log(`📊 任务进度: ${progress.taskId} - ${progress.percentage.toFixed(1)}%`)
  })

  eventBus.on('task:completed', (result: TaskResult) => {
    console.log(`✅ 任务完成: ${result.taskId} (${result.executionTime}ms)`)
  })

  eventBus.on('task:failed', (result: TaskResult) => {
    console.error(`❌ 任务失败: ${result.taskId}`, result.error)
  })

  // 示例1: 单个模型异步加载
  console.log('\n--- 示例1: 单个模型异步加载 ---')
  try {
    const model1 = await resourcePlugin.loadModelAsync(
      'character.glb',
      TaskPriority.HIGH,
      {
        timeout: 30000,
        retryCount: 2,
        category: 'character'
      }
    )
    console.log(`✅ 单个模型加载成功:`, model1)
  } catch (error) {
    console.error('❌ 单个模型加载失败:', error)
  }

  // 示例2: 批量模型异步加载
  console.log('\n--- 示例2: 批量模型异步加载 ---')
  const modelUrls = [
    'environment.glb',
    'props/table.glb',
    'props/chair.glb',
    'effects/particles.glb'
  ]

  try {
    const batchResults = await resourcePlugin.loadBatchAsync(
      modelUrls,
      TaskPriority.NORMAL,
      {
        timeout: 45000,
        retryCount: 1,
        category: 'environment'
      }
    )

    console.log(`✅ 批量加载完成，成功: ${batchResults.filter(r => r.model).length}/${batchResults.length}`)
    
    batchResults.forEach((result, index) => {
      if (result.model) {
        console.log(`  ✅ ${modelUrls[index]} - 加载成功`)
      } else {
        console.error(`  ❌ ${modelUrls[index]} - 加载失败:`, result.error?.message)
      }
    })
  } catch (error) {
    console.error('❌ 批量加载失败:', error)
  }

  // 示例3: 混合优先级加载
  console.log('\n--- 示例3: 混合优先级加载 ---')
  
  // 同时启动不同优先级的加载任务
  const urgentTask = resourcePlugin.loadModelAsync('ui/menu.glb', TaskPriority.URGENT)
  const normalTask = resourcePlugin.loadModelAsync('background/skybox.glb', TaskPriority.NORMAL)
  const lowTask = resourcePlugin.loadModelAsync('optional/detail.glb', TaskPriority.LOW)

  try {
    // 等待所有任务完成
    const [urgentModel, normalModel, lowModel] = await Promise.allSettled([
      urgentTask,
      normalTask, 
      lowTask
    ])

    console.log('混合优先级加载结果:')
    console.log('  紧急任务:', urgentModel.status === 'fulfilled' ? '✅ 成功' : `❌ 失败: ${urgentModel.reason}`)
    console.log('  普通任务:', normalModel.status === 'fulfilled' ? '✅ 成功' : `❌ 失败: ${normalModel.reason}`)
    console.log('  低优先级任务:', lowModel.status === 'fulfilled' ? '✅ 成功' : `❌ 失败: ${lowModel.reason}`)

  } catch (error) {
    console.error('❌ 混合优先级加载出错:', error)
  }

  // 示例4: 监控调度器状态
  console.log('\n--- 示例4: 调度器状态监控 ---')
  
  // 启动一些后台任务
  const backgroundTasks = [
    'cache/model1.glb',
    'cache/model2.glb', 
    'cache/model3.glb'
  ].map(url => 
    resourcePlugin.loadModelAsync(url, TaskPriority.LOW, { category: 'preload' })
  )

  // 监控状态
  const statusInterval = setInterval(() => {
    const status = resourcePlugin.getSchedulerStatus()
    console.log(`📊 调度器状态: 等待${status.pending} | 运行${status.running} | 完成${status.completed}`)
    
    if (status.pending === 0 && status.running === 0) {
      clearInterval(statusInterval)
      console.log('🎉 所有任务已完成')
    }
  }, 1000)

  // 等待后台任务完成
  try {
    await Promise.allSettled(backgroundTasks)
    console.log('✅ 后台预加载任务完成')
  } catch (error) {
    console.error('❌ 后台预加载失败:', error)
  }

  // 示例5: 任务取消和错误处理
  console.log('\n--- 示例5: 任务取消和错误处理 ---')
  
  // 启动一个长时间运行的任务
  const longTask = resourcePlugin.loadModelAsync(
    'large/huge-model.glb',
    TaskPriority.NORMAL,
    {
      timeout: 60000,
      category: 'large-file'
    }
  )

  // 2秒后取消任务（模拟用户取消）
  setTimeout(() => {
    // 注意：这里我们无法直接取消Promise，但可以演示调度器的取消功能
    console.log('⏹️ 模拟用户取消操作')
  }, 2000)

  try {
    await longTask
    console.log('✅ 大文件加载完成')
  } catch (error) {
    console.log('⏹️ 大文件加载被取消或失败:', error instanceof Error ? error.message : error)
  }

  // 最终状态
  console.log('\n--- 最终状态 ---')
  const finalStatus = resourcePlugin.getSchedulerStatus()
  const cacheStatus = resourcePlugin.getCacheStatus()
  
  console.log('调度器最终状态:', finalStatus)
  console.log('缓存状态:', cacheStatus)

  // 清理资源
  setTimeout(() => {
    resourcePlugin.dispose()
    console.log('🧹 示例结束，资源已清理')
  }, 3000)
}

/**
 * 性能对比示例
 * 比较新旧加载方式的性能差异
 */
async function performanceComparisonExample() {
  console.log('\n🏁 性能对比示例开始')

  const resourcePlugin = ResourceReaderPlugin.createHighPerformance()
  await resourcePlugin.init(null)

  const testUrls = [
    'test1.glb',
    'test2.glb', 
    'test3.glb',
    'test4.glb',
    'test5.glb'
  ]

  // 测试新的异步方式
  console.log('测试新的异步加载方式...')
  const asyncStartTime = Date.now()
  
  try {
    const asyncResults = await resourcePlugin.loadBatchAsync(testUrls, TaskPriority.HIGH)
    const asyncEndTime = Date.now()
    const asyncDuration = asyncEndTime - asyncStartTime
    
    console.log(`✅ 异步加载完成: ${asyncDuration}ms`)
    console.log(`   成功: ${asyncResults.filter(r => r.model).length}/${asyncResults.length}`)
  } catch (error) {
    console.error('❌ 异步加载测试失败:', error)
  }

  // 测试传统回调方式（模拟）
  console.log('测试传统回调方式...')
  const callbackStartTime = Date.now()
  
  let completedCount = 0
  const callbackPromises = testUrls.map(url => 
    new Promise((resolve, reject) => {
      resourcePlugin.loadModel(
        url,
        (gltf) => {
          completedCount++
          resolve(gltf)
        },
        undefined,
        (error) => {
          completedCount++
          reject(error)
        }
      )
    })
  )

  try {
    await Promise.allSettled(callbackPromises)
    const callbackEndTime = Date.now()
    const callbackDuration = callbackEndTime - callbackStartTime
    
    console.log(`✅ 回调加载完成: ${callbackDuration}ms`)
  } catch (error) {
    console.error('❌ 回调加载测试失败:', error)
  }

  resourcePlugin.dispose()
}

/**
 * 启动示例
 */
export async function runAsyncResourceLoadingExamples() {
  try {
    await asyncResourceLoadingExample()
    await performanceComparisonExample()
  } catch (error) {
    console.error('❌ 示例运行失败:', error)
  }
}

// 如果直接运行此文件
if (require.main === module) {
  runAsyncResourceLoadingExamples()
} 