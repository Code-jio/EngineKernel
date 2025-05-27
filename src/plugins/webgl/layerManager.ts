import { THREE, BasePlugin } from "../basePlugin"
import eventBus from "../../eventBus/eventBus"

// 预定义图层类型
export enum LayerType {
    BASE_SCENE = 'baseScene',           // 基础场景图层
    BASE_MODEL = 'baseModel',           // 基础模型图层
    MODEL_ANNOTATION = 'modelAnnotation', // 模型标注图层
    SPRITE = 'sprite',                  // 精灵图层
    CSS3D = 'css3d',                   // CSS3D图层
    IMAGE_ANNOTATION = 'imageAnnotation', // 图片标注图层
    CUSTOM = 'custom'                   // 自定义图层
}

// 图层配置接口
interface LayerConfig {
    id: string
    name: string
    type: LayerType
    visible?: boolean
    renderOrder?: number
    opacity?: number
    parent?: string | null
    metadata?: { [key: string]: any }
}

// 图层数据结构
interface Layer {
    id: string
    name: string
    type: LayerType
    group: THREE.Group
    visible: boolean
    renderOrder: number
    opacity: number
    parent: string | null
    children: Set<string>
    metadata: { [key: string]: any }
    created: number
    updated: number
}

// 图层事件类型
interface LayerEvents {
    'layer:created': { layer: Layer }
    'layer:deleted': { layerId: string }
    'layer:visibility-changed': { layerId: string, visible: boolean }
    'layer:order-changed': { layerId: string, oldOrder: number, newOrder: number }
    'layer:opacity-changed': { layerId: string, opacity: number }
    'layer:object-added': { layerId: string, object: THREE.Object3D }
    'layer:object-removed': { layerId: string, object: THREE.Object3D }
    'layers:reordered': { layers: string[] }
}

// 默认图层配置
const DEFAULT_LAYERS: Omit<LayerConfig, 'id'>[] = [
    {
        name: '基础场景',
        type: LayerType.BASE_SCENE,
        renderOrder: 0,
        visible: true,
        opacity: 1.0,
        metadata: { description: '天空盒、地面、环境等基础场景元素' }
    },
    {
        name: '基础模型',
        type: LayerType.BASE_MODEL,
        renderOrder: 100,
        visible: true,
        opacity: 1.0,
        metadata: { description: '室内外模型等基础几何体' }
    },
    {
        name: '模型标注',
        type: LayerType.MODEL_ANNOTATION,
        renderOrder: 200,
        visible: true,
        opacity: 1.0,
        metadata: { description: '3D模型形式的标注和标记' }
    },
    {
        name: '精灵图层',
        type: LayerType.SPRITE,
        renderOrder: 300,
        visible: true,
        opacity: 1.0,
        metadata: { description: '2D精灵图和始终面向相机的元素' }
    },
    {
        name: 'CSS3D图层',
        type: LayerType.CSS3D,
        renderOrder: 400,
        visible: true,
        opacity: 1.0,
        metadata: { description: 'HTML元素转换为3D空间的对象' }
    },
    {
        name: '图片标注',
        type: LayerType.IMAGE_ANNOTATION,
        renderOrder: 500,
        visible: true,
        opacity: 1.0,
        metadata: { description: '图片形式的标注和信息面板' }
    }
]

export class LayerManager extends BasePlugin {
    private layers: Map<string, Layer> = new Map()
    private scene: THREE.Scene | null = null
    private layerOrder: string[] = []
    
    constructor(meta: any) {
        super(meta)
        
        // 监听场景就绪事件
        eventBus.on('scene-ready', this.onSceneReady.bind(this))
        console.log('🎭 LayerManager初始化完成')
    }

    /**
     * 场景就绪时的回调
     */
    private onSceneReady(data: { scene: THREE.Scene, camera: THREE.Camera, renderer: THREE.WebGLRenderer }) {
        this.scene = data.scene
        this.initializeDefaultLayers()
        console.log('🎭 LayerManager已连接到场景，默认图层已创建')
    }

    /**
     * 初始化默认图层
     */
    private initializeDefaultLayers(): void {
        if (!this.scene) {
            console.warn('⚠️ 场景未就绪，无法创建默认图层')
            return
        }

        DEFAULT_LAYERS.forEach((config, index) => {
            const layerId = `default_${config.type}_${index}`
            this.createLayer({
                id: layerId,
                ...config
            })
        })

        console.log(`✅ 已创建 ${DEFAULT_LAYERS.length} 个默认图层`)
    }

