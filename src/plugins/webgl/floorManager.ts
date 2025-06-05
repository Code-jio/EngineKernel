import { THREE } from "../basePlugin"

/**
 * 地板配置接口
 */
export interface FloorConfig {
    enabled: boolean           // 是否启用地板
    type: 'water' | 'static' | 'reflection' | 'grid' | 'glow' | 'infinite' | 'none'  // 地板类型
    size: number              // 地板大小
    position: [number, number, number]  // 地板位置
    
    // 水面地板配置
    waterConfig?: {
        color: number              // 水面颜色 
        sunColor: number           // 太阳光颜色
        distortionScale: number    // 扭曲比例
        textureWidth: number       // 反射贴图宽度
        textureHeight: number      // 反射贴图高度
        alpha: number              // 透明度
        time: number               // 时间参数
        waterNormalsUrl?: string  // 水面法线贴图URL
    }
    
    // 静态贴图地板配置
    staticConfig?: {
        texture?: string           // 主贴图路径
        normalMap?: string         // 法线贴图路径
        roughnessMap?: string      // 粗糙度贴图路径
        metallicMap?: string       // 金属度贴图路径
        color: number              // 基础颜色
        opacity: number            // 不透明度
        tiling: [number, number]   // 贴图平铺
        roughness: number          // 粗糙度
        metalness: number          // 金属度
    }
    
    // 反射地板配置
    reflectionConfig?: {
        reflectivity: number       // 反射强度
        color: number              // 基础颜色
        roughness: number          // 粗糙度
        metalness: number          // 金属度
        mixStrength: number        // 混合强度
    }
    
    // 网格地板配置
    gridConfig?: {
        gridSize: number           // 网格间距
        lineWidth: number          // 线条宽度
        primaryColor: number       // 主网格颜色
        secondaryColor: number     // 次网格颜色
        opacity: number            // 透明度
        divisions: number          // 细分数量
    }
    
    // 发光地板配置
    glowConfig?: {
        color: number              // 发光颜色
        intensity: number          // 发光强度
        emissiveColor: number      // 自发光颜色
        emissiveIntensity: number  // 自发光强度
        pulseSpeed: number         // 脉冲速度
    }
    
    // 无限地板配置
    infiniteConfig?: {
        followCamera: boolean      // 是否跟随相机
        updateDistance: number     // 更新距离阈值
        gridSize: number           // 网格大小
        fadeDistance: number       // 淡入淡出距离
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
        
        if (!config.enabled || config.type === 'none') {
            return
        }
        
        switch (config.type) {
            case 'water': // 水面
                this.floor = this.createWaterFloor(config, renderer)
                break
            case 'static': // 静态
                this.floor = this.createStaticFloor(config)
                break
            case 'reflection': // 反射
                this.floor = this.createReflectionFloor(config, renderer)
                break
            case 'grid': // 网格
                this.floor = this.createGridFloor(config)
                break
            case 'glow': // 发光
                this.floor = this.createGlowFloor(config)
                break
            case 'infinite': // 无限
                this.floor = this.createInfiniteFloor(config)
                break
            default:
                console.warn(`未知的地板类型: ${config.type}`)
                return
        }
        
        if (this.floor) {
            this.floor.position.set(...config.position)
            this.floor.receiveShadow = true
            this.scene.add(this.floor)
            console.log(`✅ ${config.type}地板已创建`)
        }
    }
    
