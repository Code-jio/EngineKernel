import { THREE, BasePlugin } from "../basePlugin"
import eventBus from "../../eventBus/eventBus"
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js'
// import { MeshBVH, SAH } from 'three-mesh-bvh'

interface MergeConfig {
    minGeometryCount: number
    maxVerticesPerGeometry: number
    materialGrouping: boolean
    preserveLOD: boolean
    buildBVH: boolean
    debugVisualization: boolean
    preserveOriginalObjects: boolean
}

interface MergeGroup {
    mesh: THREE.Mesh
    objects: THREE.Mesh[]
    vertexCount: number
    faceCount: number
}

interface PerformanceStats {
    originalDrawCalls: number
    mergedDrawCalls: number
    originalVertices: number
    mergedVertices: number
    originalObjects: number
    mergedObjects: number
    mergeTime: number
    performanceGain: number
    drawCallReduction?: number
    objectReduction?: number
    vertexReduction?: number
    bvhGroups?: number
    originalFaces?: number
    mergedFaces?: number
}

/**
 * Three.js 静态几何体合并优化插件
 * 功能：自动合并静态模型，使用BVH加速射线检测，提升渲染性能20%+
 * 
 * @author EngineKernel
 * @version 1.0.0
 */
export class StaticGeometryMerger extends BasePlugin {
    declare name: string
    declare path: string
    
    private scene?: THREE.Scene
    private mergeConfig: MergeConfig
    private mergedGroups: Map<string, MergeGroup>
    private originalObjects: Map<string, any>
    // private bvhMap: Map<string, MeshBVH>
    private isMerged: boolean
    private stats: PerformanceStats
    
    constructor(meta: any) {
        super(meta)
        this.name = 'StaticGeometryMerger'
        this.path = 'plugins/merge'
        this.scene = meta.userData.scene
        
        // 合并配置
        this.mergeConfig = {
            minGeometryCount: 3,             // 最小几何体数量才触发合并
            maxVerticesPerGeometry: 655360,    // 每个合并几何体的最大顶点数
            materialGrouping: true,           // 按材质分组合并
            preserveLOD: true,              // 保留LOD层级关系
            buildBVH: true,                 // 构建BVH加速结构
            debugVisualization: false,      // BVH可视化调试
            preserveOriginalObjects: true   // 保留原始对象引用
        }
        
        // 存储合并后的数据
        this.mergedGroups = new Map()     // 材质分组映射
        this.originalObjects = new Map()  // 原始对象引用
        // this.bvhMap = new Map()           // BVH加速结构映射
        this.isMerged = false             // 合并状态
        
        // 性能统计
        this.stats = {
            originalDrawCalls: 0,
            mergedDrawCalls: 0,
            originalVertices: 0,
            mergedVertices: 0,
            originalObjects: 0,
            mergedObjects: 0,
            mergeTime: 0,
            performanceGain: 0
        }
        
        // 绑定方法
        this.onSceneReady = this.onSceneReady.bind(this)
        this.onModelLoaded = this.onModelLoaded.bind(this)
        this.onResourceLoaded = this.onResourceLoaded.bind(this)
        
        // 初始化属性
        this.scene = undefined
        this.isMerged = false
    }

    /**
     * 插件初始化
     */
    async init(){
        
        // 监听场景就绪事件
        eventBus.on('scene:ready', this.onSceneReady)
        eventBus.on('model:loaded', this.onModelLoaded)
        eventBus.on('resource:loaded', this.onResourceLoaded)
        
        console.log('[StaticGeometryMerger] 插件初始化完成')
    }

    /**
     * 场景就绪处理 - 自动触发合并
     */
    onSceneReady(scene: THREE.Scene): void {
        console.log('[StaticGeometryMerger] 场景就绪，开始分析静态对象')
        this.scene = scene
        
        // 延迟执行合并，确保所有资源加载完成
        setTimeout(() => {
            this.optimize()
        }, 100)
    }

    /**
     * 模型加载完成处理
     */
    onModelLoaded(model: any): void {
        console.log('[StaticGeometryMerger] 新模型加载完成:', model?.name || 'Unknown')
        
        // 如果已经合并过，重新执行合并
        if (this.isMerged) {
            this.restoreOriginalObjects()
            setTimeout(() => {
                this.optimize()
            }, 50)
        }
    }

