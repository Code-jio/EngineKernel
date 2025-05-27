// LayerManager 功能测试

import { LayerManager, LayerType } from '../src/plugins/webgl/layerManager'
import { THREE } from '../src/plugins/basePlugin'

console.log('🧪 LayerManager功能测试开始')

let testsPassed = 0
let testsTotal = 0

function test(name: string, testFunc: () => boolean): void {
    testsTotal++
    try {
        const result = testFunc()
        if (result) {
            console.log(`✅ ${name}`)
            testsPassed++
        } else {
            console.log(`❌ ${name}`)
        }
    } catch (error) {
        console.log(`❌ ${name} - 错误: ${error}`)
    }
}

// 创建图层管理器实例
const layerManager = new LayerManager({ userData: {} })

// 模拟场景就绪事件
setTimeout(() => {
    // 模拟场景对象
    const mockScene = new THREE.Scene()
    layerManager['onSceneReady']({
        scene: mockScene,
        camera: new THREE.PerspectiveCamera(),
        renderer: new THREE.WebGLRenderer()
    })

    // 等待默认图层创建完成
    setTimeout(() => {
        runTests()
    }, 100)
}, 100)

function runTests() {
    console.log('🔬 开始执行测试...')

    // ===============================================
    // 基础功能测试
    // ===============================================

    test('默认图层创建', () => {
        const layers = layerManager.getAllLayers()
        return layers.length === 6 // 应该有6个默认图层
    })

    test('获取图层统计', () => {
        const stats = layerManager.getLayerStats()
        return stats.totalLayers > 0 && typeof stats.visibleLayers === 'number'
    })

    test('按类型获取图层', () => {
        const baseLayers = layerManager.getLayersByType(LayerType.BASE_SCENE)
        return baseLayers.length > 0
    })

    // ===============================================
    // 图层创建和管理测试
    // ===============================================

    test('创建自定义图层', () => {
        const layer = layerManager.createLayer({
            id: 'test-layer-1',
            name: '测试图层1',
            type: LayerType.CUSTOM,
            visible: true,
            renderOrder: 999
        })
        return layer !== null && layer.id === 'test-layer-1'
    })

    test('重复ID创建图层应失败', () => {
        const layer = layerManager.createLayer({
            id: 'test-layer-1',
            name: '重复图层',
            type: LayerType.CUSTOM
        })
        return layer === null
    })

    test('创建子图层', () => {
        const childLayer = layerManager.createLayer({
            id: 'child-layer',
            name: '子图层',
            type: LayerType.CUSTOM,
            parent: 'test-layer-1'
        })
        const parentLayer = layerManager.getLayer('test-layer-1')
        return childLayer !== null && parentLayer!.children.has('child-layer')
    })

    test('父图层不存在时创建子图层应失败', () => {
        const layer = layerManager.createLayer({
            id: 'orphan-layer',
            name: '孤儿图层',
            type: LayerType.CUSTOM,
            parent: 'nonexistent-parent'
        })
        return layer === null
    })

    // ===============================================
    // 图层属性控制测试
    // ===============================================

    test('设置图层可见性', () => {
        const success = layerManager.setLayerVisibility('test-layer-1', false)
        const layer = layerManager.getLayer('test-layer-1')
        return success && !layer!.visible && !layer!.group.visible
    })

    test('设置图层透明度', () => {
        const success = layerManager.setLayerOpacity('test-layer-1', 0.5)
        const layer = layerManager.getLayer('test-layer-1')
        return success && layer!.opacity === 0.5
    })

    test('设置无效透明度应失败', () => {
        const success = layerManager.setLayerOpacity('test-layer-1', 1.5)
        return !success
    })

    test('设置图层渲染顺序', () => {
        const success = layerManager.setLayerRenderOrder('test-layer-1', 500)
        const layer = layerManager.getLayer('test-layer-1')
        return success && layer!.renderOrder === 500 && layer!.group.renderOrder === 500
    })

    // ===============================================
    // 对象管理测试
    // ===============================================

    test('添加对象到图层', () => {
        const cube = new THREE.Mesh(
            new THREE.BoxGeometry(1, 1, 1),
            new THREE.MeshBasicMaterial({ color: 0xff0000 })
        )
        const success = layerManager.addToLayer('test-layer-1', cube)
        const layer = layerManager.getLayer('test-layer-1')
        return success && layer!.group.children.includes(cube)
    })

    test('从图层移除对象', () => {
        const sphere = new THREE.Mesh(
            new THREE.SphereGeometry(0.5),
            new THREE.MeshBasicMaterial({ color: 0x00ff00 })
        )
        layerManager.addToLayer('test-layer-1', sphere)
        const success = layerManager.removeFromLayer('test-layer-1', sphere)
        const layer = layerManager.getLayer('test-layer-1')
        return success && !layer!.group.children.includes(sphere)
    })

    test('添加对象到默认图层', () => {
        const cylinder = new THREE.Mesh(
            new THREE.CylinderGeometry(0.5, 0.5, 1),
            new THREE.MeshBasicMaterial({ color: 0x0000ff })
        )
        const success = layerManager.addToDefaultLayer(LayerType.BASE_MODEL, cylinder)
        return success
    })

    test('向不存在的图层添加对象应失败', () => {
        const object = new THREE.Object3D()
        const success = layerManager.addToLayer('nonexistent-layer', object)
        return !success
    })

    // ===============================================
    // 批量操作测试
    // ===============================================

    test('批量隐藏指定类型图层', () => {
        layerManager.hideLayersByType(LayerType.SPRITE)
        const spriteLayers = layerManager.getLayersByType(LayerType.SPRITE)
        return spriteLayers.every(layer => !layer.visible)
    })

    test('批量显示指定类型图层', () => {
        layerManager.showLayersByType(LayerType.SPRITE)
        const spriteLayers = layerManager.getLayersByType(LayerType.SPRITE)
        return spriteLayers.every(layer => layer.visible)
    })

    // ===============================================
    // 查询功能测试
    // ===============================================

    test('根据名称查找图层', () => {
        const foundLayers = layerManager.findLayersByName('测试')
        return foundLayers.length > 0 && foundLayers.some(layer => layer.name.includes('测试'))
    })

    test('获取默认图层ID', () => {
        const layerId = layerManager.getDefaultLayerId(LayerType.BASE_SCENE)
        return layerId !== null && layerId.includes('baseScene')
    })

    test('获取图层顺序', () => {
        const order = layerManager.getLayerOrder()
        return Array.isArray(order) && order.length > 0
    })

    test('移动图层位置', () => {
        const originalOrder = layerManager.getLayerOrder()
        const layerId = originalOrder[0]
        const success = layerManager.moveLayer(layerId, 1)
        const newOrder = layerManager.getLayerOrder()
        return success && newOrder[1] === layerId
    })

    // ===============================================
    // 配置导入导出测试
    // ===============================================

    test('导出图层配置', () => {
        const config = layerManager.exportLayerConfig()
        return config && 
               config.version === '1.0' && 
               Array.isArray(config.layers) && 
               config.layers.length > 0
    })

    test('导入图层配置', () => {
        const config = {
            version: '1.0',
            layers: [
                {
                    id: 'imported-layer',
                    name: '导入的图层',
                    type: LayerType.CUSTOM,
                    visible: true,
                    renderOrder: 100,
                    opacity: 1.0,
                    metadata: { source: 'import' }
                }
            ]
        }
        const success = layerManager.importLayerConfig(config)
        const importedLayer = layerManager.getLayer('imported-layer')
        return success && importedLayer !== null
    })

    test('导入无效配置应失败', () => {
        const invalidConfig = { invalid: true }
        const success = layerManager.importLayerConfig(invalidConfig)
        return !success
    })

    // ===============================================
    // 图层删除测试
    // ===============================================

    test('删除子图层', () => {
        const success = layerManager.deleteLayer('child-layer')
        const layer = layerManager.getLayer('child-layer')
        const parentLayer = layerManager.getLayer('test-layer-1')
        return success && 
               layer === null && 
               !parentLayer!.children.has('child-layer')
    })

    test('删除父图层会递归删除子图层', () => {
        // 创建父子图层结构
        layerManager.createLayer({
            id: 'parent-for-deletion',
            name: '待删除父图层',
            type: LayerType.CUSTOM
        })
        
        layerManager.createLayer({
            id: 'child-for-deletion',
            name: '待删除子图层',
            type: LayerType.CUSTOM,
            parent: 'parent-for-deletion'
        })

        const success = layerManager.deleteLayer('parent-for-deletion')
        const parentLayer = layerManager.getLayer('parent-for-deletion')
        const childLayer = layerManager.getLayer('child-for-deletion')
        
        return success && parentLayer === null && childLayer === null
    })

    test('删除不存在的图层应失败', () => {
        const success = layerManager.deleteLayer('nonexistent-layer')
        return !success
    })

    // ===============================================
    // 边界条件测试
    // ===============================================

    test('创建图层时缺少必填参数应失败', () => {
        const layer = layerManager.createLayer({
            id: '',
            name: '',
            type: LayerType.CUSTOM
        })
        return layer === null
    })

    test('移动图层到无效位置应失败', () => {
        const order = layerManager.getLayerOrder()
        const success = layerManager.moveLayer(order[0], -1)
        return !success
    })

    // ===============================================
    // 内存管理测试
    // ===============================================

    test('销毁图层管理器', () => {
        const initialLayerCount = layerManager.getAllLayers().length
        layerManager.destroy()
        const finalLayerCount = layerManager.getAllLayers().length
        return finalLayerCount === 0 && initialLayerCount > 0
    })

    // ===============================================
    // 测试结果统计
    // ===============================================

    setTimeout(() => {
        console.log('🎯 测试完成!')
        console.log(`📊 测试结果: ${testsPassed}/${testsTotal} 通过`)
        console.log(`✅ 成功率: ${((testsPassed / testsTotal) * 100).toFixed(1)}%`)
        
        if (testsPassed === testsTotal) {
            console.log('🎉 所有测试都通过了!')
        } else {
            console.log('⚠️ 部分测试未通过，请检查实现')
        }
    }, 1000)
}

export { } 