    /**
     * 创建水面地板
     */
    private createWaterFloor(config: FloorConfig, renderer: THREE.WebGLRenderer): THREE.Mesh {
        const waterConfig = config.waterConfig || {
            color: 0x001e0f,
            sunColor: 0xffffff,
            distortionScale: 3.7,
            textureWidth: 512,
            textureHeight: 512,
            alpha: 1.0,
            time: 0,
            waterNormalsUrl:"./textures/waternormals.jpg"
        }
        const geometry = new THREE.PlaneGeometry(config.size, config.size, 512, 512)
        
        // 创建水面法线贴图
        const textureLoader = new THREE.TextureLoader()
        let waterNormals: THREE.Texture | null = null
        
        if (waterConfig.waterNormalsUrl) {
            waterNormals = textureLoader.load(waterConfig.waterNormalsUrl, (texture) => {
                texture.wrapS = texture.wrapT = THREE.RepeatWrapping
            })
        } else {
            // 生成程序化法线贴图
            waterNormals = this.generateProceduralWaterNormals()
        }
        
        // 创建反射渲染目标
        this.reflectionRenderTarget = new THREE.WebGLRenderTarget(
            waterConfig.textureWidth,
            waterConfig.textureHeight,
            {
                format: THREE.RGBFormat,
                generateMipmaps: true,
                minFilter: THREE.LinearMipmapLinearFilter,
            }
        )
        
        // 水面shader材质
        const waterMaterial = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: waterConfig.time },
                size: { value: 1.0 },
                distortionScale: { value: waterConfig.distortionScale },
                textureMatrix: { value: new THREE.Matrix4() },
                sunColor: { value: new THREE.Color(waterConfig.sunColor) },
                waterColor: { value: new THREE.Color(waterConfig.color) },
                sunDirection: { value: new THREE.Vector3(0.70707, 0.70707, 0) },
                alpha: { value: waterConfig.alpha },
                waterNormals: { value: waterNormals }
            },
            vertexShader: this.getWaterVertexShader(),
            fragmentShader: this.getWaterFragmentShader(),
            transparent: true,
            side: THREE.DoubleSide
        })
        
        this.waterUniforms = waterMaterial.uniforms
        
        const mesh = new THREE.Mesh(geometry, waterMaterial)
        mesh.rotation.x = -Math.PI / 2
        
        return mesh
    }
    
    /**
     * 生成程序化水面法线贴图
     */
    private generateProceduralWaterNormals(): THREE.Texture {
        const size = 512
        const data = new Uint8Array(size * size * 3)
        
        for (let i = 0; i < size; i++) {
            for (let j = 0; j < size; j++) {
                const x = (i / size) * 2 - 1
                const y = (j / size) * 2 - 1
                
                // 生成简单的波浪法线
                const wave1 = Math.sin(x * 10) * Math.cos(y * 10) * 0.3
                const wave2 = Math.sin(x * 15 + Math.PI / 3) * Math.cos(y * 15 + Math.PI / 4) * 0.2
                const wave3 = Math.sin(x * 20 + Math.PI / 2) * Math.cos(y * 20 + Math.PI / 6) * 0.1
                
                const height = wave1 + wave2 + wave3
                
                // 计算法线向量
                const normal = new THREE.Vector3(0, 1, 0)
                normal.x = -height * 0.5
                normal.z = -height * 0.5
                normal.normalize()
                
                // 转换到0-255范围
                const index = (i * size + j) * 3
                data[index] = Math.floor((normal.x * 0.5 + 0.5) * 255)
                data[index + 1] = Math.floor((normal.y * 0.5 + 0.5) * 255)
                data[index + 2] = Math.floor((normal.z * 0.5 + 0.5) * 255)
            }
        }
        
        const texture = new THREE.DataTexture(data, size, size, THREE.RGBFormat)
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping
        texture.needsUpdate = true
        
        return texture
    }

    /**
     * 水面顶点着色器
     */
    private getWaterVertexShader(): string {
        return `
            uniform mat4 textureMatrix;
            uniform float time;
            uniform float size;
            
            varying vec4 vUv;
            varying vec3 vNormal;
            varying vec3 vViewDirection;
            
            void main() {
                vUv = textureMatrix * vec4(position, 1.0);
                
                vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                vViewDirection = normalize(cameraPosition - worldPosition.xyz);
                vNormal = normalize(normalMatrix * normal);
                
                // 添加波浪顶点位移
                vec3 newPosition = position;
                newPosition.z += sin(position.x * 0.1 + time * 2.0) * 0.5;
                newPosition.z += sin(position.y * 0.1 + time * 1.5) * 0.3;
                
                gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
            }
        `
    }

    /**
     * 水面片段着色器
     */
    private getWaterFragmentShader(): string {
        return `
            uniform vec3 sunColor;
            uniform vec3 waterColor;
            uniform vec3 sunDirection;
            uniform float distortionScale;
            uniform float alpha;
            uniform float time;
            uniform sampler2D waterNormals;
            
            varying vec4 vUv;
            varying vec3 vNormal;
            varying vec3 vViewDirection;
            
            vec3 gerstnerWave(vec2 direction, float amplitude, float frequency, float speed, vec2 position, float time, inout vec3 tangent, inout vec3 binormal) {
                float phase = speed * frequency;
                float cosineWave = cos(dot(direction, position) * frequency + time * phase);
                float sineWave = sin(dot(direction, position) * frequency + time * phase);
                
                vec3 displacement = vec3(
                    direction.x * amplitude * cosineWave,
                    amplitude * sineWave,
                    direction.y * amplitude * cosineWave
                );
                
                return displacement;
            }
            
            void main() {
                vec2 distortedUv = vUv.xy / vUv.w;
                
                // 采样法线贴图
                vec2 normalUv = distortedUv * 4.0 + time * 0.1;
                vec3 normalColor1 = texture2D(waterNormals, normalUv).xyz * 2.0 - 1.0;
                vec3 normalColor2 = texture2D(waterNormals, normalUv * 0.5 + time * 0.05).xyz * 2.0 - 1.0;
                
                vec3 normal = normalize(normalColor1 + normalColor2);
                
                // 菲涅尔反射
                float fresnel = pow(1.0 - max(dot(vViewDirection, normal), 0.0), 2.0);
                
                // 太阳光反射
                vec3 reflectDirection = reflect(-sunDirection, normal);
                float sunReflection = pow(max(dot(vViewDirection, reflectDirection), 0.0), 64.0);
                
                // 混合颜色
                vec3 finalColor = mix(waterColor, sunColor, fresnel * 0.3);
                finalColor += sunColor * sunReflection * 0.5;
                
                gl_FragColor = vec4(finalColor, alpha);
            }
        `
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
            tiling: [1, 1] as [number, number]
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
        
        return mesh
    }

    // 其他地板类型创建方法的简化版本
    private createReflectionFloor(config: FloorConfig, renderer: THREE.WebGLRenderer): THREE.Mesh {
        const geometry = new THREE.PlaneGeometry(config.size, config.size)
        const material = new THREE.MeshStandardMaterial({ 
            color: 0x808080, 
            roughness: 0.1, 
            metalness: 0.9 
        })
        const mesh = new THREE.Mesh(geometry, material)
        mesh.rotation.x = -Math.PI / 2
        return mesh
    }

    private createGridFloor(config: FloorConfig): THREE.Mesh {
        const geometry = new THREE.PlaneGeometry(config.size, config.size)
        const material = new THREE.MeshBasicMaterial({ 
            color: 0x444444, 
            wireframe: true, 
            transparent: true, 
            opacity: 0.3 
        })
        const mesh = new THREE.Mesh(geometry, material)
        mesh.rotation.x = -Math.PI / 2
        return mesh
    }

    private createGlowFloor(config: FloorConfig): THREE.Mesh {
        const geometry = new THREE.PlaneGeometry(config.size, config.size)
        const material = new THREE.MeshBasicMaterial({ 
            color: 0x0088ff, 
            transparent: true, 
            opacity: 0.5 
        })
        const mesh = new THREE.Mesh(geometry, material)
        mesh.rotation.x = -Math.PI / 2
        return mesh
    }

    private createInfiniteFloor(config: FloorConfig): THREE.Mesh {
        const geometry = new THREE.PlaneGeometry(config.size, config.size)
        const material = new THREE.MeshBasicMaterial({ 
            color: 0x333333, 
            wireframe: true, 
            transparent: true, 
            opacity: 0.2 
        })
        const mesh = new THREE.Mesh(geometry, material)
        mesh.rotation.x = -Math.PI / 2
        return mesh
    }
    
    /**
     * 更新地板动画
     */
    public updateFloor(deltaTime: number, camera?: THREE.Camera): void {
        if (!this.floor) return
        
        this.animationTime += deltaTime
        
        // 更新水面动画
        if (this.waterUniforms) {
            this.waterUniforms.time.value = this.animationTime * 0.001
        }
    }
    
    /**
     * 更新反射
     */
    public updateReflection(camera: THREE.Camera, renderer: THREE.WebGLRenderer): void {
        if (!this.reflectionRenderTarget || !this.reflectionCamera || !this.floor) return
        
        // 设置反射相机
        this.reflectionCamera.position.copy(camera.position)
        this.reflectionCamera.rotation.copy(camera.rotation)
        this.reflectionCamera.position.y = -this.reflectionCamera.position.y + 2 * this.floor.position.y
        this.reflectionCamera.rotation.x = -this.reflectionCamera.rotation.x
        
        // 渲染反射
        const currentRenderTarget = renderer.getRenderTarget()
        renderer.setRenderTarget(this.reflectionRenderTarget)
        renderer.render(this.scene, this.reflectionCamera)
        renderer.setRenderTarget(currentRenderTarget)
    }
    
    /**
     * 移除地板
     */
    public removeFloor(): void {
        if (this.floor) {
            this.scene.remove(this.floor)
            
            // 清理材质和几何体
            if (this.floor.material instanceof THREE.Material) {
                this.floor.material.dispose()
            } else if (Array.isArray(this.floor.material)) {
                this.floor.material.forEach(material => material.dispose())
            }
            this.floor.geometry.dispose()
            
            this.floor = null
            this.waterUniforms = null
        }
        
        // 清理反射相关资源
        if (this.reflectionRenderTarget) {
            this.reflectionRenderTarget.dispose()
            this.reflectionRenderTarget = null
        }
        this.reflectionCamera = null
    }
    
    /**
     * 切换地板类型
     */
    public switchFloorType(type: FloorConfig['type'], config: FloorConfig, renderer: THREE.WebGLRenderer): void {
        config.type = type
        this.createFloor(config, renderer)
    }
    
    /**
     * 获取地板信息
     */
    public getFloorInfo(): any {
        if (!this.floor) return null
        
        const materialType = Array.isArray(this.floor.material) 
            ? this.floor.material[0]?.type || 'array' 
            : this.floor.material.type;
        
        return {
            type: this.floor.userData.type || 'unknown',
            position: this.floor.position.toArray(),
            visible: this.floor.visible,
            material: materialType,
            geometry: this.floor.geometry.type,
            vertexCount: this.floor.geometry.attributes.position?.count || 0
        }
    }
    
    /**
     * 销毁管理器
     */
    public destroy(): void {
        this.removeFloor()
    }
} 