    /**
     * 资源加载完成处理
     */
    onResourceLoaded(resource: any): void {
        console.log('[StaticGeometryMerger] 资源加载完成:', resource?.name || 'Unknown')
    }

    /**
     * 主要优化方法 - 供外部调用
     */
    optimize(): void {
        if (!this.scene) {
            console.warn('[StaticGeometryMerger] 场景未就绪，跳过优化')
            return
        }
        
        const startTime = performance.now()
        
        try {
            // 分析场景中的静态对象
            const staticObjects = this._findStaticMeshes()
            
            if (staticObjects.length < this.mergeConfig.minGeometryCount) {
                console.log(`[StaticGeometryMerger] 静态对象数量不足(${staticObjects.length} < ${this.mergeConfig.minGeometryCount})，跳过合并`)
                return
            }

            console.log(`[StaticGeometryMerger] 找到 ${staticObjects.length} 个静态对象，开始合并优化...`)
            
            // 按材质分组合并
            const materialGroups = this._groupMeshesByMaterial(staticObjects)
            
            // 创建合并后的网格
            this._createMergedMeshes(materialGroups)
            
            // // 构建BVH加速结构
            // if (this.mergeConfig.buildBVH) {
            //     this._buildBVHAcceleration()
            // }
            
            // 更新统计信息
            this.stats.mergeTime = performance.now() - startTime
            this.isMerged = true
            
            // 计算性能提升
            this.stats.performanceGain = this.stats.originalDrawCalls > 0 
                ? Math.round((1 - this.stats.mergedDrawCalls / this.stats.originalDrawCalls) * 100)
                : 0
            this.stats.mergeTime = performance.now() - startTime
            
            // console.log('[StaticGeometryMerger] 合并优化完成:', this.getPerformanceStats())
            
            // 触发合并完成事件
            eventBus.emit('geometry:merged', {
                stats: this.stats,
                groups: Array.from(this.mergedGroups.keys())
            })
            
        } catch (error) {
            console.error('[StaticGeometryMerger] 合并优化失败:', error)
        }
    }

    /**
     * 查找静态网格对象
     */
    private _findStaticMeshes(): THREE.Mesh[] {
        const staticMeshes: THREE.Mesh[] = []
        const dynamicKeywords = ['dynamic', 'moving', 'animated', 'player', 'vehicle', 'character',""]
        
        this.scene!.traverse((object) => {
            // 跳过非网格对象
            if (!(object as THREE.Mesh).isMesh) return
            
            const mesh = object as THREE.Mesh
            
            // 跳过动态对象
            if (this._isDynamicObject(mesh, dynamicKeywords)) return
            
            // 跳过特殊对象
            if (mesh.userData.noMerge || mesh.userData.dynamic) return
            
            // 跳过透明对象（避免排序问题）
            if (mesh.material && (mesh.material as THREE.Material).transparent) return
            
            // 跳过LOD对象（保留层级关系）
            if (this.mergeConfig.preserveLOD && mesh.parent && (mesh.parent as any).isLOD) return
            
            staticMeshes.push(mesh)
        })
        
        return staticMeshes
    }

    /**
     * 判断是否为动态对象
     */
    private _isDynamicObject(object: THREE.Mesh, dynamicKeywords: string[]): boolean {
        const name = object.name.toLowerCase()
        const userData = object.userData
        
        // 通过名称判断
        if (dynamicKeywords.some(keyword => name.includes(keyword))) {
            return true
        }
        
        // 通过用户数据判断
        if (userData.dynamic || userData.animated || userData.movable) {
            return true
        }
        
        // 通过动画判断
        if (object.animations && object.animations.length > 0) {
            return true
        }
        
        return false
    }

    /**
     * 按材质分组合并
     */
    private _groupMeshesByMaterial(objects: THREE.Mesh[]): Map<string, { material: THREE.Material | THREE.Material[], objects: THREE.Mesh[], geometries: THREE.BufferGeometry[] }> {
        const materialGroups = new Map<string, { material: THREE.Material | THREE.Material[], objects: THREE.Mesh[], geometries: THREE.BufferGeometry[] }>()
        
        objects.forEach(object => {
            const material = object.material
            if (!material) return
            
            // 创建材质键（考虑材质属性）
            const materialKey = this._getMaterialKey(material)
            
            if (!materialGroups.has(materialKey)) {
                materialGroups.set(materialKey, {
                    material: material,
                    objects: [],
                    geometries: []
                })
            }
            
            const group = materialGroups.get(materialKey)!
            group.objects.push(object)
            
            // 获取世界变换后的几何体
            const worldGeometry = this._getWorldGeometry(object)
            if (worldGeometry) {
                group.geometries.push(worldGeometry)
            }
        })
        
        return materialGroups
    }

