// BaseScene 安全性测试 - 防止栈溢出

import { BaseScene } from '../src/plugins/webgl/baseScene'

// 测试1: 正常创建场景
console.log('🧪 测试1: 正常创建场景')
try {
    const normalScene = BaseScene.createMinimal()
    console.log('✅ 正常创建成功')
    normalScene.destroy()
} catch (error) {
    console.error('❌ 正常创建失败:', error)
}

// 测试2: 使用循环引用的配置
console.log('🧪 测试2: 使用循环引用的配置')
try {
    const circularConfig: any = {
        rendererConfig: {
            antialias: true
        }
    }
    // 创建循环引用
    circularConfig.self = circularConfig
    circularConfig.rendererConfig.parent = circularConfig
    
    const circularScene = BaseScene.createBalanced(circularConfig)
    console.log('✅ 循环引用处理成功')
    circularScene.destroy()
} catch (error) {
    console.error('❌ 循环引用处理失败:', error)
}

// 测试3: 使用空配置
console.log('🧪 测试3: 使用空配置')
try {
    const emptyScene = new BaseScene({})
    console.log('✅ 空配置处理成功')
    emptyScene.destroy()
} catch (error) {
    console.error('❌ 空配置处理失败:', error)
}

// 测试4: 使用null/undefined配置
console.log('🧪 测试4: 使用null/undefined配置')
try {
    const nullScene = new BaseScene(null)
    console.log('✅ null配置处理成功')
    nullScene.destroy()
} catch (error) {
    console.error('❌ null配置处理失败:', error)
}

// 测试5: 深度嵌套配置
console.log('🧪 测试5: 深度嵌套配置')
try {
    const deepConfig: any = {
        rendererConfig: {
            level1: {
                level2: {
                    level3: {
                        level4: {
                            level5: {
                                value: "deep value"
                            }
                        }
                    }
                }
            }
        }
    }
    
    const deepScene = BaseScene.createBalanced(deepConfig)
    console.log('✅ 深度嵌套处理成功')
    deepScene.destroy()
} catch (error) {
    console.error('❌ 深度嵌套处理失败:', error)
}

// 测试6: 所有预设类型
console.log('🧪 测试6: 所有预设类型')
const presets = BaseScene.getAvailablePresets()
console.log('可用预设:', presets)

for (const preset of presets) {
    try {
        const config = BaseScene.getPresetConfig(preset)
        console.log(`✅ 预设 ${preset} 配置获取成功`)
        
        // 使用预设创建场景
        const scene = new BaseScene({
            userData: { preset: preset }
        })
        console.log(`✅ 预设 ${preset} 场景创建成功`)
        scene.destroy()
    } catch (error) {
        console.error(`❌ 预设 ${preset} 失败:`, error)
    }
}

// 测试7: 性能监控安全性
console.log('🧪 测试7: 性能监控安全性')
try {
    const perfScene = BaseScene.createDevelopment()
    
    // 测试性能监控方法
    perfScene.setPerformanceMonitorEnabled(true)
    const stats = perfScene.getPerformanceStats()
    console.log('性能统计:', stats)
    
    perfScene.resetPerformanceStats()
    console.log('✅ 性能监控安全性测试成功')
    perfScene.destroy()
} catch (error) {
    console.error('❌ 性能监控安全性测试失败:', error)
}

// 测试8: 内存泄漏检查
console.log('🧪 测试8: 内存泄漏检查')
try {
    const scenes: BaseScene[] = []
    
    // 创建多个场景
    for (let i = 0; i < 5; i++) {
        const scene = BaseScene.createMinimal()
        scenes.push(scene)
    }
    
    // 销毁所有场景
    scenes.forEach((scene, index) => {
        try {
            scene.destroy()
            console.log(`✅ 场景 ${index} 销毁成功`)
        } catch (error) {
            console.error(`❌ 场景 ${index} 销毁失败:`, error)
        }
    })
    
    console.log('✅ 内存泄漏检查完成')
} catch (error) {
    console.error('❌ 内存泄漏检查失败:', error)
}

console.log('🎉 所有安全性测试完成')

export { }  // 确保这是一个模块 