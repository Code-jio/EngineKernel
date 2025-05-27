// LayerManager 使用示例

import { LayerManager, LayerType } from '../src/plugins/webgl/layerManager'
import { THREE } from '../src/plugins/basePlugin'

console.log('🎭 LayerManager使用示例开始')

// ===============================================
// 🚀 基础使用
// ===============================================

// 1. 创建图层管理器
const layerManager = new LayerManager({ userData: {} })

// 等待场景就绪后的操作
setTimeout(() => {
    console.log('📋 当前图层列表:')
    const allLayers = layerManager.getAllLayers()
    allLayers.forEach(layer => {
        console.log(`  - ${layer.name} (${layer.type}) - 可见: ${layer.visible}`)
    })

    // ===============================================
    // 🔧 创建自定义图层
    // ===============================================

    // 2. 创建自定义图层
    const customLayer = layerManager.createLayer({
        id: 'custom-objects',
        name: '自定义对象',
        type: LayerType.CUSTOM,
        visible: true,
        renderOrder: 150,
        opacity: 0.8,
        metadata: {
            description: '用户自定义的3D对象',
            color: '#ff6b6b'
        }
    })

    if (customLayer) {
        console.log(`✅ 创建自定义图层成功: ${customLayer.name}`)
    }

    // 3. 创建子图层
    const subLayer = layerManager.createLayer({
        id: 'sub-layer',
        name: '子图层',
        type: LayerType.CUSTOM,
        parent: 'custom-objects',
        renderOrder: 151
    })

    // ===============================================
    // 📦 添加3D对象到图层
    // ===============================================

    // 4. 创建一些3D对象
    const geometry = new THREE.BoxGeometry(1, 1, 1)
    const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 })
    const cube = new THREE.Mesh(geometry, material)
    cube.position.set(2, 0, 0)

    const sphereGeometry = new THREE.SphereGeometry(0.5, 16, 16)
    const sphereMaterial = new THREE.MeshBasicMaterial({ color: 0x0077ff })
    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial)
    sphere.position.set(-2, 0, 0)

    // 5. 添加对象到不同图层
    layerManager.addToDefaultLayer(LayerType.BASE_MODEL, cube)
    layerManager.addToLayer('custom-objects', sphere)

    console.log('✅ 已添加3D对象到图层')

    // ===============================================
    // 🎛️ 图层控制操作
    // ===============================================

    // 6. 控制图层可见性
    setTimeout(() => {
        console.log('🔄 隐藏基础模型图层')
        layerManager.hideLayersByType(LayerType.BASE_MODEL)
        
        setTimeout(() => {
            console.log('🔄 显示基础模型图层')
            layerManager.showLayersByType(LayerType.BASE_MODEL)
        }, 2000)
    }, 1000)

    // 7. 调整透明度
    setTimeout(() => {
        console.log('🔄 设置自定义图层透明度为0.5')
        layerManager.setLayerOpacity('custom-objects', 0.5)
        
        setTimeout(() => {
            console.log('🔄 恢复自定义图层透明度为1.0')
            layerManager.setLayerOpacity('custom-objects', 1.0)
        }, 2000)
    }, 3000)

    // 8. 调整渲染顺序
    setTimeout(() => {
        console.log('🔄 调整自定义图层渲染顺序')
        layerManager.setLayerRenderOrder('custom-objects', 50)
    }, 5000)

    // ===============================================
    // 📊 图层信息查询
    // ===============================================

    // 9. 获取图层统计
    setTimeout(() => {
        const stats = layerManager.getLayerStats()
        console.log('📊 图层统计信息:', stats)

        // 10. 查找特定图层
        const modelLayers = layerManager.getLayersByType(LayerType.BASE_MODEL)
        console.log('🔍 基础模型图层:', modelLayers.map(l => l.name))

        const foundLayers = layerManager.findLayersByName('自定义')
        console.log('🔍 包含"自定义"的图层:', foundLayers.map(l => l.name))

        // 11. 获取图层顺序
        const layerOrder = layerManager.getLayerOrder()
        console.log('📋 图层顺序:', layerOrder)
    }, 6000)

    // ===============================================
    // 💾 导出导入配置
    // ===============================================

    // 12. 导出图层配置
    setTimeout(() => {
        const config = layerManager.exportLayerConfig()
        console.log('💾 导出的图层配置:', config)

        // 13. 导入图层配置（演示）
        setTimeout(() => {
            const success = layerManager.importLayerConfig(config)
            console.log(`📥 导入图层配置${success ? '成功' : '失败'}`)
        }, 1000)
    }, 7000)

}, 1000)

