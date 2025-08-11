import { THREE } from "../basePlugin"
import { Water } from "../../utils/three-imports"

/**
 * 地板配置接口
 */
export interface FloorConfig {
    enabled: boolean // 是否启用地板
    type: "water" | "static" | "reflection" | "grid" | "glow" | "infinite" | "none" // 地板类型
    size: number // 地板大小
    position: [number, number, number] // 地板位置

    // 水面地板配置 - 简化版本，只保留基本水面效果
    waterConfig?: {
        // 基础参数
        textureWidth?: number // 反射贴图宽度
        textureHeight?: number // 反射贴图高度
        alpha?: number // 透明度
        time?: number // 初始时间

        // 视觉效果参数
        waterColor?: number // 水面颜色
        color?: number // 兼容性颜色属性（等同于waterColor）
        sunColor?: number // 太阳光颜色
        distortionScale?: number // 扭曲比例

        // 贴图
        waterNormalsUrl?: string // 水面法线贴图URL

        // 动画控制
        animationSpeed?: number // 动画速度倍数
        waveScale?: number // 波浪缩放系数
    }

    // 静态贴图地板配置
    staticConfig?: {
        texture?: string // 主贴图路径
        normalMap?: string // 法线贴图路径
        roughnessMap?: string // 粗糙度贴图路径
        metallicMap?: string // 金属度贴图路径
        color: number // 基础颜色
        opacity: number // 不透明度
        tiling: [number, number] // 贴图平铺
        roughness: number // 粗糙度
        metalness: number // 金属度
    }

    // 反射地板配置
    reflectionConfig?: {
        reflectivity: number // 反射强度
        color: number // 基础颜色
        roughness: number // 粗糙度
        metalness: number // 金属度
        mixStrength: number // 混合强度
    }

    // 网格地板配置
    gridConfig?: {
        gridSize: number // 网格间距
        lineWidth: number // 线条宽度
        primaryColor: number // 主网格颜色
        secondaryColor: number // 次网格颜色
        opacity: number // 透明度
        divisions: number // 细分数量
    }

    // 发光地板配置
    glowConfig?: {
        color: number // 发光颜色
        intensity: number // 发光强度
        emissiveColor: number // 自发光颜色
        emissiveIntensity: number // 自发光强度
        pulseSpeed: number // 脉冲速度
    }

    // 无限地板配置
    infiniteConfig?: {
        followCamera: boolean // 是否跟随相机
        updateDistance: number // 更新距离阈值
        gridSize: number // 网格大小
        fadeDistance: number // 淡入淡出距离
    }
}

/**
 * 地板管理器类 - 负责所有地板类型的创建、更新和管理
 */
export class FloorManager {
    private scene: THREE.Scene
    private floor: THREE.Mesh | null = null
    private waterUniforms: any = null
    private reflectionRenderTarget: THREE.WebGLRenderTarget | null = null
    private reflectionCamera: THREE.Camera | null = null
    private lastCameraPosition: THREE.Vector3 = new THREE.Vector3()
    private animationTime: number = 0

    constructor(scene: THREE.Scene) {
        this.scene = scene
    }

    /**
     * 创建地板
     */
    public createFloor(config: FloorConfig, renderer: THREE.WebGLRenderer): void {
        this.removeFloor()

        if (!config.enabled || config.type === "none") {
            return
        }

        switch (config.type) {
            case "water": // 水面
                this.floor = this.createWaterFloor(config, renderer)
                break
            case "static": // 静态
                this.floor = this.createStaticFloor(config)
                break
            case "reflection": // 反射
                this.floor = this.createReflectionFloor(config, renderer)
                break
            case "grid": // 网格
                this.floor = this.createGridFloor(config)
                break
            case "glow": // 发光
                this.floor = this.createGlowFloor(config)
                break
            case "infinite": // 无限
                this.floor = this.createInfiniteFloor(config)
                break
            default:
                console.warn(`未知的地板类型: ${config.type}`)
                return
        }

        if (this.floor) {
            this.floor.position.set(...config.position)
            this.floor.receiveShadow = true
            this.floor.renderOrder = 0 // 设置地板渲染顺序为0
            this.scene.add(this.floor)
            console.log(`✅ ${config.type}地板已创建，renderOrder设置为0`)
        }
    }

