import { THREE, BasePlugin } from "../basePlugin"
import { CloudMarker } from "./cloudMarker"
import eventBus from "../../eventBus/eventBus"

/**
 * 烟雾粒子系统类
 */
export class SmokeParticleSystem {
    public scene: THREE.Scene
    public options: {
        maxParticles: number; // 最大粒子数 
        particleSize: number; // 粒子大小
        emissionRate: number; // 发射速率
        lifetime: number; // 存活时间
        windForce: THREE.Vector3; // 风力扰动
        turbulence: number; // 
        colorStart: THREE.Color;
        colorEnd: THREE.Color;
        position: THREE.Vector3;
        spread: THREE.Vector3;
        url: string
    } = {
        maxParticles: 1000,
        particleSize: 2.0,
        emissionRate: 50,
        lifetime: 5.0,
        windForce: new THREE.Vector3(0.5, 0.8, 0.1),
        turbulence: 0.3,
        colorStart: new THREE.Color(0x888888),
        colorEnd: new THREE.Color(0x333333),
        position: new THREE.Vector3(0, 0, 0),
        spread: new THREE.Vector3(10, 5, 10),
        url: ""
    };

    private particles: Array<{
        index: number;
        active: boolean;
        age: number;
        lifetime: number;
        position: THREE.Vector3;
        velocity: THREE.Vector3;
        color: THREE.Color;
        size: number;
        alpha: number;
    }> = [];

    private activeParticles: Array<{
        index: number;
        active: boolean;
        age: number;
        lifetime: number;
        position: THREE.Vector3;
        velocity: THREE.Vector3;
        color: THREE.Color;
        size: number;
        alpha: number;
    }> = [];

    private clock: THREE.Clock;
    private emitter: null;

    private geometry!: THREE.BufferGeometry;
    private positions!: Float32Array;
    private colors!: Float32Array;
    private sizes!: Float32Array;
    private alphas!: Float32Array;
    private ages!: Float32Array;
    private velocities!: Float32Array;
    private material!: THREE.ShaderMaterial;
    private particleSystem!: THREE.Points;

    public smokeTexture!: THREE.Texture

    constructor(scene: THREE.Scene, options: Partial<{
        maxParticles: number;
        particleSize: number;
        emissionRate: number;
        lifetime: number;
        windForce: THREE.Vector3;
        turbulence: number;
        colorStart: THREE.Color;
        colorEnd: THREE.Color;
        position: THREE.Vector3;
        spread: THREE.Vector3;
        url: string
    }> = {}) {
        this.scene = scene;
        this.options = {
            maxParticles: options.maxParticles ?? 1000,
            particleSize: options.particleSize ?? 2.0,
            emissionRate: options.emissionRate ?? 50,
            lifetime: options.lifetime ?? 5.0,
            windForce: options.windForce ?? new THREE.Vector3(0.5, 0.8, 0.1),
            turbulence: options.turbulence ?? 0.3,
            colorStart: options.colorStart ?? new THREE.Color(0x888888),
            colorEnd: options.colorEnd ?? new THREE.Color(0x333333),
            position: options.position ?? new THREE.Vector3(0, 0, 0),
            spread: options.spread ?? new THREE.Vector3(10, 5, 10),
            url: "",
            ...options
        };

        this.particles = [];
        this.activeParticles = [];
        this.clock = new THREE.Clock();
        this.emitter = null;
        
        this.init();
    }