// ===============================================
// 🎨 高级用法示例
// ===============================================

// 创建一个复杂的图层结构示例
function createComplexLayerStructure(manager: LayerManager) {
    // 建筑图层组
    const buildingGroup = manager.createLayer({
        id: 'building-group',
        name: '建筑群组',
        type: LayerType.CUSTOM,
        renderOrder: 200
    })

    // 建筑子图层
    const floors = ['ground', 'floor-1', 'floor-2', 'roof']
    floors.forEach((floor, index) => {
        manager.createLayer({
            id: `building-${floor}`,
            name: `建筑-${floor}`,
            type: LayerType.BASE_MODEL,
            parent: 'building-group',
            renderOrder: 200 + index,
            metadata: { floor: index }
        })
    })

    // 标注图层组
    const annotationGroup = manager.createLayer({
        id: 'annotation-group',
        name: '标注群组',
        type: LayerType.CUSTOM,
        renderOrder: 500
    })

    // 不同类型的标注
    const annotationTypes = [
        { id: 'text-annotations', name: '文字标注', type: LayerType.SPRITE },
        { id: 'image-annotations', name: '图片标注', type: LayerType.IMAGE_ANNOTATION },
        { id: 'model-annotations', name: '模型标注', type: LayerType.MODEL_ANNOTATION }
    ]

    annotationTypes.forEach((annotation, index) => {
        manager.createLayer({
            id: annotation.id,
            name: annotation.name,
            type: annotation.type,
            parent: 'annotation-group',
            renderOrder: 500 + index * 10
        })
    })

    console.log('🏗️ 复杂图层结构创建完成')
}

// 事件监听示例
function setupLayerEventListeners() {
    console.log('🎧 设置图层事件监听器')
    
    // 监听图层创建
    // eventBus.on('layer:created', (data: any) => {
    //     console.log(`📢 图层已创建: ${data.layer.name}`)
    // })

    // 监听可见性变化
    // eventBus.on('layer:visibility-changed', (data: any) => {
    //     console.log(`📢 图层可见性变化: ${data.layerId} - ${data.visible ? '显示' : '隐藏'}`)
    // })

    // 监听对象添加
    // eventBus.on('layer:object-added', (data: any) => {
    //     console.log(`📢 对象已添加到图层: ${data.layerId}`)
    // })
}

// 性能优化示例
function performanceOptimizationExample(manager: LayerManager) {
    console.log('⚡ 性能优化示例')

    // 批量隐藏不需要的图层
    const hiddenTypes = [LayerType.CSS3D, LayerType.IMAGE_ANNOTATION]
    hiddenTypes.forEach(type => {
        manager.hideLayersByType(type)
    })

    // 设置LOD图层（距离相关的显示）
    const lodLayers = ['lod-high', 'lod-medium', 'lod-low']
    lodLayers.forEach((layerId, index) => {
        manager.createLayer({
            id: layerId,
            name: `LOD-${index}`,
            type: LayerType.BASE_MODEL,
            renderOrder: 100 + index,
            visible: index === 0, // 只显示高精度
            metadata: { lod: index, distance: Math.pow(2, index) * 100 }
        })
    })

    console.log('⚡ LOD图层创建完成')
}

// 延迟执行高级示例
setTimeout(() => {
    createComplexLayerStructure(layerManager)
    setupLayerEventListeners()
    performanceOptimizationExample(layerManager)
}, 8000)

// ===============================================
// 🧹 清理资源
// ===============================================

// 程序结束时清理
setTimeout(() => {
    console.log('🧹 开始清理LayerManager资源')
    layerManager.destroy()
    console.log('✅ LayerManager资源清理完成')
}, 15000)

console.log('🎭 LayerManager使用示例设置完成')

export { layerManager } 