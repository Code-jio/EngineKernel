import { THREE, BasePlugin } from "../basePlugin"
import {
    EffectComposer,
    RenderPass,
    ShaderPass,
    FXAAShader,
    OutputPass,
    UnrealBloomPass,
    SSAOPass,
    SSAARenderPass,
    SSRPass,
    ReflectorForSSRPass,
} from "../../utils/three-imports"
import eventBus from "../../eventBus/eventBus"

export class PostProcessingPlugin extends BasePlugin {
    composer: EffectComposer | null
    renderPass: RenderPass | null
    fxaaPass: ShaderPass | null
    outputPass: OutputPass | null

    // 后处理效果
    bloomPass: UnrealBloomPass | null
    ssaoPass: SSAOPass | null
    ssaaPass: SSAARenderPass | null
    ssrPass: SSRPass | null
    groundReflector: ReflectorForSSRPass | null

    scene: THREE.Scene
    camera: THREE.PerspectiveCamera
    renderer: THREE.WebGLRenderer

    // 后处理配置选项
    options: {
        bloom: boolean
        ssao: boolean
        ssaa: boolean
        fxaa: boolean
        ssr: boolean
    }

    constructor(meta: any) {
        super(meta)
        this.scene = meta.userData.scene
        this.camera = meta.userData.camera
        this.renderer = meta.userData.renderer
        this.composer = null
        this.renderPass = null
        this.fxaaPass = null
        this.outputPass = null

        // 初始化后处理效果为null
        this.bloomPass = null
        this.ssaoPass = null
        this.ssaaPass = null
        this.ssrPass = null
        this.groundReflector = null

        // 默认配置 - 可以根据需要调整
        this.options = {
            bloom: true, // 辉光效果
            ssao: true, // 环境光遮蔽（性能开销较大）
            ssaa: true, // 抗锯齿（性能开销较大）
            fxaa: true, // FXAA抗锯齿（默认启用）
            ssr: true, // 屏幕空间反射（性能开销较大，默认禁用）
        }

        this.init()
    }

    // 初始化后处理
    async init() {
        // 创建效果合成器
        this.composer = new EffectComposer(this.renderer)
        this.renderPass = new RenderPass(this.scene, this.camera)
        this.composer.addPass(this.renderPass)

        // 初始化各种后处理效果
        this.initBloom()
        this.initSSAO()
        this.initSSAA()
        this.initFXAA() // 添加FXAA初始化
        this.initSSR() // 添加SSR初始化

        // 添加输出通道
        this.outputPass = new OutputPass()
        this.composer.addPass(this.outputPass)
    }