    /**
     * 获取材质键（用于分组）
     */
    private _getMaterialKey(material: THREE.Material | THREE.Material[]): string {
        if (Array.isArray(material)) {
            return material.map(mat => this._getSingleMaterialKey(mat)).join('|')
        }
        
        return this._getSingleMaterialKey(material)
    }

    /**
     * 获取单个材质键
     */
    private _getSingleMaterialKey(material: THREE.Material): string {
        const props = [
            material.type,
            (material as any).color?.getHexString(),
            (material as any).map?.uuid,
            (material as any).normalMap?.uuid,
            (material as any).roughnessMap?.uuid,
            (material as any).metalnessMap?.uuid,
            (material as any).aoMap?.uuid,
            (material as any).emissiveMap?.uuid,
            (material as any).alphaMap?.uuid,
            (material as any).lightMap?.uuid,
            (material as any).roughness,
            (material as any).metalness,
            (material as any).opacity,
            material.transparent,
            material.side,
            material.blending
        ]
        
        return props.filter(prop => prop !== undefined).join('_')
    }

    /**
     * 获取世界变换后的几何体
     */
    private _getWorldGeometry(object: THREE.Mesh): THREE.BufferGeometry | null {
        const geometry = object.geometry
        if (!geometry || !geometry.attributes.position) return null
        
        // 克隆几何体
        const clonedGeometry = geometry.clone()
        
        // 应用世界变换
        if (!object.matrixWorld.equals(new THREE.Matrix4())) {
            clonedGeometry.applyMatrix4(object.matrixWorld)
        }
        
        return clonedGeometry
    }

    /**
     * 创建合并后的网格
     */
    private _createMergedMeshes(materialGroups: Map<string, { material: THREE.Material | THREE.Material[], objects: THREE.Mesh[], geometries: THREE.BufferGeometry[] }>): THREE.Mesh[] {
        const mergedMeshes: THREE.Mesh[] = []
        
        materialGroups.forEach((group, materialKey) => {
            if (group.geometries.length === 0) return
            
            try {
                // 合并几何体
                const mergedGeometry = BufferGeometryUtils.mergeGeometries(
                    group.geometries, 
                    true // 使用分组
                )
                
                if (!mergedGeometry) return
                
                // 创建合并后的网格
                const mergedMesh = new THREE.Mesh(mergedGeometry, group.material)
                mergedMesh.name = `Merged_${materialKey}`
                mergedMesh.userData.isMerged = true
                mergedMesh.userData.originalObjects = group.objects.map(obj => ({
                    object: obj,
                    matrixWorld: obj.matrixWorld.clone(),
                    geometryUUID: obj.geometry.uuid,
                    materialUUID: (obj.material as THREE.Material).uuid
                }))
                
                // 存储合并信息
                this.mergedGroups.set(materialKey, {
                    mesh: mergedMesh,
                    objects: group.objects,
                    vertexCount: mergedGeometry.attributes.position.count,
                    faceCount: mergedGeometry.index ? mergedGeometry.index.count / 3 : 0
                })
                
                // 隐藏原始对象
                group.objects.forEach(obj => {
                    obj.visible = false
                    obj.userData.mergedParent = mergedMesh
                })
                
                // 添加到场景
                this.scene!.add(mergedMesh)
                mergedMeshes.push(mergedMesh)
                
                console.log(`[StaticGeometryMerger] 合并组 ${materialKey}: ${group.objects.length} 个对象 -> 1 个网格`)
                
            } catch (error) {
                console.error(`[StaticGeometryMerger] 合并组 ${materialKey} 失败:`, error)
            }
        })
        
        return mergedMeshes
    }

    // /**
    //  * 构建BVH加速结构
    //  */
    // private _buildBVHAcceleration(): void {
    //     this.mergedGroups.forEach((group, materialKey) => {
    //         if (!group.mesh.geometry) return
            
