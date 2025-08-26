import { THREE, BasePlugin } from "../basePlugin";
import { SmokeParticleSystem } from "./SmokeMarker";

interface FireMarkerOptions {
    maxFireParticles: number;
    maxSmokeParticles: number;
    fireEmissionRate: number;
    smokeEmissionRate: number;
    fireLifetime: number;
    smokeLifetime: number;
    fireColorStart: THREE.Color;
    fireColorMid: THREE.Color;
    fireColorEnd: THREE.Color;
    smokeColorStart: THREE.Color;
    smokeColorEnd: THREE.Color;
    position: THREE.Vector3;
    coneAngle: number;
    coneHeight: number;
    turbulence: number;
    windForce: THREE.Vector3;
}

/**
 * 火焰粒子系统类
 * 创建逼真的火焰燃烧效果，包含火焰源、烟雾和倒锥形扩散
 */
export class FireParticleSystem {
    public scene: THREE.Scene;
    public options: FireMarkerOptions;
    // 火焰粒子系统
    private fireParticles: Array<{
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
    private activeFireParticles: Array<{
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
    private fireGeometry!: THREE.BufferGeometry;
    private firePositions!: Float32Array;
    private fireColors!: Float32Array;
    private fireSizes!: Float32Array;
    private fireAlphas!: Float32Array;
    private fireAges!: Float32Array;
    private fireMaterial!: THREE.ShaderMaterial;
    private fireSystem!: THREE.Points;
    // 烟雾粒子系统
    private smokeParticles: Array<{
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
    private activeSmokeParticles: Array<{
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
    private smokeGeometry!: THREE.BufferGeometry;
    private smokePositions!: Float32Array;
    private smokeColors!: Float32Array;
    private smokeSizes!: Float32Array;
    private smokeAlphas!: Float32Array;
    private smokeMaterial!: THREE.ShaderMaterial;
    private smokeSystem!: THREE.Points;
    private clock: THREE.Clock;
    constructor(scene: THREE.Scene, options: FireMarkerOptions) {
        this.scene = scene;
        this.options = { ...options };
        this.options.maxFireParticles = this.options.maxFireParticles ?? 800;
        this.options.maxSmokeParticles = this.options.maxSmokeParticles ?? 400;
        this.options.fireEmissionRate = this.options.fireEmissionRate ?? 60;
        this.options.smokeEmissionRate = this.options.smokeEmissionRate ?? 20;
        this.options.fireLifetime = this.options.fireLifetime ?? 2.0;
        this.options.smokeLifetime = this.options.smokeLifetime ?? 4.0;
        this.options.fireColorStart = this.options.fireColorStart ?? new THREE.Color(0xff4500);
        this.options.fireColorMid = this.options.fireColorMid ?? new THREE.Color(0xff8c00);
        this.options.fireColorEnd = this.options.fireColorEnd ?? new THREE.Color(0xffd700);
        this.options.smokeColorStart = this.options.smokeColorStart ?? new THREE.Color(0x333333);
        this.options.smokeColorEnd = this.options.smokeColorEnd ?? new THREE.Color(0x111111);
        this.options.position = this.options.position ?? new THREE.Vector3(0, 0, 0);
        this.options.coneAngle = this.options.coneAngle ?? Math.PI / 6;
        this.options.coneHeight = this.options.coneHeight ?? 8.0;
        this.options.turbulence = this.options.turbulence ?? 0.8;
        this.options.windForce = this.options.windForce ?? new THREE.Vector3(0.1, 2.0, 0.1);

        this.fireParticles = [];
        this.activeFireParticles = [];
        this.smokeParticles = [];
        this.activeSmokeParticles = [];
        this.clock = new THREE.Clock();

        this.initFireSystem();
        this.initSmokeSystem();
    }

    initFireSystem() {
        // 创建火焰粒子几何体
        this.fireGeometry = new THREE.BufferGeometry()
        this.firePositions = new Float32Array(this.options.maxFireParticles * 3)
        this.fireColors = new Float32Array(this.options.maxFireParticles * 3)
        this.fireSizes = new Float32Array(this.options.maxFireParticles)
        this.fireAlphas = new Float32Array(this.options.maxFireParticles)
        this.fireAges = new Float32Array(this.options.maxFireParticles)

        this.fireGeometry.setAttribute("position", new THREE.BufferAttribute(this.firePositions, 3))
        this.fireGeometry.setAttribute("color", new THREE.BufferAttribute(this.fireColors, 3))
        this.fireGeometry.setAttribute("size", new THREE.BufferAttribute(this.fireSizes, 1))
        this.fireGeometry.setAttribute("alpha", new THREE.BufferAttribute(this.fireAlphas, 1))

        // 火焰材质
        this.fireMaterial = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                cameraPos: { value: new THREE.Vector3() },
            },
            vertexShader: `
                attribute float size;
                attribute float alpha;
                varying vec3 vColor;
                varying float vAlpha;
                uniform float time;

                #include <common>
                #include <logdepthbuf_pars_vertex>

                
                void main() {
                    vColor = color;
                    vAlpha = alpha;
                    
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    
                    // 根据高度调整大小，形成倒锥形
                    float heightFactor = 1.0 + position.y * 0.1;
                    gl_PointSize = size * heightFactor * (300.0 / -mvPosition.z);
                    gl_Position = projectionMatrix * mvPosition;

                    #include <logdepthbuf_vertex>
                }
            `,
            fragmentShader: `
                varying vec3 vColor;
                varying float vAlpha;

                #include <common>
                #include <fog_pars_fragment>
                #include <logdepthbuf_pars_fragment>
                
                void main() {
                    // 创建火焰形状
                    vec2 center = gl_PointCoord - vec2(0.5);
                    float dist = length(center);
                    
                    if (dist > 0.5) discard;
                    
                    // 火焰内部核心和外部渐变
                    float intensity = 1.0 - smoothstep(0.0, 0.5, dist);
                    float core = 1.0 - smoothstep(0.0, 0.2, dist);
                    
                    vec3 finalColor = vColor * (intensity * 0.8 + core * 0.4);
                    float finalAlpha = vAlpha * intensity;
                    
                    gl_FragColor = vec4(finalColor, finalAlpha);

                    #include <fog_fragment>	
                    #include <logdepthbuf_fragment>     
                }
            `,
            blending: THREE.AdditiveBlending,
            depthTest: true,
            depthWrite: false,
            transparent: true,
            vertexColors: true,
        })

        this.fireSystem = new THREE.Points(this.fireGeometry, this.fireMaterial)
        this.fireSystem.renderOrder = 0
        this.fireSystem.name = "fireParticles"
        this.scene.add(this.fireSystem)

        // 初始化火焰粒子池
        for (let i = 0; i < this.options.maxFireParticles; i++) {
            this.fireParticles.push({
                index: i,
                active: false,
                age: 0,
                lifetime: 0,
                position: new THREE.Vector3(),
                velocity: new THREE.Vector3(),
                color: new THREE.Color(),
                size: 0,
                alpha: 0,
            })
        }
    }

    initSmokeSystem() {
        // 创建烟雾粒子几何体
        this.smokeGeometry = new THREE.BufferGeometry()
        this.smokePositions = new Float32Array(this.options.maxSmokeParticles * 3)
        this.smokeColors = new Float32Array(this.options.maxSmokeParticles * 3)
        this.smokeSizes = new Float32Array(this.options.maxSmokeParticles)
        this.smokeAlphas = new Float32Array(this.options.maxSmokeParticles)

        this.smokeGeometry.setAttribute("position", new THREE.BufferAttribute(this.smokePositions, 3))
        this.smokeGeometry.setAttribute("color", new THREE.BufferAttribute(this.smokeColors, 3))
        this.smokeGeometry.setAttribute("size", new THREE.BufferAttribute(this.smokeSizes, 1))
        this.smokeGeometry.setAttribute("alpha", new THREE.BufferAttribute(this.smokeAlphas, 1))

        // 烟雾材质
        this.smokeMaterial = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
            },
            vertexShader: `
                attribute float size;
                attribute float alpha;
                varying vec3 vColor;
                varying float vAlpha;
                uniform float time;

                #include <common>
                #include <logdepthbuf_pars_vertex>
                
                void main() {
                    vColor = color;
                    vAlpha = alpha;
                    
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    gl_PointSize = size * (1.0 + position.y * 0.05) * (300.0 / -mvPosition.z);
                    gl_Position = projectionMatrix * mvPosition;

                    #include <logdepthbuf_vertex>
                }
            `,
            fragmentShader: `
                varying vec3 vColor;
                varying float vAlpha;

                #include <common>
                #include <fog_pars_fragment>
                #include <logdepthbuf_pars_fragment>
                
                void main() {
                    vec2 center = gl_PointCoord - vec2(0.5);
                    float dist = length(center);
                    
                    if (dist > 0.5) discard;
                    
                    float smoke = 1.0 - smoothstep(0.0, 0.5, dist);
                    vec3 finalColor = vColor * smoke;
                    float finalAlpha = vAlpha * smoke * 0.6;
                    
                    gl_FragColor = vec4(finalColor, finalAlpha);

                    #include <fog_fragment>	
                    #include <logdepthbuf_fragment>   
                }
            `,
            blending: THREE.NormalBlending,
            depthTest: true,
            depthWrite: false,
            transparent: true,
            vertexColors: true,
        })

        this.smokeSystem = new THREE.Points(this.smokeGeometry, this.smokeMaterial)
        this.scene.add(this.smokeSystem)

        // 初始化烟雾粒子池
        for (let i = 0; i < this.options.maxSmokeParticles; i++) {
            this.smokeParticles.push({
                index: i,
                active: false,
                age: 0,
                lifetime: 0,
                position: new THREE.Vector3(),
                velocity: new THREE.Vector3(),
                color: new THREE.Color(),
                size: 0,
                alpha: 0,
            })
        }
    }

    emitFireParticle() {
        if (this.activeFireParticles.length >= this.options.maxFireParticles) return

        let particle = null
        for (let i = 0; i < this.fireParticles.length; i++) {
            if (!this.fireParticles[i].active) {
                particle = this.fireParticles[i]
                break
            }
        }

        if (!particle) return

        particle.active = true
        particle.age = 0
        particle.lifetime = this.options.fireLifetime * (0.7 + Math.random() * 0.6)

        // 倒锥形分布
        const coneRadius = Math.tan(this.options.coneAngle / 2) * this.options.coneHeight
        const randomRadius = Math.random() * coneRadius * 0.3
        const randomAngle = Math.random() * Math.PI * 2

        particle.position.copy(this.options.position)
        particle.position.x += Math.cos(randomAngle) * randomRadius
        particle.position.z += Math.sin(randomAngle) * randomRadius
        particle.position.y += Math.random() * 0.5 // 基础高度偏移

        // 向上和向外扩散的速度
        const upwardSpeed = 2.0 + Math.random() * 1.5
        const outwardFactor = (particle.position.y / this.options.coneHeight) * 0.5

        particle.velocity.set(
            (Math.random() - 0.5) * this.options.turbulence +
                (particle.position.x - this.options.position.x) * outwardFactor,
            upwardSpeed,
            (Math.random() - 0.5) * this.options.turbulence +
                (particle.position.z - this.options.position.z) * outwardFactor,
        )

        particle.size = 1.5 + Math.random() * 2.0
        particle.color.copy(this.options.fireColorStart)
        particle.alpha = 0.9 + Math.random() * 0.1

        this.activeFireParticles.push(particle)
    }

    emitSmokeParticle() {
        if (this.activeSmokeParticles.length >= this.options.maxSmokeParticles) return

        let particle = null
        for (let i = 0; i < this.smokeParticles.length; i++) {
            if (!this.smokeParticles[i].active) {
                particle = this.smokeParticles[i]
                break
            }
        }

        if (!particle) return

        particle.active = true
        particle.age = 0
        particle.lifetime = this.options.smokeLifetime * (0.8 + Math.random() * 0.4)

        // 烟雾从火焰上方开始
        particle.position.copy(this.options.position)
        particle.position.y += 1.0 + Math.random() * 2.0
        particle.position.x += (Math.random() - 0.5) * 1.5
        particle.position.z += (Math.random() - 0.5) * 1.5

        // 烟雾上升速度较慢，更分散
        particle.velocity.set(
            (Math.random() - 0.5) * this.options.turbulence * 0.5,
            1.0 + Math.random() * 0.5,
            (Math.random() - 0.5) * this.options.turbulence * 0.5,
        )

        particle.size = 3.0 + Math.random() * 4.0
        particle.color.copy(this.options.smokeColorStart)
        particle.alpha = 0.4 + Math.random() * 0.3

        this.activeSmokeParticles.push(particle)
    }

    update(deltaTime: number) {
        const currentTime = this.clock.getElapsedTime()

        // 更新着色器时间
        this.fireMaterial.uniforms.time.value = currentTime
        this.smokeMaterial.uniforms.time.value = currentTime

        // 发射新粒子
        const fireToEmit = Math.floor(this.options.fireEmissionRate * deltaTime)
        const smokeToEmit = Math.floor(this.options.smokeEmissionRate * deltaTime)

        for (let i = 0; i < fireToEmit; i++) {
            this.emitFireParticle()
        }

        for (let i = 0; i < smokeToEmit; i++) {
            this.emitSmokeParticle()
        }

        // 更新火焰粒子
        this.updateParticleSystem(
            this.activeFireParticles,
            this.firePositions,
            this.fireColors,
            this.fireSizes,
            this.fireAlphas,
            this.options.fireColorStart,
            this.options.fireColorMid,
            this.options.fireColorEnd,
            deltaTime,
            "fire",
        )

        // 更新烟雾粒子
        this.updateParticleSystem(
            this.activeSmokeParticles,
            this.smokePositions,
            this.smokeColors,
            this.smokeSizes,
            this.smokeAlphas,
            this.options.smokeColorStart,
            this.options.smokeColorEnd,
            null,
            deltaTime,
            "smoke",
        )

        // 更新几何体缓冲区
        this.fireGeometry.attributes.position.needsUpdate = true
        this.fireGeometry.attributes.color.needsUpdate = true
        this.fireGeometry.attributes.size.needsUpdate = true
        this.fireGeometry.attributes.alpha.needsUpdate = true

        this.smokeGeometry.attributes.position.needsUpdate = true
        this.smokeGeometry.attributes.color.needsUpdate = true
        this.smokeGeometry.attributes.size.needsUpdate = true
        this.smokeGeometry.attributes.alpha.needsUpdate = true
    }

    updateParticleSystem(
        particles: Array<{
            index: number;
            active: boolean;
            age: number;
            lifetime: number;
            position: THREE.Vector3;
            velocity: THREE.Vector3;
            color: THREE.Color;
            size: number;
            alpha: number;
        }>,
        positions: Float32Array,
        colors: Float32Array,
        sizes: Float32Array,
        alphas: Float32Array,
        colorStart: THREE.Color,
        colorMid: THREE.Color | null,
        colorEnd: THREE.Color | null,
        deltaTime: number,
        type: string
    ) {
        for (let i = particles.length - 1; i >= 0; i--) {
            const particle = particles[i];
            particle.age += deltaTime;

            if (particle.age >= particle.lifetime) {
                particle.active = false;
                particles.splice(i, 1);
                continue;
            }

            const lifeRatio = particle.age / particle.lifetime;

            // 更新位置
            particle.position.add(particle.velocity.clone().multiplyScalar(deltaTime));

            // 添加湍流效果
            if (type === "fire") {
                particle.velocity.x += (Math.random() - 0.5) * this.options.turbulence * 0.1;
                particle.velocity.z += (Math.random() - 0.5) * this.options.turbulence * 0.1;
                particle.velocity.y += 0.02; // 持续上升
            } else {
                particle.velocity.x += (Math.random() - 0.5) * this.options.turbulence * 0.05;
                particle.velocity.z += (Math.random() - 0.5) * this.options.turbulence * 0.05;
                particle.velocity.y += 0.01;
            }

            // 速度衰减
            particle.velocity.multiplyScalar(0.995);

            // 更新颜色
            if (type === "fire" && colorEnd) {
                if (colorMid) {
                    particle.color.lerpColors(
                        lifeRatio < 0.5 ? colorStart : colorMid,
                        lifeRatio < 0.5 ? colorMid : colorEnd,
                        lifeRatio < 0.5 ? lifeRatio * 2 : (lifeRatio - 0.5) * 2
                    );
                } else {
                    particle.color.lerpColors(colorStart, colorEnd, lifeRatio);
                }
            } else if (colorEnd) {
                particle.color.lerpColors(colorStart, colorEnd, lifeRatio);
            }

            // 更新大小
            if (type === "fire") {
                particle.size *= 1.02; // 火焰逐渐变大
            } else {
                particle.size *= 1.03; // 烟雾扩散更快
            }

            // 更新透明度
            particle.alpha = Math.max(0, 1.0 - lifeRatio);

            // 更新缓冲区数据
            const index = particle.index;
            positions[index * 3] = particle.position.x;
            positions[index * 3 + 1] = particle.position.y;
            positions[index * 3 + 2] = particle.position.z;

            colors[index * 3] = particle.color.r;
            colors[index * 3 + 1] = particle.color.g;
            colors[index * 3 + 2] = particle.color.b;

            sizes[index] = particle.size;
            alphas[index] = particle.alpha;
        }
    }

    setPosition(position: THREE.Vector3) {
        this.options.position.copy(position)
    }

    setEmissionRates(fireRate: number, smokeRate: number) {
        this.options.fireEmissionRate = fireRate
        this.options.smokeEmissionRate = smokeRate
    }

    setIntensity(intensity: number) {
        this.options.fireEmissionRate = 60 * intensity
        this.options.smokeEmissionRate = 20 * intensity
    }

    destroy() {
        if (this.fireSystem) {
            this.scene.remove(this.fireSystem)
            this.fireGeometry.dispose()
            this.fireMaterial.dispose()
        }

        if (this.smokeSystem) {
            this.scene.remove(this.smokeSystem)
            this.smokeGeometry.dispose()
            this.smokeMaterial.dispose()
        }
    }
}