    /**
     * 创建新图层
     */
    public createLayer(config: LayerConfig): Layer | null {
        try {
            // 验证配置
            if (!config.id || !config.name || !config.type) {
                throw new Error('图层配置无效：id、name、type为必填项')
            }

            if (this.layers.has(config.id)) {
                throw new Error(`图层ID "${config.id}" 已存在`)
            }

            // 验证父图层
            if (config.parent && !this.layers.has(config.parent)) {
                throw new Error(`父图层 "${config.parent}" 不存在`)
            }

            // 创建THREE.Group
            const group = new THREE.Group()
            group.name = config.name
            group.visible = config.visible !== false
            group.renderOrder = config.renderOrder || 0
            
            // 设置透明度
            if (config.opacity !== undefined && config.opacity < 1) {
                group.traverse((child) => {
                    if (child instanceof THREE.Mesh && child.material) {
                        const material = Array.isArray(child.material) ? child.material : [child.material]
                        material.forEach(mat => {
                            mat.transparent = true
                            mat.opacity = config.opacity!
                        })
                    }
                })
            }

            // 创建图层对象
            const layer: Layer = {
                id: config.id,
                name: config.name,
                type: config.type,
                group: group,
                visible: config.visible !== false,
                renderOrder: config.renderOrder || 0,
                opacity: config.opacity || 1.0,
                parent: config.parent || null,
                children: new Set(),
                metadata: config.metadata || {},
                created: Date.now(),
                updated: Date.now()
            }

            // 添加到场景
            if (config.parent) {
                const parentLayer = this.layers.get(config.parent)
                if (parentLayer) {
                    parentLayer.group.add(group)
                    parentLayer.children.add(config.id)
                }
            } else if (this.scene) {
                this.scene.add(group)
            }

            // 存储图层
            this.layers.set(config.id, layer)
            this.layerOrder.push(config.id)
            
            // 触发事件
            eventBus.emit('layer:created', { layer })
            
            console.log(`✅ 图层 "${config.name}" (${config.id}) 创建成功`)
            return layer

        } catch (error: any) {
            console.error('❌ 创建图层失败:', error.message)
            return null
        }
    }

    /**
     * 删除图层
     */
    public deleteLayer(layerId: string): boolean {
        try {
            const layer = this.layers.get(layerId)
            if (!layer) {
                throw new Error(`图层 "${layerId}" 不存在`)
            }

            // 递归删除子图层
            const childrenToDelete = Array.from(layer.children)
            childrenToDelete.forEach(childId => {
                this.deleteLayer(childId)
            })

            // 从父图层移除
            if (layer.parent) {
                const parentLayer = this.layers.get(layer.parent)
                if (parentLayer) {
                    parentLayer.children.delete(layerId)
                    parentLayer.group.remove(layer.group)
                }
            } else if (this.scene) {
                this.scene.remove(layer.group)
            }

            // 清理THREE对象
            this.disposeLayerObjects(layer.group)

            // 从管理器移除
            this.layers.delete(layerId)
            const orderIndex = this.layerOrder.indexOf(layerId)
            if (orderIndex > -1) {
                this.layerOrder.splice(orderIndex, 1)
            }

            // 触发事件
            eventBus.emit('layer:deleted', { layerId })
            
            console.log(`✅ 图层 "${layer.name}" (${layerId}) 已删除`)
            return true

        } catch (error: any) {
            console.error('❌ 删除图层失败:', error.message)
            return false
        }
    }

    /**
     * 清理图层中的THREE对象
     */
    private disposeLayerObjects(group: THREE.Group): void {
        group.traverse((object) => {
            if (object instanceof THREE.Mesh) {
                if (object.geometry) {
                    object.geometry.dispose()
                }
                if (object.material) {
                    const materials = Array.isArray(object.material) ? object.material : [object.material]
                    materials.forEach(material => {
                        if (material.map) material.map.dispose()
                        if (material.normalMap) material.normalMap.dispose()
                        if (material.envMap) material.envMap.dispose()
                        material.dispose()
                    })
                }
            }
        })
    }

    /**
     * 显示/隐藏图层
     */
    public setLayerVisibility(layerId: string, visible: boolean): boolean {
        try {
            const layer = this.layers.get(layerId)
            if (!layer) {
                throw new Error(`图层 "${layerId}" 不存在`)
            }

            layer.visible = visible
            layer.group.visible = visible
            layer.updated = Date.now()

            // 触发事件
            eventBus.emit('layer:visibility-changed', { layerId, visible })
            
            console.log(`✅ 图层 "${layer.name}" ${visible ? '已显示' : '已隐藏'}`)
            return true

        } catch (error: any) {
            console.error('❌ 设置图层可见性失败:', error.message)
            return false
        }
    }