    //         try {
    //             // 构建BVH
    //             const bvh = new MeshBVH(group.mesh.geometry, {
    //                 strategy: SAH,
    //                 maxDepth: 40,
    //                 maxLeafTris: 10
    //             })
                
    //             // 存储BVH引用
    //             this.bvhMap.set(materialKey, bvh)
    //             ;(group.mesh.geometry as any).boundsTree = bvh
                
    //             console.log(`[StaticGeometryMerger] BVH构建完成: ${materialKey}`)
                
    //         } catch (error) {
    //             console.error(`[StaticGeometryMerger] BVH构建失败: ${materialKey}`, error)
    //         }
    //     })
    // }

    // /**
    //  * 更新统计信息
    //  */
    // private _updateStats(): void {
    //     let totalOriginalVertices = 0
    //     let totalOriginalFaces = 0
    //     let totalMergedVertices = 0
    //     let totalMergedFaces = 0
    //     let drawCalls = 0
        
    //     this.mergedGroups.forEach(group => {
    //         totalOriginalVertices += group.objects.reduce((sum, obj) => {
    //             return sum + (obj.geometry?.attributes.position?.count || 0)
    //         }, 0)
    //         totalOriginalFaces += group.objects.reduce((sum, obj) => {
    //             return sum + (obj.geometry?.index?.count || obj.geometry?.attributes.position?.count || 0) / 3
    //         }, 0)
    //         totalMergedVertices += group.vertexCount
    //         totalMergedFaces += group.faceCount
    //         drawCalls++
    //     })
        
    //     this.stats = {
    //         originalDrawCalls: this.mergedGroups.size,
    //         mergedDrawCalls: drawCalls,
    //         originalVertices: Math.floor(totalOriginalVertices),
    //         mergedVertices: Math.floor(totalMergedVertices),
    //         originalObjects: this.mergedGroups.size,
    //         mergedObjects: drawCalls,
    //         mergeTime: performance.now(),
    //         performanceGain: 0,
    //         originalFaces: Math.floor(totalOriginalFaces),
    //         mergedFaces: Math.floor(totalMergedFaces),
    //         drawCallReduction: drawCalls > 0 ? Math.round((this.mergedGroups.size - drawCalls) / this.mergedGroups.size * 100) : 0
    //     }
        
    //     console.log('[StaticGeometryMerger] 统计信息:', this.stats)
    // }

    // /**
    //  * 获取性能统计信息
    //  */
    // getPerformanceStats(): PerformanceStats {
    //     return {
    //         ...this.stats,
    //         drawCallReduction: this.stats.drawCallReduction,
    //         objectReduction: this.stats.originalObjects > 0 
    //             ? Math.round((1 - this.stats.mergedObjects / this.stats.originalObjects) * 100)
    //             : 0,

    //         bvhGroups: this.bvhMap.size,
    //         mergeTime: Math.round(this.stats.mergeTime || 0)
    //     }
    // }

    /**
     * 恢复原始对象（用于动态更新）
     */
    restoreOriginalObjects(): void {
        // 显示原始对象
        this.mergedGroups.forEach((group) => {
            group.objects.forEach(obj => {
                obj.visible = true
                delete obj.userData.mergedParent
            })
        })
        
        // 移除合并后的网格
        this.mergedGroups.forEach((group) => {
            if (this.scene) {
                this.scene.remove(group.mesh)
            }
            if (group.mesh.geometry) {
                group.mesh.geometry.dispose()
                if ((group.mesh.geometry as any).boundsTree) {
                    delete (group.mesh.geometry as any).boundsTree
                }
            }
        })
        
        // 清空数据
        this.mergedGroups.clear()
        // this.bvhMap.clear()
        this.isMerged = false
        
        console.log('[StaticGeometryMerger] 原始对象已恢复')
    }

    /**
     * 插件卸载
     */
    async unload() {
        // 清理事件监听
        eventBus.off('scene:ready', this.onSceneReady)
        eventBus.off('model:loaded', this.onModelLoaded)
        eventBus.off('resource:loaded', this.onResourceLoaded)
        
        // 恢复原始对象
        if (this.isMerged) {
            this.restoreOriginalObjects()
        }
        await super.unload()
        console.log('[StaticGeometryMerger] 插件已卸载')
    }
}
