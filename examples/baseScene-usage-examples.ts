// BaseScene 使用示例 - 默认配置演示

import { BaseScene } from '../src/plugins/webgl/baseScene'

// ===============================================
// 🚀 最简单的使用方式 - 零配置创建场景
// ===============================================

// 1. 最简单的创建方式（推荐给新手）
const minimalScene = BaseScene.createMinimal()

// 2. 指定容器的最简创建
const container = document.getElementById('my-canvas') as HTMLCanvasElement
const minimalSceneWithContainer = BaseScene.createMinimal()

// ===============================================
// 🎯 预设配置创建场景
// ===============================================

// 3. 高性能场景（适合移动端）
const highPerfScene = BaseScene.createHighPerformance()

// 4. 平衡配置场景（默认推荐）
const balancedScene = BaseScene.createBalanced()

// 5. 高质量场景（适合桌面端）
const highQualityScene = BaseScene.createHighQuality()

// 6. 开发调试场景
const devScene = BaseScene.createDevelopment()

// ===============================================
// 🔧 自定义配置覆盖默认值
// ===============================================

// 7. 基于预设但覆盖部分配置
const customBalancedScene = BaseScene.createBalanced({
    cameraConfig: {
        position: [100, 100, 100], // 只修改相机位置
        fov: 60 // 修改视场角
    },
    rendererConfig: {
        shadowMapEnabled: true // 启用阴影
    }
})

// 8. 高性能场景但启用性能监控
const monitoredHighPerfScene = BaseScene.createHighPerformance({
    performanceConfig: {
        enabled: true
    },
    rendererConfig: {
        antialias: true // 覆盖默认的反锯齿关闭
    }
})

// ===============================================
// 📊 配置信息查询
// ===============================================

// 9. 查看所有可用预设
const availablePresets = BaseScene.getAvailablePresets()
console.log('可用预设:', availablePresets)
// 输出: ['highPerformance', 'balanced', 'highQuality', 'development']

// 10. 查看具体预设的配置
const balancedConfig = BaseScene.getPresetConfig('balanced')
console.log('平衡配置详情:', balancedConfig)

// ===============================================
// 🛠️ 传统方式（完全自定义）
// ===============================================

// 11. 如果你需要完全控制，仍然可以使用传统方式
const fullyCustomScene = new BaseScene({
    userData: {
        preset: 'balanced', // 可选：基于某个预设
        cameraConfig: {
            type: "perspective",
            fov: 75,
            near: 0.1,
            far: 1000,
            position: [50, 50, 50],
            lookAt: [0, 0, 0]
        },
        rendererConfig: {
            container: document.getElementById('my-canvas'),
            antialias: true,
            shadowMapEnabled: true,
            toneMapping: 2, // THREE.ReinhardToneMapping
            toneMappingExposure: 1.5
        },
        performanceConfig: {
            enabled: false
        }
    }
})

// ===============================================
// 🎮 运行时配置修改
// ===============================================

// 12. 运行时修改配置
const scene = BaseScene.createBalanced()

// 启用/禁用性能监控
scene.setPerformanceMonitorEnabled(true)

// 启用/禁用阴影
scene.setShadowEnabled(true)

// 修改色调映射
scene.setToneMapping(2, 1.2) // ReinhardToneMapping, exposure 1.2

// 获取性能统计
const stats = scene.getPerformanceStats()
console.log('性能统计:', stats)

// 获取场景信息
const sceneInfo = scene.getSceneInfo()
console.log('场景信息:', sceneInfo)

// ===============================================
// 📱 移动端优化示例
// ===============================================

// 13. 移动端专用配置
const mobileOptimizedScene = BaseScene.createHighPerformance({
    rendererConfig: {
        pixelRatio: 1, // 强制1倍像素比
        precision: "mediump", // 中等精度
        antialias: false, // 关闭反锯齿
        shadowMapEnabled: false // 关闭阴影
    },
    cameraConfig: {
        far: 5000 // 减少渲染距离
    },
    performanceConfig: {
        enabled: true // 监控性能
    }
})

// ===============================================
// 🖥️ 桌面端高质量示例
// ===============================================

// 14. 桌面端高质量配置
const desktopQualityScene = BaseScene.createHighQuality({
    rendererConfig: {
        shadowMapEnabled: true,
        shadowMapType: 2, // THREE.PCFSoftShadowMap
        toneMapping: 5, // THREE.ACESFilmicToneMapping
        toneMappingExposure: 1.2,
        physicallyCorrectLights: true
    },
    cameraConfig: {
        fov: 45,
        far: 100000 // 更远的渲染距离
    }
})

// ===============================================
// 🔍 使用建议总结
// ===============================================

/*
🎯 使用建议：

1. 新手推荐：
   - BaseScene.createMinimal() - 零配置快速开始

2. 移动端项目：
   - BaseScene.createHighPerformance() - 最佳性能

3. 桌面端项目：
   - BaseScene.createBalanced() - 平衡性能和质量
   - BaseScene.createHighQuality() - 追求最佳视觉效果

4. 开发调试：
   - BaseScene.createDevelopment() - 包含调试功能

5. 自定义需求：
   - 基于预设 + 覆盖特定配置
   - 使用传统构造函数方式

6. 性能监控：
   - 所有预设默认启用性能监控
   - 可通过 setPerformanceMonitorEnabled() 控制

7. 阴影系统：
   - 除高质量预设外，默认关闭阴影提升性能
   - 可通过 setShadowEnabled() 运行时切换
*/

export {
    minimalScene,
    balancedScene,
    highPerfScene,
    highQualityScene,
    devScene,
    customBalancedScene,
    mobileOptimizedScene,
    desktopQualityScene
} 