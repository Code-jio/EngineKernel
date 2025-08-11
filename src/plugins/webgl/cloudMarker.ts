// 体积云标注核心类（精简版）
import { THREE } from "../basePlugin"
import { ImprovedNoise } from "three/examples/jsm/math/ImprovedNoise.js"
import * as TWEEN from "@tweenjs/tween.js"
interface CloudMarkerOptions {
    position: null | number[] | THREE.Vector3
    contour: THREE.Vector3[]
    height?: number
    color?: number // 云颜色
    threshold?: number // 密度阈值
    opacity?: number // 云透明度
    range?: number // 范围
    steps?: number // 渲染步数
}

/**
 * 云标注默认配置
 */
export const CloudMarkerDefaults = {
    color: 0x798aa0, // 天蓝色
    threshold: 0.25, // 密度阈值
    opacity: 0.25, // 云透明度
    range: 0.1, // 范围
    steps: 30, // 渲染步数
    position: [0, 0, 0],
    contour: [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(1, 1, 0),
        new THREE.Vector3(1, 0, 0),
    ],
} as const

/**
 * 体积云标注类 - 快速创建和管理云标注
 */
export class CloudMarker {
    private options: Required<CloudMarkerOptions>
    private group: THREE.Group
    private cloudMesh: THREE.Mesh
    private material: THREE.RawShaderMaterial | THREE.ShaderMaterial
    private animationTime: number = 0
    public texture: THREE.Texture = null!
    public geometry: THREE.ExtrudeGeometry | THREE.BoxGeometry = null!

    constructor(options: CloudMarkerOptions) {
        this.options = {
            color: CloudMarkerDefaults.color,
            opacity: CloudMarkerDefaults.opacity,
            threshold: CloudMarkerDefaults.threshold,
            height: 1,
            ...(options.contour ? { contour: options.contour } : { contour: CloudMarkerDefaults.contour }),
            range: CloudMarkerDefaults.range,
            steps: CloudMarkerDefaults.steps,
            ...options,
        }

        console.log(this.options.position, "this.options.position")

        this.validateOptions()
        this.group = new THREE.Group()

        if (this.options.position) {
            if (this.options.position instanceof THREE.Vector3) {
                this.group.position.set(this.options.position.x, this.options.position.y, this.options.position.z)
            } else {
                this.group.position.set(this.options.position[0], this.options.position[1], this.options.position[2])
            }
        }

        this.cloudMesh = this.createMesh()
        this.cloudMesh.renderOrder = 999
        this.material = this.cloudMesh.material as THREE.RawShaderMaterial
        this.group.add(this.cloudMesh)
        this.group.scale.set(100,100,100)
    }

    private validateOptions(): void {
        if (!this.options.position) {
            throw new Error("云标注需要位置")
        }
        if (this.options.height <= 0) {
            throw new Error("云层高度必须大于0")
        }
    }