    init() {
        // 创建粒子几何体
        this.geometry = new THREE.BufferGeometry();
        this.positions = new Float32Array(this.options.maxParticles * 3);
        this.colors = new Float32Array(this.options.maxParticles * 3);
        this.sizes = new Float32Array(this.options.maxParticles);
        this.alphas = new Float32Array(this.options.maxParticles);
        this.ages = new Float32Array(this.options.maxParticles);
        this.velocities = new Float32Array(this.options.maxParticles * 3);

        this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
        this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
        this.geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));
        this.geometry.setAttribute('alpha', new THREE.BufferAttribute(this.alphas, 1));

        if (!this.options.url) {
            throw new Error("未传入url参数")
        }else{
            this.smokeTexture = new THREE.TextureLoader().load(this.options.url);
        }

        // 创建烟雾材质
        this.material = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                smokeTexture: { value: this.smokeTexture },
                cameraPos: { value: new THREE.Vector3() }
            },
            vertexShader: `
                attribute float size;
                attribute float alpha;
                varying vec3 vColor;
                varying float vAlpha;
                uniform float time;
                uniform vec3 cameraPos;

                #include <common>
                #include <logdepthbuf_pars_vertex>

                
                void main() {
                    vColor = color;
                    vAlpha = alpha;
                    
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    
                    // 根据距离调整大小
                    float distance = length(mvPosition.xyz);
                    float sizeFactor = 1.0 + distance * 0.01;
                    
                    gl_PointSize = size * sizeFactor * (300.0 / -mvPosition.z);
                    gl_Position = projectionMatrix * mvPosition;

                    #include <logdepthbuf_vertex>
                }
            `,
            fragmentShader: `
                uniform sampler2D smokeTexture;
                uniform float time;
                varying vec3 vColor;
                varying float vAlpha;

                #include <common>
                #include <fog_pars_fragment>
                #include <logdepthbuf_pars_fragment>

                
                void main() {
                    vec4 texColor = texture2D(smokeTexture, gl_PointCoord);
                    
                    // 烟雾效果混合
                    vec3 finalColor = vColor * texColor.rgb;
                    float finalAlpha = texColor.a * vAlpha * 0.6;
                    
                    gl_FragColor = vec4(finalColor, finalAlpha);
                    
                    // 边缘柔化
                    if (gl_FragColor.a < 0.01) discard;

                    #include <fog_fragment>	
                    #include <logdepthbuf_fragment>     
                }
            `,
            blending: THREE.NormalBlending,
            depthTest: true,
            depthWrite: false,
            transparent: true,
            vertexColors: true
        });

        this.particleSystem = new THREE.Points(this.geometry, this.material);
        this.particleSystem.name = "smoke"
        this.scene.add(this.particleSystem);

        // 初始化粒子池
        for (let i = 0; i < this.options.maxParticles; i++) {
            this.particles.push({
                index: i,
                active: false,
                age: 0,
                lifetime: 0,
                position: new THREE.Vector3(),
                velocity: new THREE.Vector3(),
                color: new THREE.Color(),
                size: 0,
                alpha: 0
            });
        }
    }

    emitParticle() {
        if (this.activeParticles.length >= this.options.maxParticles) return;

        // 找到第一个非活动粒子
        let particle = null;
        for (let i = 0; i < this.particles.length; i++) {
            if (!this.particles[i].active) {
                particle = this.particles[i];
                break;
            }
        }

        if (!particle) return;

        // 重置粒子属性
        particle.active = true;
        particle.age = 0;
        particle.lifetime = this.options.lifetime * (0.8 + Math.random() * 0.4);
        
        // 随机初始位置
        particle.position.copy(this.options.position);
        particle.position.x += (Math.random() - 0.5) * this.options.spread.x;
        particle.position.y += (Math.random() - 0.5) * this.options.spread.y;
        particle.position.z += (Math.random() - 0.5) * this.options.spread.z;

        // 初始速度
        particle.velocity.set(
            (Math.random() - 0.5) * this.options.turbulence,
            1.0 + Math.random() * 0.5, // 向上漂浮
            (Math.random() - 0.5) * this.options.turbulence
        );

        particle.size = this.options.particleSize * (0.5 + Math.random() * 0.5);
        particle.color.copy(this.options.colorStart);
        particle.alpha = 0.8 + Math.random() * 0.2;

        this.activeParticles.push(particle);
    }

    update(deltaTime: number) {
        const currentTime = this.clock.getElapsedTime();
        
        // 更新着色器时间
        this.material.uniforms.time.value = currentTime;

        // 发射新粒子
        const particlesToEmit = Math.floor(this.options.emissionRate * deltaTime);
        for (let i = 0; i < particlesToEmit; i++) {
            this.emitParticle();
        }

        // 更新活动粒子
        for (let i = this.activeParticles.length - 1; i >= 0; i--) {
            const particle = this.activeParticles[i];
            particle.age += deltaTime;

            if (particle.age >= particle.lifetime) {
                // 粒子生命周期结束
                particle.active = false;
                this.activeParticles.splice(i, 1);
                continue;
            }

            // 计算生命周期比例
            const lifeRatio = particle.age / particle.lifetime;

            // 更新位置
            particle.position.add(particle.velocity.clone().multiplyScalar(deltaTime));
            
            // 添加风力和湍流
            const turbulence = new THREE.Vector3(
                (Math.random() - 0.5) * this.options.turbulence,
                0,
                (Math.random() - 0.5) * this.options.turbulence
            );
            particle.velocity.add(turbulence);
            particle.velocity.add(this.options.windForce.clone().multiplyScalar(deltaTime));

            // 速度衰减
            particle.velocity.multiplyScalar(0.99);

            // 更新颜色（从浅到深）
            particle.color.lerpColors(
                this.options.colorStart,
                this.options.colorEnd,
                lifeRatio
            );

            // 更新大小（逐渐增大）
            particle.size *= 1.01;

            // 更新透明度（逐渐减小）
            particle.alpha = Math.max(0, 1.0 - lifeRatio);

            // 更新缓冲区数据
            const index = particle.index;
            this.positions[index * 3] = particle.position.x;
            this.positions[index * 3 + 1] = particle.position.y;
            this.positions[index * 3 + 2] = particle.position.z;

            this.colors[index * 3] = particle.color.r;
            this.colors[index * 3 + 1] = particle.color.g;
            this.colors[index * 3 + 2] = particle.color.b;

            this.sizes[index] = particle.size;
            this.alphas[index] = particle.alpha;
            this.ages[index] = particle.age;
        }

        // 更新几何体缓冲区
        this.geometry.attributes.position.needsUpdate = true;
        this.geometry.attributes.color.needsUpdate = true;
        this.geometry.attributes.size.needsUpdate = true;
        this.geometry.attributes.alpha.needsUpdate = true;
    }

    setPosition(position: THREE.Vector3) {
        this.options.position.copy(position);
    }

    setEmissionRate(rate: number) {
        this.options.emissionRate = rate;
    }

    setMaxParticles(max: number) {
        this.options.maxParticles = max;
    }

    destroy() {
        if (this.particleSystem) {
            this.scene.remove(this.particleSystem);
            this.geometry.dispose();
            this.material.dispose();
        }
    }
}

