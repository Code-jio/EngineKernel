import { THREE, BasePlugin } from "../basePlugin"
import { CSS3DRenderer, CSS3DObject, WebGLRenderer } from "../../utils/three-imports"
import eventBus from '../../eventBus/eventBus'

interface CSS3DConfig {
    element: HTMLElement | string
    position?: [number, number, number]
    rotation?: [number, number, number] 
    scale?: number
}

interface CSS3DItem {
    id: string
    object: CSS3DObject
    element: HTMLElement
}

// 

// CSS3D渲染插件 - 将HTML元素转为3D对象
export class CSS3DRenderPlugin extends BasePlugin {
    private css3Drenderer: CSS3DRenderer | null = null
    private renderer: WebGLRenderer | null = null
    private items: Map<string, CSS3DItem> = new Map()
    private nextId: number = 1
    private scene: THREE.Scene | null = null

    constructor(meta: any) {
        super(meta)
        this.renderer = meta.userData.renderer || null
        this.scene = meta.userData.scene || null
    }

    // 初始化渲染器
    async init(): Promise<void> {
        this.css3Drenderer = new CSS3DRenderer()
        this.css3Drenderer.setSize(window.innerWidth, window.innerHeight)
        this.css3Drenderer.domElement.style.position = 'absolute'
        this.css3Drenderer.domElement.style.top = '0'
        this.css3Drenderer.domElement.style.pointerEvents = 'none'
        
        // 添加到页面
        document.body.appendChild(this.css3Drenderer.domElement)
        
        // 监听窗口变化
        window.addEventListener('resize', this.onWindowResize.bind(this))
        
        this.status = 'loaded'
        console.log('CSS3D插件初始化完成')
    }

    /**
     * 创建CSS3D对象
     * 输入：vue组件以及相关配置参数
     * 输出：3D对象
     * @param config 配置参数
     * @returns 对象ID
     */
    createObject(config: CSS3DConfig): string {
        // 参数验证
        if (!config || !config.element) {
            throw new Error('配置参数无效：缺少element属性')
        }

        // 检查渲染器是否初始化
        if (!this.css3Drenderer) {
            throw new Error('CSS3D渲染器未初始化，请先调用init方法')
        }

        // 获取HTML元素
        const element = this.getElement(config.element)
        if (!element) {
            throw new Error(`无法找到HTML元素: ${config.element}`)
        }

        // 克隆元素避免DOM冲突
        const clonedElement = element.cloneNode(true) as HTMLElement
        
        // 创建CSS3D对象
        const css3dObject = new CSS3DObject(clonedElement)
        const id = `css3d_${this.nextId++}`

        // 设置默认样式确保可见性
        clonedElement.style.pointerEvents = 'auto'
        clonedElement.style.userSelect = 'none'

        // 应用变换参数
        this.applyTransforms(css3dObject, config)

        // 添加到场景（如果有renderer说明有scene）
        if (this.renderer) {
            // 这里可以添加到共享的scene中
        }

        // 保存对象引用
        const item: CSS3DItem = {
            id,
            object: css3dObject,
            element: clonedElement
        }
        this.items.set(id, item)

        // 发送创建事件
        eventBus.emit('css3d-created', { 
            id, 
            object: css3dObject, 
            element: clonedElement,
            config 
        })

        console.log(`CSS3D对象已创建: ${id}`)
        return id
    }

    // 私有方法：应用变换
    private applyTransforms(object: CSS3DObject, config: CSS3DConfig): void {
        // 设置位置
        if (config.position) {
            object.position.set(...config.position)
        }

        // 设置旋转
        if (config.rotation) {
            object.rotation.set(...config.rotation)
        }

        // 设置缩放
        if (config.scale) {
            object.scale.setScalar(config.scale)
        } else {
            // 默认缩放为1
            object.scale.setScalar(1)
        }

        // 确保对象可见
        object.visible = true
    }

    // 删除对象
    removeObject(id: string): boolean {
        const item = this.items.get(id)
        if (!item) return false

        // 清理DOM
        if (item.element.parentNode) {
            item.element.parentNode.removeChild(item.element)
        }

        this.items.delete(id)
        eventBus.emit('css3d-removed', { id })
        return true
    }

    // 移动对象
    moveObject(id: string, x: number, y: number, z: number): boolean {
        const item = this.items.get(id)
        if (!item) return false

        item.object.position.set(x, y, z)
        return true
    }

    // 旋转对象
    rotateObject(id: string, x: number, y: number, z: number): boolean {
        const item = this.items.get(id)
        if (!item) return false

        item.object.rotation.set(x, y, z)
        return true
    }

    // 缩放对象
    scaleObject(id: string, scale: number): boolean {
        const item = this.items.get(id)
        if (!item) return false

        item.object.scale.setScalar(scale)
        return true
    }

    // 动画移动
    animateMove(id: string, targetPos: [number, number, number], duration: number = 1000): Promise<boolean> {
        const item = this.items.get(id)
        if (!item) return Promise.resolve(false)

        const startPos = item.object.position.clone()
        const endPos = new THREE.Vector3(...targetPos)
        const startTime = Date.now()

        return new Promise((resolve) => {
            const animate = () => {
                const elapsed = Date.now() - startTime
                const progress = Math.min(elapsed / duration, 1)
                
                // 简单的缓动
                const ease = progress < 0.5 ? 2 * progress * progress : 1 - 2 * (1 - progress) * (1 - progress)
                
                item.object.position.lerpVectors(startPos, endPos, ease)

                if (progress >= 1) {
                    resolve(true)
                } else {
                    requestAnimationFrame(animate)
                }
            }
            animate()
        })
    }

    // 获取所有对象
    getAllObjects(): CSS3DItem[] {
        return Array.from(this.items.values())
    }

    // 获取渲染器
    getRenderer(): CSS3DRenderer | null {
        return this.css3Drenderer
    }

    // 渲染场景
    render(scene: THREE.Scene, camera: THREE.Camera): void {
        if (!this.renderer) return
        
        // 将所有CSS3D对象添加到场景中
        this.items.forEach(item => {
            if (!scene.children.includes(item.object)) {
                scene.add(item.object)
            }
        })

        this.renderer.render(scene, camera)
    }

    // 窗口大小变化
    private onWindowResize(): void {
        if (this.renderer) {
            this.renderer.setSize(window.innerWidth, window.innerHeight)
        }
    }

    // 获取HTML元素
    private getElement(element: HTMLElement | string): HTMLElement | null {
        if (typeof element === 'string') {
            return document.querySelector(element)
        }
        return element
    }

    // 卸载
    async unload(): Promise<void> {
        // 清理所有对象
        this.items.forEach((item, id) => {
            this.removeObject(id)
        })

        // 移除渲染器
        if (this.renderer && this.renderer.domElement.parentNode) {
            this.renderer.domElement.parentNode.removeChild(this.renderer.domElement)
        }

        // 移除事件监听
        window.removeEventListener('resize', this.onWindowResize)

        this.renderer = null
        this.items.clear()
        
        await super.unload()
        console.log('CSS3D插件已卸载')
    }
}