    /**
     * 创建3D纹理
     * @returns 
     */
    private createTexture(): THREE.Data3DTexture {
        const size = 128 // 立方体的大小
        const data = new Uint8Array(size * size * size)

        let i = 0
        const scale = 0.05 // 降低scale值会产生更大的烟雾纹理
        const perlin = new ImprovedNoise()
        const vector = new THREE.Vector3()

        for (let z = 0; z < size; z++) {
            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    const d =
                        1.0 -
                        vector
                            .set(x, y, z)
                            .subScalar(size / 2)
                            .divideScalar(size)
                            .length()
                    data[i] = (128 + 128 * perlin.noise((x * scale) / 1.5, y * scale, (z * scale) / 1.5)) * d * d
                    i++
                }
            }
        }
        const texture = new THREE.Data3DTexture(data, size, size, size) // 创建3D纹理
        console.log(data, texture)
        texture.format = THREE.RedFormat
        texture.minFilter = THREE.LinearFilter
        texture.magFilter = THREE.LinearFilter
        texture.unpackAlignment = 2 // 纹理对齐方式设置为1，以确保正确处理单通道数据
        texture.needsUpdate = true

        this.texture = texture
        return this.texture as THREE.Data3DTexture
    }

    /**
     * 创建shader材质
     * @returns 
     */
    private createMaterial(): THREE.ShaderMaterial {
        // Material

        const vertexShader = /* glsl */ `
            // in vec3 position;

            // uniform mat4 modelMatrix;
            // uniform mat4 modelViewMatrix;
            // uniform mat4 projectionMatrix;
            uniform vec3 cameraPos;

            out vec3 vOrigin;
            out vec3 vDirection;

            void main() {
                vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );

                vOrigin = vec3( inverse( modelMatrix ) * vec4( cameraPos, 1.0 ) ).xyz;
                vDirection = position - vOrigin;

                gl_Position = projectionMatrix * mvPosition;
            }
        `

        const fragmentShader = /* glsl */ `
            precision highp float;
            precision highp sampler3D;

            in vec3 vOrigin;
            in vec3 vDirection;

            uniform sampler3D map;        // 3D 噪声纹理
            uniform float threshold;     // 密度阈值
            uniform float opacity;       // 单步不透明度
            uniform float steps;         // 步数控制

            out vec4 color;

            // 光线与立方体相交检测
            vec2 hitBox(vec3 orig, vec3 dir) {
                const vec3 box_min = vec3(-0.5);
                const vec3 box_max = vec3(0.5);
                vec3 inv_dir = 1.0 / dir;
                vec3 tmin = min((box_max - orig) * inv_dir, (box_min - orig) * inv_dir);
                vec3 tmax = max((box_max - orig) * inv_dir, (box_min - orig) * inv_dir);
                float t0 = max(tmin.x, max(tmin.y, tmin.z));
                float t1 = min(tmax.x, min(tmax.y, tmax.z));
                return vec2(t0, t1);
            }

            float sampleDensity(vec3 p) {
                return texture(map, p + 0.5).r;  // 转换到 [0,1] 纹理坐标
            }

            void main() {
                vec3 rayDir = normalize(vDirection);
                vec2 bounds = hitBox(vOrigin, rayDir);

                if (bounds.x > bounds.y) discard;
                bounds.x = max(bounds.x, 0.0);

                vec3 pos = vOrigin + bounds.x * rayDir;

                // 自适应步长
                vec3 inc = 1.0 / abs(rayDir);
                float delta = min(inc.x, min(inc.y, inc.z)) / steps;

                vec4 fragColor = vec4(0.0);  // 初始透明黑色

                for (float t = bounds.x; t < bounds.y; t += delta) {
                    float density = sampleDensity(pos);
                    float a = smoothstep(threshold - 0.1, threshold + 0.1, density) * opacity;

                    // 累积颜色和透明度（Premultiplied Alpha）
                    fragColor.rgb += (1.0 - fragColor.a) * a * vec3(0.8, 0.85, 0.9);  // 淡蓝白烟雾色
                    fragColor.a   += (1.0 - fragColor.a) * a;

                    if (fragColor.a > 0.95) break;  // 提前终止

                    pos += rayDir * delta;
                }

                if (fragColor.a == 0.0) discard;
                color = fragColor;
            }
        `

        const material = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3,
            uniforms: {
                base: { value: new THREE.Color(0x798aa0) },
                map: { value: this.createTexture() },
                cameraPos: { value: new THREE.Vector3() },
                threshold: { value: 0.25 }, // 进一步降低阈值，让更多的云雾可见
                opacity: { value: 0.25 }, // 降低不透明度使效果更加柔和
                range: { value: 0.1 }, // 增加范围，使云雾更加扩散
                steps: { value: 20 }, // 增加步数，提高渲染质量
                frame: { value: 0 },
            },
            vertexShader,
            fragmentShader,
            side: THREE.DoubleSide,
            transparent: true,

            depthWrite: false,  // 不写入深度缓冲
            depthTest: true,    // 但仍测试深度（可选，有时可设为 false）
            blending: THREE.NormalBlending, // 或其他 blending
            // renderOrder: 999,

        })
        
        console.log("material", material)

        this.material = material
        return this.material
    }

    private createMesh(): THREE.Mesh {
        
        // const geometry = this.createGeometry()
        this.geometry = new THREE.BoxGeometry(50, 50, 50)

        return new THREE.Mesh(this.geometry, this.createMaterial())
    }

    /**
     * 创建几何体、以ExtrudeGeometry创建
     */
    private createGeometry(): THREE.ExtrudeGeometry {
        // 修复：使用轮廓中心点作为参考，而不是最小Y值
        const contourYValues = this.options.contour.map(p => p.y)
        const avgY = contourYValues.reduce((sum, y) => sum + y, 0) / contourYValues.length

        // 计算轮廓的中心点（用于相对坐标转换）
        const centerX = this.options.contour.reduce((sum, p) => sum + p.x, 0) / this.options.contour.length
        const centerZ = this.options.contour.reduce((sum, p) => sum + p.z, 0) / this.options.contour.length

        const shape = new THREE.Shape()

        // 修复：转换为相对于中心点的本地坐标
        const firstPoint = this.options.contour[0]
        shape.moveTo(firstPoint.x - centerX, firstPoint.z - centerZ)

        // 添加其他轮廓点（相对坐标）
        for (let i = 1; i < this.options.contour.length; i++) {
            const point = this.options.contour[i]
            shape.lineTo(point.x - centerX, point.z - centerZ)
        }

        // 闭合路径
        shape.closePath()

        // 拉伸设置 - 沿Z轴拉伸
        const extrudeSettings = {
            depth: this.options.height,
            bevelEnabled: false,
            bevelSize: 0,
            bevelThickness: 0,
            bevelSegments: 0,
            steps: 1,
            curveSegments: 12,
        }

        // 使用ExtrudeGeometry创建几何体
        const extrudeGeometry = new THREE.ExtrudeGeometry(shape, extrudeSettings)

        // 修复：几何体变换顺序
        // 1. 先旋转使其在XZ平面上，沿Y轴向上拉伸
        extrudeGeometry.rotateX(-Math.PI / 2)

        // 2. 将几何体移动到正确的世界位置
        // 使用平均Y值作为基准高度，而不是最小值
        extrudeGeometry.translate(centerX, avgY, centerZ)

        console.log(`🔧 水体几何体创建完成: 轮廓点数=${this.options.contour.length}, 高度=${this.options.height}`)
        console.log(`📍 中心点: (${centerX.toFixed(2)}, ${avgY.toFixed(2)}, ${centerZ.toFixed(2)})`)

        return extrudeGeometry
    }

    public updateMaterial(camera: THREE.PerspectiveCamera): void {
        if (this.cloudMesh && this.cloudMesh.material) {
            const material = this.cloudMesh.material as THREE.RawShaderMaterial
            // material.uniforms.frame.value += 1
            material.uniforms.cameraPos.value.copy(camera.position)
        }
    }

    /**
     * 设置云标注颜色
     */
    public setColor(color: number): void {
        this.options.color = color
        this.material.uniforms.base.value.set(color)
    }

    /**
     * 设置不透明度
     */
    public setOpacity(opacity: number): void {
        this.options.opacity = Math.max(0.1, Math.min(1.0, opacity))
        this.material.uniforms.opacity.value = this.options.opacity
    }

    /**
     * 设置阈值
     */
    public setThreshold(threshold: number): void {
        this.options.threshold = Math.max(0.1, Math.min(1.0, threshold))
        this.material.uniforms.threshold.value = this.options.threshold
    }

    /**
     * 设置范围
     */
    public setRange(range: number): void {
        this.options.range = Math.max(0.1, Math.min(1.0, range))
        this.material.uniforms.range.value = this.options.range
    }

    /**
     * 设置渲染步数
     */
    public setSteps(steps: number): void {
        this.options.steps = Math.max(50, Math.min(200, Math.floor(steps)))
        this.material.uniforms.steps.value = this.options.steps
    }

    /**
     * 设置云标注位置
     */
    public setPosition(x: number, y: number, z: number): void {
        this.group.position.set(x, y, z)
    }

    /**
     * 设置可见性
     */
    public setVisible(visible: boolean): void {
        this.cloudMesh.visible = visible
    }

    /**
     * 获取场景组
     */
    public getGroup(): THREE.Group {
        return this.group
    }

    /**
     * 销毁资源
     */
    public dispose(): void {
        this.cloudMesh.geometry.dispose()
        this.material.uniforms.map.value.dispose()
        this.material.dispose()
    }

    /**
     * 使用tween动画平滑过渡到新的云参数
     * @param params 目标参数对象
     * @param duration 动画持续时间（毫秒）
     * @param easing 缓动函数
     * @returns Promise<Tween> 返回动画实例，可用于链式调用
     */
    public animateTo(
        params: {
            threshold?: number
            opacity?: number
            range?: number
            steps?: number
        },
        duration: number = 1000,
        easing: (k: number) => number = TWEEN.Easing.Quadratic.Out
    ): Promise<void> {
        return new Promise((resolve) => {
            const currentValues = {
                threshold: this.options.threshold,
                opacity: this.options.opacity,
                range: this.options.range,
                steps: this.options.steps,
            }

            const targetValues = {
                threshold: params.threshold ?? currentValues.threshold,
                opacity: params.opacity ?? currentValues.opacity,
                range: params.range ?? currentValues.range,
                steps: params.steps ?? currentValues.steps,
            }

            // 限制参数范围
            targetValues.threshold = Math.max(0.1, Math.min(1.0, targetValues.threshold))
            targetValues.opacity = Math.max(0.1, Math.min(1.0, targetValues.opacity))
            targetValues.range = Math.max(0.1, Math.min(1.0, targetValues.range))
            targetValues.steps = Math.max(50, Math.min(200, Math.floor(targetValues.steps)))

            const tween = new TWEEN.Tween(currentValues)
                .to(targetValues, duration)
                .easing(easing)
                .onUpdate(() => {
                    this.setThreshold(currentValues.threshold)
                    this.setOpacity(currentValues.opacity)
                    this.setRange(currentValues.range)
                    this.setSteps(currentValues.steps)
                })
                .onComplete(() => {
                    resolve()
                })
                .start()
        })
    }

    /**
     * 创建云参数动画序列
     * @param keyframes 关键帧数组
     * @returns Promise<void>
     */
    public animateSequence(
        keyframes: Array<{
            threshold?: number
            opacity?: number
            range?: number
            steps?: number
            duration: number
            easing?: (k: number) => number
        }>
    ): Promise<void> {
        return new Promise((resolve) => {
            let chain = Promise.resolve()
            
            keyframes.forEach((keyframe, index) => {
                chain = chain.then(() => 
                    this.animateTo(
                        keyframe,
                        keyframe.duration,
                        keyframe.easing || TWEEN.Easing.Quadratic.Out
                    )
                )
            })
            
            chain.then(() => resolve())
        })
    }

    /**
     * 停止当前正在进行的动画
     */
    public stopAnimation(): void {
        // 由于TWEEN需要全局管理，这里提供一个方法来停止特定实例的动画
        // 实际使用时可能需要在外部管理TWEEN实例
    }

    /**
     * 获取当前云参数
     */
    public getCurrentParams(): {
        threshold: number
        opacity: number
        range: number
        steps: number
    } {
        return {
            threshold: this.options.threshold,
            opacity: this.options.opacity,
            range: this.options.range,
            steps: this.options.steps,
        }
    }
}
