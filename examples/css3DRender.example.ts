import { CSS3DRenderPlugin } from '../src/plugins/webgl/css3DRender'
import * as THREE from 'three'

// 使用示例
export class CSS3DExample {
    private plugin: CSS3DRenderPlugin
    private camera: THREE.PerspectiveCamera
    private controls: any // 相机控制器

    constructor() {
        this.plugin = new CSS3DRenderPlugin()
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)
        
        this.init()
    }

    private async init() {
        // 初始化插件
        const mockCore = {
            registry: new Map(),
            listeners: new Map(),
            loadStrategies: {},
            _messageChannels: new Map(),
            performance: { metrics: new Map(), enable: true },
            components: new Map(),
            _servicePermissions: {},
            register: () => {},
            unregisterPlugin: () => {},
            getPlugin: () => undefined
        }

        this.plugin.initialize(mockCore)
        await this.plugin.start()

        // 设置相机位置
        this.camera.position.set(0, 0, 5)

        // 将渲染器DOM添加到页面
        const renderer = this.plugin.getRenderer()
        if (renderer) {
            document.body.appendChild(renderer.domElement)
        }

        this.createExampleObjects()
        this.startRenderLoop()
    }

    private createExampleObjects() {
        // 示例1：创建HTML div元素
        const div1 = document.createElement('div')
        div1.innerHTML = `
            <div style="
                width: 200px; 
                height: 100px; 
                background: linear-gradient(45deg, #ff6b6b, #4ecdc4);
                border-radius: 10px;
                padding: 20px;
                color: white;
                font-family: Arial;
                text-align: center;
                box-shadow: 0 4px 8px rgba(0,0,0,0.3);
            ">
                <h3>3D HTML元素</h3>
                <p>这是一个转换为3D的HTML元素</p>
            </div>
        `

        const object1Id = this.plugin.createCSS3DObject({
            component: div1,
            position: new THREE.Vector3(-2, 0, 0),
            rotation: new THREE.Euler(0, 0.2, 0)
        })

        // 示例2：创建表单元素
        const form = document.createElement('div')
        form.innerHTML = `
            <form style="
                width: 250px;
                padding: 20px;
                background: rgba(255,255,255,0.9);
                border-radius: 8px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            ">
                <h4 style="margin-top: 0; color: #333;">3D表单</h4>
                <input type="text" placeholder="用户名" style="width: 100%; margin: 5px 0; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                <input type="password" placeholder="密码" style="width: 100%; margin: 5px 0; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                <button type="button" style="width: 100%; padding: 10px; background: #4ecdc4; color: white; border: none; border-radius: 4px; cursor: pointer;">登录</button>
            </form>
        `

        const object2Id = this.plugin.createCSS3DObject({
            component: form,
            position: new THREE.Vector3(2, 0, 0),
            rotation: new THREE.Euler(0, -0.2, 0),
            scale: 0.8
        })

        // 演示动画效果
        setTimeout(() => {
            // 晃动第一个对象
            this.plugin.shake(object1Id, 0.1, 1000)
        }, 2000)

        setTimeout(() => {
            // 移动第二个对象
            this.plugin.animateToPosition(object2Id, new THREE.Vector3(2, 1, -1), 2000)
        }, 4000)

        // 添加交互事件
        this.addInteractionEvents(object1Id, object2Id)
    }

    private addInteractionEvents(object1Id: string, object2Id: string) {
        // 键盘控制示例
        window.addEventListener('keydown', (event) => {
            switch(event.key) {
                case '1':
                    // 重置第一个对象位置
                    this.plugin.setPosition(object1Id, new THREE.Vector3(-2, 0, 0))
                    break
                case '2':
                    // 重置第二个对象位置
                    this.plugin.setPosition(object2Id, new THREE.Vector3(2, 0, 0))
                    break
                case 's':
                    // 晃动效果
                    this.plugin.shake(object1Id, 0.2, 500)
                    this.plugin.shake(object2Id, 0.2, 500)
                    break
                case 'r':
                    // 旋转效果
                    const rotation1 = new THREE.Euler(
                        Math.random() * Math.PI * 2,
                        Math.random() * Math.PI * 2,
                        Math.random() * Math.PI * 2
                    )
                    const rotation2 = new THREE.Euler(
                        Math.random() * Math.PI * 2,
                        Math.random() * Math.PI * 2,
                        Math.random() * Math.PI * 2
                    )
                    this.plugin.setRotation(object1Id, rotation1)
                    this.plugin.setRotation(object2Id, rotation2)
                    break
            }
        })

        // 添加使用说明
        const instructions = document.createElement('div')
        instructions.style.cssText = `
            position: fixed;
            top: 10px;
            left: 10px;
            background: rgba(0,0,0,0.8);
            color: white;
            padding: 15px;
            border-radius: 5px;
            font-family: Arial;
            font-size: 14px;
            z-index: 1000;
        `
        instructions.innerHTML = `
            <h4 style="margin: 0 0 10px 0;">CSS3D插件操作说明:</h4>
            <p style="margin: 5px 0;">按键 1: 重置左侧对象位置</p>
            <p style="margin: 5px 0;">按键 2: 重置右侧对象位置</p>
            <p style="margin: 5px 0;">按键 S: 晃动效果</p>
            <p style="margin: 5px 0;">按键 R: 随机旋转</p>
        `
        document.body.appendChild(instructions)
    }

    private startRenderLoop() {
        const animate = () => {
            requestAnimationFrame(animate)
            
            // 自动旋转相机
            const time = Date.now() * 0.0005
            this.camera.position.x = Math.cos(time) * 8
            this.camera.position.z = Math.sin(time) * 8
            this.camera.lookAt(0, 0, 0)

            // 渲染CSS3D场景
            this.plugin.render(this.camera)
        }
        
        animate()
    }

    // 清理资源
    destroy() {
        this.plugin.stop()
        this.plugin.uninstall()
    }
}

// 自动启动示例（可选）
// const example = new CSS3DExample() 