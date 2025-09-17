import { THREE, BasePlugin } from "../basePlugin"
import eventBus from "../../eventBus/eventBus"
import * as TWEEN from "@tweenjs/tween.js"

export class TechRingEffect extends BasePlugin {
    scene: THREE.Scene
    camera: THREE.PerspectiveCamera
    renderer: THREE.WebGLRenderer
    private ringMesh: THREE.Mesh | null = null
    private animationTween: TWEEN.Tween<{ scale: number; opacity: number; time: number }> | null = null

    constructor(meta: any) {
        super(meta)
        this.scene = meta.userData.scene
        this.camera = meta.userData.camera
        this.renderer = meta.userData.renderer
    }

    // 初始化
    async init() {
        this.createTechRing()
    }

    // 创建科技感光圈
    private createTechRing() {
        // 创建环形几何体
        const ringGeometry = new THREE.RingGeometry(0.5, 1.5, 64)
        
        // 自定义着色器材质
        const ringMaterial = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0.0 },
                opacity: { value: 1.0 },
                color: { value: new THREE.Color(0x3fe0ff) },
                innerRadius: { value: 0.5 },
                outerRadius: { value: 1.5 }
            },
            vertexShader: `
                varying vec2 vUv;
                varying vec3 vPosition;
                
                void main() {
                    vUv = uv;
                    vPosition = position;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float time;
                uniform float opacity;
                uniform vec3 color;
                uniform float innerRadius;
                uniform float outerRadius;
                
                varying vec2 vUv;
                varying vec3 vPosition;
                
                // 噪声函数
                float random(vec2 st) {
                    return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
                }
                
                float noise(vec2 st) {
                    vec2 i = floor(st);
                    vec2 f = fract(st);
                    
                    float a = random(i);
                    float b = random(i + vec2(1.0, 0.0));
                    float c = random(i + vec2(0.0, 1.0));
                    float d = random(i + vec2(1.0, 1.0));
                    
                    vec2 u = f * f * (3.0 - 2.0 * f);
                    
                    return mix(a, b, u.x) + (c - a)* u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
                }
                
                void main() {
                    // 计算距离中心的距离
                    float dist = length(vPosition.xy);
                    
                    // 环形遮罩
                    float ringMask = smoothstep(innerRadius, innerRadius + 0.1, dist) * 
                                    (1.0 - smoothstep(outerRadius - 0.1, outerRadius, dist));
                    
                    // 添加噪声扰动
                    vec2 noiseCoord = vPosition.xy * 8.0 + time * 2.0;
                    float noiseValue = noise(noiseCoord) * 0.3;
                    
                    // 边缘发光效果
                    float edgeGlow = 1.0 - abs(dist - (innerRadius + outerRadius) * 0.5) / ((outerRadius - innerRadius) * 0.5);
                    edgeGlow = pow(edgeGlow, 3.0);
                    
                    // 径向渐变
                    float radialFade = 1.0 - smoothstep(innerRadius, outerRadius, dist);
                    
                    // 综合效果
                    float finalAlpha = ringMask * edgeGlow * radialFade * (1.0 + noiseValue);
                    finalAlpha *= opacity;
                    
                    // 颜色增强
                    vec3 finalColor = color * (1.0 + edgeGlow * 0.5);
                    
                    gl_FragColor = vec4(finalColor, finalAlpha);
                }
            `,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        })

        // 创建网格
        this.ringMesh = new THREE.Mesh(ringGeometry, ringMaterial)
        this.ringMesh.position.set(0, 0, 0)
        this.ringMesh.rotation.x = -Math.PI / 2
        
        this.scene.add(this.ringMesh)
        
        // 启动扩散动画
        this.startExpansionAnimation()
    }

    // 启动扩散动画
    private startExpansionAnimation() {
        if (!this.ringMesh) return

        const startScale = 0.1
        const endScale = 4.0
        const startOpacity = 1.0
        const endOpacity = 0.0

        // 创建动画对象
        const animationData = {
            scale: startScale,
            opacity: startOpacity,
            time: 0
        }

        // 使用 Tween.js 创建平滑动画
        this.animationTween = new TWEEN.Tween(animationData)
            .to({ scale: endScale, opacity: endOpacity, time: 3.0 }, 3000)
            .easing(TWEEN.Easing.Exponential.Out)
            .onUpdate(() => {
                if (this.ringMesh) {
                    this.ringMesh.scale.setScalar(animationData.scale)
                    
                    // 更新着色器uniforms
                    const material = this.ringMesh.material as THREE.ShaderMaterial
                    material.uniforms.opacity.value = animationData.opacity
                    material.uniforms.time.value = animationData.time
                }
            })
            .onComplete(() => {
                this.removeRing()
            })
            .start()
    }

    // 移除光圈
    private removeRing() {
        if (this.ringMesh) {
            this.scene.remove(this.ringMesh)
            this.ringMesh.geometry.dispose()
            ;(this.ringMesh.material as THREE.ShaderMaterial).dispose()
            this.ringMesh = null
        }
    }

    // 手动触发光圈效果
    public triggerEffect(position?: THREE.Vector3) {
        // 如果已有光圈在播放，先停止
        if (this.animationTween) {
            this.animationTween.stop()
            this.removeRing()
        }

        // 创建新的光圈
        this.createTechRing()
        
        // 设置位置
        if (position && this.ringMesh) {
            this.ringMesh.position.copy(position)
        }
    }

    // 清理资源
    public dispose() {
        if (this.animationTween) {
            this.animationTween.stop()
        }
        this.removeRing()
    }
}