    /**
     * 设置图层透明度
     */
    public setLayerOpacity(layerId: string, opacity: number): boolean {
        try {
            const layer = this.layers.get(layerId)
            if (!layer) {
                throw new Error(`图层 "${layerId}" 不存在`)
            }

            if (opacity < 0 || opacity > 1) {
                throw new Error('透明度值必须在0-1之间')
            }

            layer.opacity = opacity
            layer.updated = Date.now()

            // 更新图层中所有材质的透明度
            layer.group.traverse((child) => {
                if (child instanceof THREE.Mesh && child.material) {
                    const materials = Array.isArray(child.material) ? child.material : [child.material]
                    materials.forEach(material => {
                        material.transparent = opacity < 1
                        material.opacity = opacity
                    })
                }
            })

            // 触发事件
            eventBus.emit('layer:opacity-changed', { layerId, opacity })
            
            console.log(`✅ 图层 "${layer.name}" 透明度设置为 ${opacity}`)
            return true

        } catch (error: any) {
            console.error('❌ 设置图层透明度失败:', error.message)
            return false
        }
    }

    /**
     * 设置图层渲染顺序
     */
    public setLayerRenderOrder(layerId: string, renderOrder: number): boolean {
        try {
            const layer = this.layers.get(layerId)
            if (!layer) {
                throw new Error(`图层 "${layerId}" 不存在`)
            }

            const oldOrder = layer.renderOrder
            layer.renderOrder = renderOrder
            layer.group.renderOrder = renderOrder
            layer.updated = Date.now()

            // 触发事件
            eventBus.emit('layer:order-changed', { layerId, oldOrder, newOrder: renderOrder })
            
            console.log(`✅ 图层 "${layer.name}" 渲染顺序设置为 ${renderOrder}`)
            return true

        } catch (error: any) {
            console.error('❌ 设置图层渲染顺序失败:', error.message)
            return false
        }
    }

    /**
     * 调整图层在列表中的位置
     */
    public moveLayer(layerId: string, newIndex: number): boolean {
        try {
            const currentIndex = this.layerOrder.indexOf(layerId)
            if (currentIndex === -1) {
                throw new Error(`图层 "${layerId}" 不存在`)
            }

            if (newIndex < 0 || newIndex >= this.layerOrder.length) {
                throw new Error('新位置超出范围')
            }

            if (currentIndex === newIndex) {
                return true // 位置相同，无需移动
            }

            // 移动图层
            this.layerOrder.splice(currentIndex, 1)
            this.layerOrder.splice(newIndex, 0, layerId)

            // 触发事件
            eventBus.emit('layers:reordered', { layers: [...this.layerOrder] })
            
            const layer = this.layers.get(layerId)
            console.log(`✅ 图层 "${layer?.name}" 移动到位置 ${newIndex}`)
            return true

        } catch (error: any) {
            console.error('❌ 移动图层失败:', error.message)
            return false
        }
    }

    /**
     * 向图层添加对象
     */
    public addToLayer(layerId: string, object: THREE.Object3D): boolean {
        try {
            const layer = this.layers.get(layerId)
            if (!layer) {
                throw new Error(`图层 "${layerId}" 不存在`)
            }

            layer.group.add(object)
            layer.updated = Date.now()

            // 触发事件
            eventBus.emit('layer:object-added', { layerId, object })
            
            console.log(`✅ 对象已添加到图层 "${layer.name}"`)
            return true

        } catch (error: any) {
            console.error('❌ 添加对象到图层失败:', error.message)
            return false
        }
    }

    /**
     * 从图层移除对象
     */
    public removeFromLayer(layerId: string, object: THREE.Object3D): boolean {
        try {
            const layer = this.layers.get(layerId)
            if (!layer) {
                throw new Error(`图层 "${layerId}" 不存在`)
            }

            layer.group.remove(object)
            layer.updated = Date.now()

            // 触发事件
            eventBus.emit('layer:object-removed', { layerId, object })
            
            console.log(`✅ 对象已从图层 "${layer.name}" 移除`)
            return true

        } catch (error: any) {
            console.error('❌ 从图层移除对象失败:', error.message)
            return false
        }
    }

    /**
     * 获取图层信息
     */
    public getLayer(layerId: string): Layer | null {
        return this.layers.get(layerId) || null
    }