    // 初始化辉光效果
    initBloom() {
        if (!this.options.bloom) return

        // 创建辉光效果
        this.bloomPass = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            1.5, // 强度
            0.4, // 半径
            0.85, // 阈值
        )
        this.composer?.addPass(this.bloomPass)
    }

    // 初始化环境光遮蔽效果
    initSSAO() {
        if (!this.options.ssao) return

        // 创建环境光遮蔽效果
        this.ssaoPass = new SSAOPass(this.scene, this.camera, window.innerWidth, window.innerHeight)
        this.ssaoPass.kernelRadius = 16
        this.ssaoPass.minDistance = 0.005
        this.ssaoPass.maxDistance = 0.1
        this.ssaoPass.output = SSAOPass.OUTPUT.Default
        this.composer?.addPass(this.ssaoPass)
    }

    // 初始化SSAA抗锯齿
    initSSAA() {
        if (!this.options.ssaa) return

        // 创建SSAA抗锯齿效果
        this.ssaaPass = new SSAARenderPass(this.scene, this.camera)
        this.ssaaPass.sampleLevel = 2
        this.ssaaPass.unbiased = true
        this.composer?.addPass(this.ssaaPass)
    }

    // 初始化FXAA抗锯齿
    initFXAA() {
        if (!this.options.fxaa) return

        // 创建FXAA抗锯齿效果
        this.fxaaPass = new ShaderPass(FXAAShader)
        const pixelRatio = this.renderer.getPixelRatio()
        this.fxaaPass.material.uniforms["resolution"].value.x = 1 / (this.renderer.domElement.width * pixelRatio)
        this.fxaaPass.material.uniforms["resolution"].value.y = 1 / (this.renderer.domElement.height * pixelRatio)
        this.composer?.addPass(this.fxaaPass)
    }

    // 初始化屏幕空间反射效果
    initSSR() {
        if (!this.options.ssr) return

        // 创建SSR效果
        this.ssrPass = new SSRPass({
            renderer: this.renderer,
            scene: this.scene,
            camera: this.camera,
            width: window.innerWidth,
            height: window.innerHeight,
            groundReflector: null,
            selects: null
        })

        // 配置SSR参数
        this.ssrPass.maxDistance = 200
        this.ssrPass.thickness = 0.5
        this.ssrPass.opacity = 0.5
        this.ssrPass.output = 0 // 0: Default, 1: SSR only, 2: Beauty only

        this.composer?.addPass(this.ssrPass)

        // 创建地面反射器（可选，用于地面反射效果）
        this.createGroundReflector()
    }

    // 创建地面反射器
    createGroundReflector() {
        // 创建一个大的平面作为地面反射器
        const planeGeometry = new THREE.PlaneGeometry(1000, 1000)
        this.groundReflector = new ReflectorForSSRPass(planeGeometry, {
            textureWidth: window.innerWidth,
            textureHeight: window.innerHeight,
            color: 0x7F7F7F,
            useDepthTexture: true,
            clipBias: 0.0001
        })

        // 设置反射器位置和旋转（默认在地面）
        this.groundReflector.position.y = 0
        this.groundReflector.rotation.x = -Math.PI / 2

        // 配置反射参数
        this.groundReflector.maxDistance = 200
        this.groundReflector.opacity = 0.5
        this.groundReflector.distanceAttenuation = true
        this.groundReflector.fresnel = true

        // 添加到场景（可选，根据需要决定是否显示）
        // this.scene.add(this.groundReflector)
    }

    // 渲染后处理
    async render() {
        this.composer?.render()
    }

    // 更新后处理
    update(): void {
        eventBus.on("update", () => {
            this.render()
        })
    }

    // 调整窗口大小时更新后处理
    resize(): void {
        eventBus.on("resize", () => {
            if (!this.composer) return

            // 更新合成器尺寸
            this.composer.setSize(window.innerWidth, window.innerHeight)

            // 更新FXAA分辨率
            if (this.fxaaPass) {
                const pixelRatio = this.renderer.getPixelRatio()
                this.fxaaPass.material.uniforms["resolution"].value.x =
                    1 / (this.renderer.domElement.width * pixelRatio)
                this.fxaaPass.material.uniforms["resolution"].value.y =
                    1 / (this.renderer.domElement.height * pixelRatio)
            }

            // 更新辉光效果尺寸
            if (this.bloomPass) {
                this.bloomPass.setSize(window.innerWidth, window.innerHeight)
            }

            // 更新SSAO尺寸
            if (this.ssaoPass) {
                this.ssaoPass.setSize(window.innerWidth, window.innerHeight)
            }

            // 更新SSAA尺寸
            if (this.ssaaPass) {
                this.ssaaPass.setSize(window.innerWidth, window.innerHeight)
            }

            // 更新SSR尺寸
            if (this.ssrPass) {
                this.ssrPass.setSize(window.innerWidth, window.innerHeight)
            }

            // 更新地面反射器尺寸
            if (this.groundReflector) {
                this.groundReflector.getRenderTarget().setSize(window.innerWidth, window.innerHeight)
            }
        })
    }

    // 启用/禁用特定效果
    toggleEffect(effect: keyof typeof this.options, enabled: boolean): void {
        if (this.options.hasOwnProperty(effect)) {
            this.options[effect] = enabled
            console.log(`${effect}效果已${enabled ? "启用" : "禁用"}`)

            // 重新初始化后处理效果
            this.resetComposer()
        }
    }

    // 重置效果合成器
    resetComposer(): void {
        // 清除所有通道
        if (this.composer) {
            while (this.composer.passes.length > 0) {
                this.composer.removePass(this.composer.passes[0])
            }
        }

        // 重新创建合成器
        this.composer = new EffectComposer(this.renderer)
        this.renderPass = new RenderPass(this.scene, this.camera)
        this.composer.addPass(this.renderPass)

        // 重新初始化各种效果
        this.initBloom()
        this.initSSAO()
        this.initSSAA()
        this.initFXAA() // 重新初始化FXAA
        this.initSSR() // 重新初始化SSR

        // 重新添加输出通道
        if (this.outputPass) {
            this.composer.addPass(this.outputPass)
        }
    }

    // 调整辉光效果参数
    setBloomParams(strength: number, radius: number, threshold: number): void {
        if (this.bloomPass) {
            this.bloomPass.strength = strength
            this.bloomPass.radius = radius
            this.bloomPass.threshold = threshold
        }
    }

    // 调整FXAA抗锯齿参数
    setFXAAParams(enabled: boolean): void {
        this.toggleEffect("fxaa", enabled)
    }

    // 调整SSR屏幕空间反射参数
    setSSRParams(opacity: number, maxDistance: number, thickness: number): void {
        if (this.ssrPass) {
            this.ssrPass.opacity = opacity
            this.ssrPass.maxDistance = maxDistance
            this.ssrPass.thickness = thickness
        }
    }

    // 启用/禁用地面反射器
    setGroundReflector(enabled: boolean): void {
        if (!this.groundReflector) return

        if (enabled) {
            // 添加到场景
            if (!this.scene.children.includes(this.groundReflector)) {
                this.scene.add(this.groundReflector)
            }
        } else {
            // 从场景移除
            this.scene.remove(this.groundReflector)
        }
    }

    // 销毁后处理效果
    dispose(): void {
        if (this.composer) {
            this.composer.dispose()
        }

        // 重置所有引用
        this.composer = null
        this.renderPass = null
        this.fxaaPass = null
        this.outputPass = null
        this.bloomPass = null
        this.ssaoPass = null
        this.ssaaPass = null
        this.ssrPass = null
        this.groundReflector = null
    }
}