    /**
     * 创建水面地板
     */
    private createWaterFloor(config: FloorConfig, renderer: THREE.WebGLRenderer): THREE.Mesh {
        // 获取水面配置，提供默认值
        const waterConfig = config.waterConfig || {
            textureWidth: 512,
            textureHeight: 512,
            alpha: 0, // 调整默认透明度为0.8，更自然的半透明效果
            time: 0,
            waterColor: 0x001e0f,
            distortionScale: 3.7,
            waterNormalsUrl: "textures/waternormals.jpg",
            animationSpeed: 1.0,
            waveScale: 1.0,
        }

        // 处理color属性的兼容性（如果设置了color，使用color覆盖waterColor）
        const finalWaterColor = waterConfig.color !== undefined ? waterConfig.color : waterConfig.waterColor || 0x001e0f

        // 处理sunColor属性（如果未设置，使用默认白色）
        const finalSunColor = waterConfig.sunColor !== undefined ? waterConfig.sunColor : 0xffffff

        // 处理其他可选属性的默认值
        const finalTextureWidth = waterConfig.textureWidth || 512
        const finalTextureHeight = waterConfig.textureHeight || 512
        // const finalAlpha = waterConfig.alpha !== undefined ? waterConfig.alpha : 0
        const finalDistortionScale = waterConfig.distortionScale !== undefined ? waterConfig.distortionScale : 3.7

        // 创建水面几何体
        const waterGeometry = new THREE.PlaneGeometry(config.size, config.size)

        // 创建水面
        const water = new Water(waterGeometry, {
            textureWidth: finalTextureWidth,
            textureHeight: finalTextureHeight,
            waterNormals: new THREE.TextureLoader().load(
                waterConfig.waterNormalsUrl || "textures/waternormals.jpg",
                function (texture) {
                    texture.wrapS = texture.wrapT = THREE.RepeatWrapping
                },
            ),
            sunDirection: new THREE.Vector3(),
            sunColor: finalSunColor,
            waterColor: finalWaterColor,
            distortionScale: finalDistortionScale,
            fog: this.scene.fog !== undefined,
        })

        // 设置水面旋转，使其水平放置
        water.rotation.x = -Math.PI / 2
        water.name = "waterFloor"

        water.renderOrder = 1

        // 保存水面的 uniforms 用于动画更新
        this.waterUniforms = water.material.uniforms

        // 设置初始时间
        if (this.waterUniforms.time) {
            this.waterUniforms.time.value = waterConfig.time || 0
        }

        water.material.transparent = true
        water.material.depthWrite = true 

        return water
    }

    /**
     * 创建静态贴图地板
     */
    private createStaticFloor(config: FloorConfig): THREE.Mesh {
        const staticConfig = config.staticConfig || {
            color: 0x808080,
            opacity: 1.0,
            roughness: 0.8,
            metalness: 0.2,
            tiling: [1, 1] as [number, number],
        }
        const geometry = new THREE.PlaneGeometry(config.size, config.size)

        const material = new THREE.MeshStandardMaterial({
            color: staticConfig.color,
            opacity: staticConfig.opacity,
            transparent: staticConfig.opacity < 1.0,
            roughness: staticConfig.roughness,
            metalness: staticConfig.metalness,
        })

        // 加载贴图
        if (staticConfig.texture || staticConfig.normalMap || staticConfig.roughnessMap || staticConfig.metallicMap) {
            const textureLoader = new THREE.TextureLoader()

            if (staticConfig.texture) {
                material.map = textureLoader.load(staticConfig.texture)
                if (staticConfig.tiling) {
                    material.map.repeat.set(...staticConfig.tiling)
                    material.map.wrapS = material.map.wrapT = THREE.RepeatWrapping
                }
            }

            if (staticConfig.normalMap) {
                material.normalMap = textureLoader.load(staticConfig.normalMap)
                if (staticConfig.tiling && material.normalMap) {
                    material.normalMap.repeat.set(...staticConfig.tiling)
                    material.normalMap.wrapS = material.normalMap.wrapT = THREE.RepeatWrapping
                }
            }

            if (staticConfig.roughnessMap) {
                material.roughnessMap = textureLoader.load(staticConfig.roughnessMap)
                if (staticConfig.tiling && material.roughnessMap) {
                    material.roughnessMap.repeat.set(...staticConfig.tiling)
                    material.roughnessMap.wrapS = material.roughnessMap.wrapT = THREE.RepeatWrapping
                }
            }

            if (staticConfig.metallicMap) {
                material.metalnessMap = textureLoader.load(staticConfig.metallicMap)
                if (staticConfig.tiling && material.metalnessMap) {
                    material.metalnessMap.repeat.set(...staticConfig.tiling)
                    material.metalnessMap.wrapS = material.metalnessMap.wrapT = THREE.RepeatWrapping
                }
            }
        }

        const mesh = new THREE.Mesh(geometry, material)
        mesh.rotation.x = -Math.PI / 2
        mesh.name = "ground"

        return mesh
    }