    /**
     * 获取所有图层
     */
    public getAllLayers(): Layer[] {
        return Array.from(this.layers.values())
    }

    /**
     * 根据类型获取图层
     */
    public getLayersByType(type: LayerType): Layer[] {
        return Array.from(this.layers.values()).filter(layer => layer.type === type)
    }

    /**
     * 获取图层顺序
     */
    public getLayerOrder(): string[] {
        return [...this.layerOrder]
    }

    /**
     * 根据名称查找图层
     */
    public findLayersByName(name: string): Layer[] {
        return Array.from(this.layers.values()).filter(layer => 
            layer.name.toLowerCase().includes(name.toLowerCase())
        )
    }

    /**
     * 获取图层统计信息
     */
    public getLayerStats(): any {
        const stats = {
            totalLayers: this.layers.size,
            visibleLayers: 0,
            layersByType: {} as { [key: string]: number },
            totalObjects: 0
        }

        this.layers.forEach(layer => {
            if (layer.visible) stats.visibleLayers++
            
            stats.layersByType[layer.type] = (stats.layersByType[layer.type] || 0) + 1
            
            // 计算图层中的对象数量
            layer.group.traverse(() => {
                stats.totalObjects++
            })
        })

        return stats
    }

    /**
     * 批量操作：显示指定类型的所有图层
     */
    public showLayersByType(type: LayerType): void {
        this.getLayersByType(type).forEach(layer => {
            this.setLayerVisibility(layer.id, true)
        })
    }

    /**
     * 批量操作：隐藏指定类型的所有图层
     */
    public hideLayersByType(type: LayerType): void {
        this.getLayersByType(type).forEach(layer => {
            this.setLayerVisibility(layer.id, false)
        })
    }

    /**
     * 获取默认图层ID（按类型）
     */
    public getDefaultLayerId(type: LayerType): string | null {
        const layer = this.getLayersByType(type).find(l => l.id.startsWith('default_'))
        return layer ? layer.id : null
    }

    /**
     * 快捷方法：添加对象到默认图层
     */
    public addToDefaultLayer(type: LayerType, object: THREE.Object3D): boolean {
        const layerId = this.getDefaultLayerId(type)
        if (layerId) {
            return this.addToLayer(layerId, object)
        } else {
            console.warn(`⚠️ 找不到类型为 ${type} 的默认图层`)
            return false
        }
    }

    /**
     * 导出图层配置
     */
    public exportLayerConfig(): any {
        const config = {
            version: '1.0',
            created: Date.now(),
            layers: [] as any[]
        }

        this.layerOrder.forEach(layerId => {
            const layer = this.layers.get(layerId)
            if (layer) {
                config.layers.push({
                    id: layer.id,
                    name: layer.name,
                    type: layer.type,
                    visible: layer.visible,
                    renderOrder: layer.renderOrder,
                    opacity: layer.opacity,
                    parent: layer.parent,
                    metadata: layer.metadata
                })
            }
        })

        return config
    }

    /**
     * 导入图层配置
     */
    public importLayerConfig(config: any): boolean {
        try {
            if (!config.layers || !Array.isArray(config.layers)) {
                throw new Error('无效的图层配置格式')
            }

            // 清除现有图层（除了默认图层）
            const layersToDelete = Array.from(this.layers.keys()).filter(id => !id.startsWith('default_'))
            layersToDelete.forEach(layerId => {
                this.deleteLayer(layerId)
            })

            // 创建导入的图层
            config.layers.forEach((layerConfig: any) => {
                if (!layerConfig.id.startsWith('default_')) {
                    this.createLayer(layerConfig)
                }
            })

            console.log(`✅ 成功导入 ${config.layers.length} 个图层配置`)
            return true

        } catch (error: any) {
            console.error('❌ 导入图层配置失败:', error.message)
            return false
        }
    }

    /**
     * 销毁图层管理器
     */
    public destroy(): void {
        // 删除所有图层
        const layersToDelete = Array.from(this.layers.keys())
        layersToDelete.forEach(layerId => {
            this.deleteLayer(layerId)
        })

        // 清理引用
        this.layers.clear()
        this.layerOrder = []
        this.scene = null

        // 移除事件监听
        eventBus.off('scene-ready', this.onSceneReady.bind(this))

        console.log('🧹 LayerManager已销毁')
    }

    /**
     * 更新方法（预留给父类调用）
     */
    public update(): void {
        // 图层管理器通常不需要每帧更新
        // 这里可以添加一些定期维护逻辑
    }
}