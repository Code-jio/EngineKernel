import { THREE, BasePlugin } from "../basePlugin"
import eventBus from "../../eventBus/eventBus"

/**
 * 改进版烟雾粒子系统
 * 修复了原版中的多个问题并优化了性能
 */
export class SmokeParticleSystem {
    public scene: THREE.Scene
    public options: {
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
        texturePath: string;
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
        texturePath: '/textures/smoke1.png'
    };

    // 使用索引池优化粒子管理
    private particlePool: number[] = [];
    private activeParticles: number[] = [];
    private particleData: {
        age: number;
        lifetime: number;
        position: THREE.Vector3;
        velocity: THREE.Vector3;
        color: THREE.Color;
        size: number;
        alpha: number;
    }[] = [];

    private clock: THREE.Clock;
    private geometry!: THREE.BufferGeometry;
    private positions!: Float32Array;
    private colors!: Float32Array;
    private sizes!: Float32Array;
    private alphas!: Float32Array;
    private material!: THREE.ShaderMaterial;
    private particleSystem!: THREE.Points;
    private textureLoader: THREE.TextureLoader;
    private smokeTexture?: THREE.Texture;

    // 复用对象减少GC压力
    private tempVector3: THREE.Vector3 = new THREE.Vector3();
    private tempColor: THREE.Color = new THREE.Color();

    constructor(scene: THREE.Scene, options: Partial<typeof this.options> = {}) {
        this.scene = scene;
        this.options = { ...this.options, ...options };
        
        this.textureLoader = new THREE.TextureLoader();
        this.clock = new THREE.Clock();
        
        this.init();
    }

    private async init(): Promise<void> {
        try {
            // 异步加载纹理并处理错误
            this.smokeTexture = await this.loadTexture(this.options.texturePath);
            this.setupGeometry();
            this.setupMaterial(this.smokeTexture);
            this.initializeParticlePool();
        } catch (error) {
            console.warn('烟雾效果初始化失败，使用备用材质:', error);
            this.setupGeometry();
            this.setupFallbackMaterial();
            this.initializeParticlePool();
        }
    }

    private loadTexture(path: string): Promise<THREE.Texture> {
        return new Promise((resolve, reject) => {
            this.textureLoader.load(
                path,
                (texture) => {
                    texture.minFilter = THREE.LinearFilter;
                    texture.magFilter = THREE.LinearFilter;
                    resolve(texture);
                },
                undefined,
                (error) => reject(new Error(`无法加载烟雾纹理: ${path}`))
            );
        });
    }

