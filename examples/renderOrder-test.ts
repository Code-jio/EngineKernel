/**
 * 渲染顺序测试
 * 验证地板和天空盒的renderOrder是否正确设置为0
 */

import { BaseScene } from '../src/plugins/webgl/baseScene'
import { SkyBox, SkyBoxType } from '../src/plugins/webgl/skyBox'
import { THREE } from '../src/plugins/basePlugin'

export class RenderOrderTest {
    private scene: BaseScene
    private skyBox: SkyBox

    constructor() {
        // 创建基础场景
        this.scene = BaseScene.createBalanced({
            floorConfig: {
                enabled: true,
                type: 'water',
                size: 20000,
                position: [0, 0, 0]
            }
        })

        // 创建天空盒
        this.skyBox = new SkyBox({
            userData: {
                type: SkyBoxType.PROCEDURAL_SKY,
                scene: this.scene.sceneInstance,
                camera: this.scene.cameraInstance,
                renderer: this.scene.rendererInstance
            }
        })
    }

    /**
     * 测试地板renderOrder
     */
    public testFloorRenderOrder(): boolean {
        const floorInfo = this.scene.getFloorInfo()
        
        if (!floorInfo || !floorInfo.floorInfo) {
            console.error('❌ 地板未创建')
            return false
        }

        // 遍历场景查找地板对象
        let floorMesh: THREE.Mesh | null = null
        this.scene.sceneInstance.traverse((object) => {
            if (object.name === 'ground' && object instanceof THREE.Mesh) {
                floorMesh = object as THREE.Mesh
            }
        })

        if (!floorMesh) {
            console.error('❌ 未找到地板mesh对象')
            return false
        }

        const renderOrder = (floorMesh as any).renderOrder || 0
        const isCorrect = renderOrder === 0

        console.log(`🏢 地板renderOrder测试: ${renderOrder} ${isCorrect ? '✅' : '❌'}`)
        return isCorrect
    }

    /**
     * 测试天空盒renderOrder
     */
    public testSkyBoxRenderOrder(): boolean {
        const skyBoxInfo = this.skyBox.getSkyBoxInfo()
        
        if (!skyBoxInfo.isLoaded) {
            console.error('❌ 天空盒未加载')
            return false
        }

        // 遍历场景查找天空盒对象
        let skyBoxMesh: THREE.Mesh | null = null
        this.scene.sceneInstance.traverse((object) => {
            if (object.name === 'skyBox' && object instanceof THREE.Mesh) {
                skyBoxMesh = object as THREE.Mesh
            }
        })

        if (!skyBoxMesh) {
            console.error('❌ 未找到天空盒mesh对象')
            return false
        }

        const renderOrder = (skyBoxMesh as any).renderOrder || 0
        const isCorrect = renderOrder === 0

        console.log(`🌌 天空盒renderOrder测试: ${renderOrder} ${isCorrect ? '✅' : '❌'}`)
        return isCorrect
    }

    /**
     * 运行所有测试
     */
    public runAllTests(): boolean {
        console.log('🧪 开始renderOrder测试...')
        
        // 等待场景和天空盒初始化完成
        setTimeout(() => {
            const floorTest = this.testFloorRenderOrder()
            const skyBoxTest = this.testSkyBoxRenderOrder()
            
            const allPassed = floorTest && skyBoxTest
            
            console.log(`📊 测试结果: ${allPassed ? '✅ 全部通过' : '❌ 部分失败'}`)
            console.log(`   - 地板renderOrder: ${floorTest ? '✅' : '❌'}`)
            console.log(`   - 天空盒renderOrder: ${skyBoxTest ? '✅' : '❌'}`)
            
            return allPassed
        }, 1000)

        return true
    }

    /**
     * 获取场景中所有对象的renderOrder信息
     */
    public getRenderOrderInfo(): any[] {
        const objects: any[] = []
        
        this.scene.sceneInstance.traverse((object) => {
            if (object instanceof THREE.Mesh) {
                objects.push({
                    name: object.name || 'unnamed',
                    type: object.constructor.name,
                    renderOrder: (object as any).renderOrder || 0,
                    visible: object.visible,
                    position: object.position.toArray(),
                    userData: object.userData
                })
            }
        })

        // 按renderOrder排序
        objects.sort((a, b) => a.renderOrder - b.renderOrder)
        
        console.log('📋 场景对象renderOrder信息:')
        objects.forEach((obj, index) => {
            console.log(`   ${index + 1}. ${obj.name} (${obj.type}): renderOrder=${obj.renderOrder}`)
        })

        return objects
    }

    /**
     * 清理资源
     */
    public destroy(): void {
        this.skyBox.destroy()
        this.scene.destroy()
        console.log('🧹 renderOrder测试资源已清理')
    }
}

// 使用示例
export function runRenderOrderTest(): void {
    const test = new RenderOrderTest()
    
    // 运行测试
    test.runAllTests()
    
    // 获取详细信息
    setTimeout(() => {
        test.getRenderOrderInfo()
        
        // 清理
        setTimeout(() => {
            test.destroy()
        }, 2000)
    }, 1500)
}

// 如果直接运行此文件
if (typeof window !== 'undefined') {
    // 浏览器环境
    ;(window as any).runRenderOrderTest = runRenderOrderTest
    console.log('🔧 renderOrder测试已准备就绪，调用 runRenderOrderTest() 开始测试')
} else {
    // Node.js环境
    console.log('🔧 renderOrder测试模块已加载')
} 