    // 其他地板类型创建方法的简化版本
    private createReflectionFloor(config: FloorConfig, renderer: THREE.WebGLRenderer): THREE.Mesh {
        const geometry = new THREE.PlaneGeometry(config.size, config.size)
        const material = new THREE.MeshStandardMaterial({
            color: 0x808080,
            roughness: 0.1,
            metalness: 0.9,
        })
        const mesh = new THREE.Mesh(geometry, material)
        mesh.rotation.x = -Math.PI / 2
        mesh.name = "ground"
        return mesh
    }

    private createGridFloor(config: FloorConfig): THREE.Mesh {
        const geometry = new THREE.PlaneGeometry(config.size, config.size)
        const material = new THREE.MeshBasicMaterial({
            color: 0x444444,
            wireframe: true,
            transparent: true,
            opacity: 0.3,
        })
        const mesh = new THREE.Mesh(geometry, material)
        mesh.rotation.x = -Math.PI / 2
        mesh.name = "ground"
        return mesh
    }

    private createGlowFloor(config: FloorConfig): THREE.Mesh {
        const geometry = new THREE.PlaneGeometry(config.size, config.size)
        const material = new THREE.MeshBasicMaterial({
            color: 0x0088ff,
            transparent: true,
            opacity: 0.5,
        })
        const mesh = new THREE.Mesh(geometry, material)
        mesh.rotation.x = -Math.PI / 2
        mesh.name = "ground"
        return mesh
    }

    private createInfiniteFloor(config: FloorConfig): THREE.Mesh {
        const geometry = new THREE.PlaneGeometry(config.size, config.size)
        const material = new THREE.MeshBasicMaterial({
            color: 0x333333,
            wireframe: true,
            transparent: true,
            opacity: 0.2,
        })
        const mesh = new THREE.Mesh(geometry, material)
        mesh.rotation.x = -Math.PI / 2
        mesh.name = "ground"
        return mesh
    }

    /**
     * 更新地板动画
     */
    public updateFloor(deltaTime: number, camera?: THREE.Camera): void {
        if (!this.floor) return

        // 更新水面动画 - 参考THREE.js官方示例，使用60fps固定增量
        if (this.waterUniforms) {
            // 使用固定的时间增量来保持一致的动画速度
            this.waterUniforms.time.value += 1.0 / 60.0

            // 更新相机位置（用于水面效果计算）
            if (camera && this.waterUniforms.eye) {
                this.waterUniforms.eye.value.setFromMatrixPosition(camera.matrixWorld)
            }

            // 更新太阳方向（用于水面反射效果）
            if (this.waterUniforms.sunDirection) {
                // 设置一个默认的太阳方向，可以根据需要调整
                const sunDirection = new THREE.Vector3(1, 1, 0).normalize()
                this.waterUniforms.sunDirection.value.copy(sunDirection)
            }
        }
    }