    private setupGeometry(): void {
        this.geometry = new THREE.BufferGeometry();
        this.positions = new Float32Array(this.options.maxParticles * 3);
        this.colors = new Float32Array(this.options.maxParticles * 3);
        this.sizes = new Float32Array(this.options.maxParticles);
        this.alphas = new Float32Array(this.options.maxParticles);

        this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
        this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
        this.geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));
        this.geometry.setAttribute('alpha', new THREE.BufferAttribute(this.alphas, 1));
    }

    private setupMaterial(texture?: THREE.Texture): void {
        this.material = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                smokeTexture: { value: texture || null },
                cameraPos: { value: new THREE.Vector3() }
            },
            vertexShader: this.getVertexShader(),
            fragmentShader: texture ? this.getFragmentShader() : this.getFallbackFragmentShader(),
            blending: THREE.NormalBlending, // 改为正常混合避免过曝
            depthTest: false, // 避免深度排序问题
            depthWrite: false,
            transparent: true,
            vertexColors: true
        });

        this.particleSystem = new THREE.Points(this.geometry!, this.material);
        this.scene.add(this.particleSystem);
    }

    private setupFallbackMaterial(): void {
        // 使用基础材质作为后备方案
        this.material = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                cameraPos: { value: new THREE.Vector3() }
            },
            vertexShader: this.getVertexShader(),
            fragmentShader: this.getFallbackFragmentShader(),
            blending: THREE.NormalBlending,
            depthTest: false,
            depthWrite: false,
            transparent: true,
            vertexColors: true
        });

        this.particleSystem = new THREE.Points(this.geometry, this.material);
        this.scene.add(this.particleSystem);
    }

    private initializeParticlePool(): void {
        // 初始化粒子池和粒子数据
        for (let i = 0; i < this.options.maxParticles; i++) {
            this.particlePool.push(i);
            this.particleData.push({
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

    private getVertexShader(): string {
        return `
            attribute float size;
            attribute float alpha;
            varying vec3 vColor;
            varying float vAlpha;
            uniform float time;
            uniform vec3 cameraPos;
            
            void main() {
                vColor = color;
                vAlpha = alpha;
                
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                
                // 根据距离调整大小
                float distance = length(mvPosition.xyz);
                float sizeFactor = 1.0 + distance * 0.01;
                
                gl_PointSize = size * sizeFactor * (300.0 / -mvPosition.z);
                gl_Position = projectionMatrix * mvPosition;
            }
        `;
    }

    private getFragmentShader(): string {
        return `
            uniform sampler2D smokeTexture;
            uniform float time;
            varying vec3 vColor;
            varying float vAlpha;
            
            void main() {
                vec4 texColor = texture2D(smokeTexture, gl_PointCoord);
                
                // 烟雾效果混合
                vec3 finalColor = vColor * texColor.rgb;
                float finalAlpha = texColor.a * vAlpha * 0.6;
                
                gl_FragColor = vec4(finalColor, finalAlpha);
                
                // 边缘柔化
                if (gl_FragColor.a < 0.01) discard;
            }
        `;
    }

    private getFallbackFragmentShader(): string {
        return `
            varying vec3 vColor;
            varying float vAlpha;
            
            void main() {
                // 简单的圆形烟雾效果
                vec2 center = gl_PointCoord - vec2(0.5);
                float dist = length(center);
                
                if (dist > 0.5) discard;
                
                float alpha = (1.0 - dist * 2.0) * vAlpha * 0.6;
                gl_FragColor = vec4(vColor, alpha);
            }
        `;
    }

    public emitParticle(): void {
        if (this.particlePool.length === 0) return;

        // 从粒子池中获取索引
        const particleIndex = this.particlePool.pop()!;
        const particle = this.particleData[particleIndex];

        // 重置粒子属性
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
            1.0 + Math.random() * 0.5,
            (Math.random() - 0.5) * this.options.turbulence
        );

        particle.size = this.options.particleSize * (0.5 + Math.random() * 0.5);
        particle.color.copy(this.options.colorStart);
        particle.alpha = 0.8 + Math.random() * 0.2;

        this.activeParticles.push(particleIndex);
    }

    public update(deltaTime: number): void {
        if (!this.particleSystem || !this.material || !this.geometry) return;

        const currentTime = this.clock.getElapsedTime();
        this.material.uniforms.time.value = currentTime;

        // 发射新粒子
        const particlesToEmit = Math.floor(this.options.emissionRate * deltaTime);
        for (let i = 0; i < particlesToEmit; i++) {
            this.emitParticle();
        }

        // 更新活动粒子
        for (let i = this.activeParticles.length - 1; i >= 0; i--) {
            const particleIndex = this.activeParticles[i];
            const particle = this.particleData[particleIndex];
            
            particle.age += deltaTime;

            if (particle.age >= particle.lifetime) {
                // 粒子生命周期结束，返回池中
                this.activeParticles.splice(i, 1);
                this.particlePool.push(particleIndex);
                continue;
            }

            const lifeRatio = particle.age / particle.lifetime;

            // 使用临时向量避免频繁创建对象
            this.tempVector3.copy(particle.velocity).multiplyScalar(deltaTime);
            particle.position.add(this.tempVector3);

            // 添加湍流
            this.tempVector3.set(
                (Math.random() - 0.5) * this.options.turbulence,
                0,
                (Math.random() - 0.5) * this.options.turbulence
            );
            particle.velocity.add(this.tempVector3);

            // 添加风力
            this.tempVector3.copy(this.options.windForce).multiplyScalar(deltaTime);
            particle.velocity.add(this.tempVector3);

            // 速度衰减
            particle.velocity.multiplyScalar(0.99);

            // 更新颜色
            this.tempColor.lerpColors(
                this.options.colorStart,
                this.options.colorEnd,
                lifeRatio
            );
            particle.color.copy(this.tempColor);

            // 更新大小和透明度
            particle.size *= 1.01;
            particle.alpha = Math.max(0, 1.0 - lifeRatio);

            // 更新缓冲区数据
            const index = particleIndex;
            this.positions[index * 3] = particle.position.x;
            this.positions[index * 3 + 1] = particle.position.y;
            this.positions[index * 3 + 2] = particle.position.z;

            this.colors[index * 3] = particle.color.r;
            this.colors[index * 3 + 1] = particle.color.g;
            this.colors[index * 3 + 2] = particle.color.b;

            this.sizes[index] = particle.size;
            this.alphas[index] = particle.alpha;
        }

        // 更新几何体缓冲区
        if (this.geometry) {
            this.geometry.attributes.position.needsUpdate = true;
            this.geometry.attributes.color.needsUpdate = true;
            this.geometry.attributes.size.needsUpdate = true;
            this.geometry.attributes.alpha.needsUpdate = true;
        }
    }

    public setPosition(position: THREE.Vector3): void {
        this.options.position.copy(position);
    }

    public setEmissionRate(rate: number): void {
        this.options.emissionRate = rate;
    }

    public setMaxParticles(max: number): void {
        this.options.maxParticles = max;
    }

    public destroy(): void {
        if (this.particleSystem) {
            this.scene.remove(this.particleSystem);
            this.geometry?.dispose();
            this.material?.dispose();
            this.smokeTexture?.dispose();
        }

        // 清理所有缓冲区
        this.positions = new Float32Array(0);
        this.colors = new Float32Array(0);
        this.sizes = new Float32Array(0);
        this.alphas = new Float32Array(0);
        this.particleData = [];
        this.particlePool = [];
        this.activeParticles = [];
    }

    public getActiveParticleCount(): number {
        return this.activeParticles.length;
    }

    public getPoolUtilization(): number {
        return this.activeParticles.length / this.options.maxParticles;
    }
}

/**
 * 改进版烟雾效果管理器
 * 修复了原版中的管理问题
 */
export class SmokeEffectManager {
    public scene: THREE.Scene;
    public effects: Map<string, SmokeParticleSystem> = new Map();

    constructor(scene: THREE.Scene) {
        this.scene = scene;
    }

    public createSmokeEffect(
        id: string,
        options: Partial<SmokeParticleSystem['options']> = {}
    ): SmokeParticleSystem {
        if (this.effects.has(id)) {
            console.warn(`烟雾效果 ${id} 已存在，将替换旧的效果`);
            this.removeEffect(id);
        }

        const smokeEffect = new SmokeParticleSystem(this.scene, options);
        this.effects.set(id, smokeEffect);

        return smokeEffect;
    }

    public getEffect(id: string): SmokeParticleSystem | undefined {
        return this.effects.get(id);
    }

    public removeEffect(id: string): boolean {
        const effect = this.effects.get(id);
        if (effect) {
            effect.destroy();
            this.effects.delete(id);
            return true;
        }
        return false;
    }

    public update(deltaTime: number): void {
        this.effects.forEach(effect => {
            effect.update(deltaTime);
        });
    }

    public destroy(): void {
        this.effects.forEach(effect => {
            effect.destroy();
        });
        this.effects.clear();
    }

    public getEffectIds(): string[] {
        return Array.from(this.effects.keys());
    }

    public getStats(): {
        totalEffects: number;
        totalActiveParticles: number;
        poolUtilization: number;
    } {
        let totalActiveParticles = 0;
        let totalMaxParticles = 0;

        this.effects.forEach(effect => {
            totalActiveParticles += effect.getActiveParticleCount();
            totalMaxParticles += effect.options.maxParticles;
        });

        return {
            totalEffects: this.effects.size,
            totalActiveParticles,
            poolUtilization: totalMaxParticles > 0 ? totalActiveParticles / totalMaxParticles : 0
        };
    }
}