/**
 * 火焰效果管理器
 * 提供简化的火焰效果创建接口
 */
export class FireEffectManager {
    public scene: THREE.Scene;
    public effects: Array<{
        type: string;
        effect: FireParticleSystem;
        update: (deltaTime: number) => void;
    }>;

    constructor(scene: THREE.Scene) {
        this.scene = scene;
        this.effects = [];
    }

    createFireEffect(options: Partial<FireMarkerOptions> = {}): FireParticleSystem {
        // 合并默认选项和传入的选项
        const mergedOptions: FireMarkerOptions = {
            maxFireParticles: 800,
            maxSmokeParticles: 400,
            fireEmissionRate: 60,
            smokeEmissionRate: 20,
            fireLifetime: 2.0,
            smokeLifetime: 4.0,
            fireColorStart: new THREE.Color(0xff4500),
            fireColorMid: new THREE.Color(0xff8c00),
            fireColorEnd: new THREE.Color(0xffd700),
            smokeColorStart: new THREE.Color(0x333333),
            smokeColorEnd: new THREE.Color(0x111111),
            position: new THREE.Vector3(0, 0, 0),
            coneAngle: Math.PI / 6,
            coneHeight: 8.0,
            turbulence: 0.8,
            windForce: new THREE.Vector3(0.1, 2.0, 0.1),
            ...options
        };

        const fireEffect = new FireParticleSystem(this.scene, mergedOptions);
        
        this.effects.push({
            type: "fire",
            effect: fireEffect,
            update: (deltaTime: number) => fireEffect.update(deltaTime),
        });

        return fireEffect;
    }

    removeEffect(effect: FireParticleSystem | SmokeParticleSystem) {
        const index = this.effects.findIndex(e => e.effect === effect);
        if (index !== -1) {
            this.effects[index].effect.destroy();
            this.effects.splice(index, 1);
        }
    }

    update(deltaTime: number) {
        this.effects.forEach(({ effect }) => {
            if (effect && effect.update) {
                effect.update(deltaTime);
            }
        });
    }

    destroy() {
        this.effects.forEach(({ effect }) => {
            effect.destroy();
        });
        this.effects = [];
    }
}