/**
 * 烟雾效果管理器
 * 提供简化的烟雾效果创建接口
 */
export class SmokeEffectManager {
    public scene: THREE.Scene;
    public effects: Array<{
        type: string;
        effect: SmokeParticleSystem;
        update: (deltaTime: any) => void
    }>;

    constructor(scene: THREE.Scene) {
        this.scene = scene;
        this.effects = [];
    }

    createSmokeEffect(options: Partial<{
        maxParticles: number;
        particleSize: number;
        emissionRate: number;
        lifetime: number;
        windForce: THREE.Vector3;
        turbulence: number;
        colorStart: THREE.Color;
        colorEnd: THREE.Color;
        position: THREE.Vector3;
        spread: THREE.Vector3;
    }> = {}) {
        const smokeEffect = new SmokeParticleSystem(this.scene, options);
        this.effects.push({
            type: 'smoke',
            effect: smokeEffect,
            update: (deltaTime: any) => smokeEffect.update(deltaTime)
        });
        return smokeEffect;
    }

    removeEffect(effect: SmokeParticleSystem) {
        const index = this.effects.findIndex(e => e.effect === effect);
        if (index !== -1) {
            this.effects[index].effect.destroy();
            this.effects.splice(index, 1);
            
            // 从全局效果列表中移除
            if (this.effects) {
                const index = this.effects.findIndex(e => e.effect === effect);
                if (index !== -1) {
                    this.effects.splice(index, 1);
                }
            }
        }
    }

    update(deltaTime: number) {
        if (!this.effects) return;
        this.effects.forEach(({ effect }) => {
            if (effect.update) {
                effect.update(deltaTime);
            }
        });
    }

    destroy() {
        this.effects.forEach(({ effect }) => {
            effect.destroy();
        });
        // 从全局效果列表中移除
        if (window.effects) {
            window.effects = window.effects.filter((e: any) => e.type !== 'smoke');
        }
        this.effects = [];
    }
}

// 声明全局 effects 属性
declare global {
    interface Window {
        effects: Array<{
            type: string;
            update: (deltaTime: number) => void;
            effect?: SmokeParticleSystem;
        }>;
    }
}
