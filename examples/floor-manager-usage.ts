/**
 * 地板管理器使用示例
 * 展示如何单独使用FloorManager和如何与BaseScene集成
 */

import { THREE } from "../src/plugins/basePlugin"
import { FloorConfig, FloorManager } from "../src/plugins/webgl/floorManager"
import { BaseScene } from "../src/plugins/webgl/baseScene"

// ==========================================
// 1. 独立使用 FloorManager
// ==========================================

function createStandaloneFloorExample() {
    // 创建基础的Three.js场景
    const scene = new THREE.Scene()
    const renderer = new THREE.WebGLRenderer()
    
    // 创建地板管理器实例
    const floorManager = new FloorManager(scene)
    
    // 配置水面地板
    const waterFloorConfig: FloorConfig = {
        enabled: true,
        type: 'water',
        size: 20000,
        position: [0, 0, 0],
        waterConfig: {
            color: 0x001e0f,
            sunColor: 0xffffff,
            distortionScale: 3.7,
            textureWidth: 512,
            textureHeight: 512,
            alpha: 1.0,
            time: 0
        }
    }
    
    // 创建地板
    floorManager.createFloor(waterFloorConfig, renderer)
    
    // 动画更新循环
    function animate() {
        const deltaTime = performance.now()
        floorManager.updateFloor(deltaTime)
        requestAnimationFrame(animate)
    }
    animate()
    
    return { scene, floorManager, renderer }
}

// ==========================================
// 2. 与 BaseScene 集成使用
// ==========================================

function createIntegratedFloorExample() {
    // 使用BaseScene的地板功能
    const scene = BaseScene.createWithFloor('water', 25000, {
        waterConfig: {
            color: 0x004466,
            distortionScale: 5.0
        }
    })
    
    // 动态切换地板类型
    setTimeout(() => {
        scene.setFloorType('grid')
        console.log('已切换到网格地板')
    }, 3000)
    
    setTimeout(() => {
        scene.setFloorType('glow')
        console.log('已切换到发光地板')
    }, 6000)
    
    return scene
}

// ==========================================
// 3. 带贴图的地板示例
// ==========================================

function createTexturedFloorExamples() {
    // 创建带纹理的静态地板场景
    const texturedScene = BaseScene.createWithTexturedFloor(
        'static', 
        './textures/concrete.jpg', 
        15000
    )
    
    // 创建PBR地板场景
    const pbrScene = BaseScene.createWithPBRFloor({
        diffuse: './textures/wood_diffuse.jpg',
        normal: './textures/wood_normal.jpg',
        roughness: './textures/wood_roughness.jpg'
    }, 20000)
    
    // 创建带法线贴图的水面
    const waterWithTexture = BaseScene.createWithTexturedFloor(
        'water',
        './textures/water_normals.jpg',
        30000
    )
    
    return {
        texturedScene,
        pbrScene,
        waterWithTexture
    }
}

// ==========================================
// 4. 地板配置动态修改示例
// ==========================================

function createDynamicFloorExample() {
    const scene = BaseScene.createBalanced()
    
    // 初始设置静态地板
    scene.setStaticFloor(10000, {
        color: 0x654321,
        roughness: 0.8
    })
    
    // 5秒后切换到水面地板
    setTimeout(() => {
        scene.setWaterFloor(20000, {
            color: 0x001122,
            distortionScale: 4.0
        })
        console.log('切换到水面地板')
    }, 5000)
    
    // 10秒后使用带贴图的静态地板
    setTimeout(() => {
        scene.setStaticFloorWithTexture(15000, './textures/marble.jpg', {
            tiling: [10, 10],
            roughness: 0.2,
            metalness: 0.8
        })
        console.log('切换到大理石地板')
    }, 10000)
    
    // 15秒后使用PBR地板
    setTimeout(() => {
        scene.setStaticFloorWithPBR(18000, {
            diffuse: './textures/metal_diffuse.jpg',
            normal: './textures/metal_normal.jpg',
            roughness: './textures/metal_roughness.jpg',
            metallic: './textures/metal_metallic.jpg'
        }, {
            tiling: [5, 5]
        })
        console.log('切换到金属PBR地板')
    }, 15000)
    
    return scene
}

// ==========================================
// 5. 地板信息监控示例
// ==========================================

function createFloorMonitoringExample() {
    const scene = BaseScene.createWithFloor('water', 20000)
    
    // 定期获取地板信息
    setInterval(() => {
        const floorInfo = scene.getFloorInfo()
        console.log('地板状态:', floorInfo)
        
        const floorConfig = scene.getFloorConfig()
        console.log('地板配置:', floorConfig)
    }, 2000)
    
    // 测试地板切换
    let currentType = 0
    const floorTypes: FloorConfig['type'][] = ['water', 'static', 'grid', 'glow', 'reflection']
    
    setInterval(() => {
        currentType = (currentType + 1) % floorTypes.length
        scene.setFloorType(floorTypes[currentType])
        console.log(`已切换到: ${floorTypes[currentType]}地板`)
    }, 5000)
    
    return scene
}

// ==========================================
// 导出示例函数
// ==========================================

export {
    createStandaloneFloorExample,
    createIntegratedFloorExample,
    createTexturedFloorExamples,
    createDynamicFloorExample,
    createFloorMonitoringExample
}

// ==========================================
// 使用说明
// ==========================================

/*
🏢 地板管理器重构完成！

新的模块化架构提供了以下优势：

1. **独立性**: FloorManager可以独立使用，不依赖BaseScene
2. **类型安全**: 完整的TypeScript类型定义
3. **可维护性**: 地板相关代码集中在单独文件中
4. **可扩展性**: 易于添加新的地板类型
5. **向后兼容**: BaseScene的API保持不变

📁 文件结构:
- floorManager.ts: 地板管理器核心代码
- baseScene.ts: 基础场景插件（已精简）

🎯 主要功能:
- 6种地板类型（水面、静态、反射、网格、发光、无限）
- 完整的贴图支持
- 动画系统
- 便捷的API方法
- 工厂模式创建

📖 使用方式:
1. 独立使用: 直接实例化FloorManager
2. 集成使用: 通过BaseScene的地板方法
3. 静态工厂: 使用createWithFloor等方法
4. 动态切换: 运行时切换地板类型和配置

这次重构让代码更加模块化和易于维护！ 🎉
*/ 