    /**
     * 更新反射
     */
    public updateReflection(camera: THREE.Camera, renderer: THREE.WebGLRenderer): void {
        if (!this.reflectionRenderTarget || !this.reflectionCamera || !this.floor) {
            return
        }

        // 只有当相机位置发生显著变化时才更新反射
        const currentPosition = camera.position.clone()
        if (this.lastCameraPosition.distanceTo(currentPosition) < 0.1) {
            return // 相机移动距离太小，跳过更新以提高性能
        }
        this.lastCameraPosition.copy(currentPosition)

        // 设置反射相机 - 创建水面镜像
        const floorY = this.floor.position.y

        // 复制相机的基本属性
        this.reflectionCamera.position.copy(camera.position)
        this.reflectionCamera.rotation.copy(camera.rotation)

        // 如果是透视相机，同步FOV和aspect
        if (camera instanceof THREE.PerspectiveCamera && this.reflectionCamera instanceof THREE.PerspectiveCamera) {
            this.reflectionCamera.fov = camera.fov
            this.reflectionCamera.aspect = camera.aspect
            this.reflectionCamera.near = camera.near
            this.reflectionCamera.far = camera.far
        }

        // 镜像变换：将相机位置和旋转沿Y轴镜像
        this.reflectionCamera.position.y = 2 * floorY - camera.position.y
        this.reflectionCamera.rotation.x = -camera.rotation.x
        this.reflectionCamera.rotation.z = -camera.rotation.z

        // 更新投影矩阵
        if (this.reflectionCamera instanceof THREE.PerspectiveCamera) {
            this.reflectionCamera.updateProjectionMatrix()
        } else if (this.reflectionCamera instanceof THREE.OrthographicCamera) {
            this.reflectionCamera.updateProjectionMatrix()
        }

        // 暂时隐藏水面，避免无限反射
        this.floor.visible = false

        // 渲染反射场景
        const currentRenderTarget = renderer.getRenderTarget()
        const currentXrEnabled = renderer.xr.enabled
        const currentShadowAutoUpdate = renderer.shadowMap.autoUpdate

        try {
            renderer.xr.enabled = false
            renderer.shadowMap.autoUpdate = false
            renderer.setRenderTarget(this.reflectionRenderTarget)
            renderer.render(this.scene, this.reflectionCamera)
        } catch (error) {
            console.warn("⚠️ 水面反射渲染出错:", error)
        } finally {
            // 恢复原始设置
            renderer.setRenderTarget(currentRenderTarget)
            renderer.xr.enabled = currentXrEnabled
            renderer.shadowMap.autoUpdate = currentShadowAutoUpdate
            this.floor.visible = true
        }

        // 更新水面材质的textureMatrix
        if (this.waterUniforms && this.waterUniforms.textureMatrix) {
            const textureMatrix = this.waterUniforms.textureMatrix.value
            textureMatrix.set(0.5, 0.0, 0.0, 0.5, 0.0, 0.5, 0.0, 0.5, 0.0, 0.0, 0.5, 0.5, 0.0, 0.0, 0.0, 1.0)
            textureMatrix.multiply(this.reflectionCamera.projectionMatrix)
            textureMatrix.multiply(this.reflectionCamera.matrixWorldInverse)
        }
    }

    /**
     * 移除地板
     */
    public removeFloor(): void {
        if (this.floor) {
            this.scene.remove(this.floor)

            // 清理材质和几何体
            if (this.floor.material instanceof THREE.Material) {
                // 清理材质中的贴图 - 使用类型检查
                const material = this.floor.material as any
                if (material.map) material.map.dispose()
                if (material.normalMap) material.normalMap.dispose()
                if (material.roughnessMap) material.roughnessMap.dispose()
                if (material.metalnessMap) material.metalnessMap.dispose()

                this.floor.material.dispose()
            } else if (Array.isArray(this.floor.material)) {
                this.floor.material.forEach(material => {
                    // 清理每个材质的贴图 - 使用类型检查
                    const mat = material as any
                    if (mat.map) mat.map.dispose()
                    if (mat.normalMap) mat.normalMap.dispose()
                    if (mat.roughnessMap) mat.roughnessMap.dispose()
                    if (mat.metalnessMap) mat.metalnessMap.dispose()

                    material.dispose()
                })
            }
            this.floor.geometry.dispose()

            this.floor = null
            this.waterUniforms = null
            console.log("🗑️ 地板已移除，资源已清理")
        }

        // 清理反射相关资源
        if (this.reflectionRenderTarget) {
            this.reflectionRenderTarget.dispose()
            this.reflectionRenderTarget = null
        }
        this.reflectionCamera = null
        this.lastCameraPosition.set(0, 0, 0)
    }

    /**
     * 切换地板类型
     */
    public switchFloorType(type: FloorConfig["type"], config: FloorConfig, renderer: THREE.WebGLRenderer): void {
        config.type = type
        this.createFloor(config, renderer)
    }

    /**
     * 获取地板信息
     */
    public getFloorInfo(): any {
        if (!this.floor) return null

        const materialType = Array.isArray(this.floor.material)
            ? this.floor.material[0]?.type || "array"
            : this.floor.material.type

        return {
            type: this.floor.userData.type || "unknown",
            position: this.floor.position.toArray(),
            visible: this.floor.visible,
            material: materialType,
            geometry: this.floor.geometry.type,
            vertexCount: this.floor.geometry.attributes.position?.count || 0,
        }
    }

    /**
     * 销毁管理器
     */
    public destroy(): void {
        this.removeFloor()
    }
}
