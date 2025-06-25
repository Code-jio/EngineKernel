// 指定轮廓的水体渲染，
// 输入参数：高度，轮廓（三维坐标组成的数组）
// 先创建一个半透明的水蓝色，上下底面为多边形的棱柱，侧面为透明的
// 上顶面的材质替换为水体材质，水体材质为透明，反射为水体颜色，折射为水体颜色

import { THREE } from "../basePlugin";

// 水体配置接口
interface WaterMarkerOptions {
    height: number;                    // 水体高度
    contour: THREE.Vector3[];         // 轮廓坐标数组
    position?: THREE.Vector3;         // 水体位置
    waterColor?: number;              // 水体颜色
    transparency?: number;            // 透明度 (0-1)
    reflectivity?: number;            // 反射强度 (0-1)
    refractionRatio?: number;         // 折射比率
    flowSpeed?: number;               // 水流速度
    waveScale?: number;               // 波纹缩放
    distortionScale?: number;         // 扭曲强度
    enableAnimation?: boolean;        // 是否启用动画
    waterNormalsTexture?: string;     // 水面法线贴图路径
}

export default class WaterMarker {
    private options: WaterMarkerOptions;
    private group: THREE.Group;
    private waterMesh: THREE.Mesh | null = null;
    private sideMeshes: THREE.Mesh[] = [];
    private bottomMesh: THREE.Mesh | null = null;
    private waterMaterial: THREE.ShaderMaterial | null = null;
    private sideMaterial: THREE.Material | null = null;
    private bottomMaterial: THREE.Material | null = null;
    private animationTime: number = 0;
    private renderer: THREE.WebGLRenderer | null = null;
    private scene: THREE.Scene | null = null;
    private camera: THREE.Camera | null = null;

    constructor(options: WaterMarkerOptions) {
        // 设置默认值
        this.options = {
            position: new THREE.Vector3(0, 0, 0),
            waterColor: 0x4a90e2,
            transparency: 0.7,
            reflectivity: 0.8,
            refractionRatio: 1.33,
            flowSpeed: 0.5,
            waveScale: 1.0,
            distortionScale: 3.7,
            enableAnimation: true,
            ...options
        };

        this.group = new THREE.Group();
        this.group.position.copy(this.options.position!);
        
        this.validateOptions();
        this.init();
    }

    /**
     * 验证输入参数
     */
    private validateOptions(): void {
        if (!this.options.contour || this.options.contour.length < 3) {
            throw new Error('WaterMarker: 轮廓至少需要3个点');
        }

        if (this.options.height <= 0) {
            throw new Error('WaterMarker: 高度必须大于0');
        }

        console.log(`🌊 WaterMarker 初始化: 轮廓点数=${this.options.contour.length}, 高度=${this.options.height}`);
    }

    /**
     * 初始化水体
     */
    private init(): void {
        this.createMaterials();
        this.createGeometry();
        console.log('✅ WaterMarker 初始化完成');
    }

    /**
     * 创建材质
     */
    private createMaterials(): void {
        // 创建水面材质（顶面）
        this.createWaterMaterial();
        
        // 创建侧面材质（半透明）
        this.sideMaterial = new THREE.MeshPhongMaterial({
            color: this.options.waterColor,
            transparent: true,
            opacity: this.options.transparency! * 0.3,
            side: THREE.DoubleSide
        });

        // 创建底面材质（更深的水色）
        this.bottomMaterial = new THREE.MeshPhongMaterial({
            color: this.darkenColor(this.options.waterColor!, 0.3),
            transparent: true,
            opacity: this.options.transparency! * 0.8,
            side: THREE.FrontSide
        });
    }

    /**
     * 创建水面材质
     */
    private createWaterMaterial(): void {
        // 水面着色器材质
        const waterVertexShader = `
            uniform float time;
            uniform float waveScale;
            
            varying vec3 vWorldPosition;
            varying vec3 vNormal;
            varying vec2 vUv;

            void main() {
                vUv = uv;
                vNormal = normalize(normalMatrix * normal);
                
                vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                vWorldPosition = worldPosition.xyz;
                
                // 添加波浪效果
                float wave = sin(worldPosition.x * waveScale + time) * 
                           cos(worldPosition.z * waveScale + time) * 0.1;
                worldPosition.y += wave;
                
                gl_Position = projectionMatrix * viewMatrix * worldPosition;
            }
        `;

        const waterFragmentShader = `
            uniform float time;
            uniform vec3 waterColor;
            uniform float transparency;
            uniform float reflectivity;
            uniform float distortionScale;
            
            varying vec3 vWorldPosition;
            varying vec3 vNormal;
            varying vec2 vUv;

            void main() {
                // 基础水色
                vec3 color = waterColor;
                
                // 添加波纹扭曲
                vec2 distortion = vec2(
                    sin(vUv.x * distortionScale + time) * 0.1,
                    cos(vUv.y * distortionScale + time) * 0.1
                );
                
                // 模拟反射效果
                float fresnel = pow(1.0 - dot(vNormal, vec3(0.0, 1.0, 0.0)), 2.0);
                color = mix(color, vec3(1.0), fresnel * reflectivity);
                
                // 动态透明度
                float alpha = transparency * (1.0 - fresnel * 0.3);
                
                gl_FragColor = vec4(color, alpha);
            }
        `;

        this.waterMaterial = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0.0 },
                waterColor: { value: new THREE.Color(this.options.waterColor!) },
                transparency: { value: this.options.transparency! },
                reflectivity: { value: this.options.reflectivity! },
                waveScale: { value: this.options.waveScale! },
                distortionScale: { value: this.options.distortionScale! }
            },
            vertexShader: waterVertexShader,
            fragmentShader: waterFragmentShader,
            transparent: true,
            side: THREE.DoubleSide
        });
    }

    /**
     * 创建几何体
     */
    private createGeometry(): void {
        const contour = this.options.contour;
        const height = this.options.height;

        // 确保材质已创建
        if (!this.waterMaterial || !this.sideMaterial || !this.bottomMaterial) {
            throw new Error('材质未正确初始化');
        }

        // 创建顶面和底面几何体
        const topGeometry = this.createPolygonGeometry(contour, height / 2);
        const bottomGeometry = this.createPolygonGeometry(contour, -height / 2);

        // 创建水面网格（顶面）
        this.waterMesh = new THREE.Mesh(topGeometry, this.waterMaterial);
        this.waterMesh.name = 'WaterSurface';
        this.group.add(this.waterMesh);

        // 创建底面网格
        this.bottomMesh = new THREE.Mesh(bottomGeometry, this.bottomMaterial);
        this.bottomMesh.name = 'WaterBottom';
        this.group.add(this.bottomMesh);

        // 创建侧面网格
        this.createSideWalls(contour, height);
    }

    /**
     * 根据轮廓创建多边形几何体
     */
    private createPolygonGeometry(contour: THREE.Vector3[], y: number): THREE.BufferGeometry {
        // 将三维轮廓投影到XZ平面
        const shape = new THREE.Shape();
        
        if (contour.length > 0) {
            shape.moveTo(contour[0].x, contour[0].z);
            for (let i = 1; i < contour.length; i++) {
                shape.lineTo(contour[i].x, contour[i].z);
            }
            shape.lineTo(contour[0].x, contour[0].z); // 闭合
        }

        const geometry = new THREE.ShapeGeometry(shape);
        
        // 设置所有顶点的Y坐标
        const positions = geometry.attributes.position.array as Float32Array;
        for (let i = 1; i < positions.length; i += 3) {
            positions[i] = y;
        }
        
        geometry.attributes.position.needsUpdate = true;
        geometry.computeVertexNormals();
        
        return geometry;
    }

    /**
     * 创建侧面墙体
     */
    private createSideWalls(contour: THREE.Vector3[], height: number): void {
        // 确保侧面材质已创建
        if (!this.sideMaterial) {
            throw new Error('侧面材质未正确初始化');
        }

        for (let i = 0; i < contour.length; i++) {
            const current = contour[i];
            const next = contour[(i + 1) % contour.length];

            // 创建侧面四边形
            const sideGeometry = new THREE.PlaneGeometry(
                current.distanceTo(next), 
                height
            );

            // 计算侧面的位置和旋转
            const midPoint = new THREE.Vector3()
                .addVectors(current, next)
                .multiplyScalar(0.5);

            const direction = new THREE.Vector3()
                .subVectors(next, current)
                .normalize();

            const sideMesh = new THREE.Mesh(sideGeometry, this.sideMaterial);
            sideMesh.position.copy(midPoint);
            sideMesh.lookAt(
                midPoint.x + direction.x,
                midPoint.y,
                midPoint.z + direction.z
            );
            sideMesh.rotateY(Math.PI / 2);
            sideMesh.name = `WaterSide_${i}`;

            this.sideMeshes.push(sideMesh);
            this.group.add(sideMesh);
        }
    }

    /**
     * 颜色变暗工具函数
     */
    private darkenColor(color: number, factor: number): number {
        const c = new THREE.Color(color);
        c.r *= (1 - factor);
        c.g *= (1 - factor);
        c.b *= (1 - factor);
        return c.getHex();
    }

    /**
     * 更新动画
     */
    public update(deltaTime: number): void {
        if (!this.options.enableAnimation) return;

        this.animationTime += deltaTime * this.options.flowSpeed!;

        if (this.waterMaterial) {
            this.waterMaterial.uniforms.time.value = this.animationTime;
        }
    }

    /**
     * 添加到场景
     */
    public addToScene(scene: THREE.Scene): void {
        this.scene = scene;
        scene.add(this.group);
        console.log('🌊 WaterMarker 已添加到场景');
    }

    /**
     * 从场景移除
     */
    public removeFromScene(): void {
        if (this.scene) {
            this.scene.remove(this.group);
            this.scene = null;
            console.log('🗑️ WaterMarker 已从场景移除');
        }
    }

    /**
     * 设置位置
     */
    public setPosition(position: THREE.Vector3): void {
        this.group.position.copy(position);
        this.options.position = position.clone();
    }

    /**
     * 获取位置
     */
    public getPosition(): THREE.Vector3 {
        return this.group.position.clone();
    }

    /**
     * 设置水体颜色
     */
    public setWaterColor(color: number): void {
        this.options.waterColor = color;
        
        if (this.waterMaterial) {
            this.waterMaterial.uniforms.waterColor.value = new THREE.Color(color);
        }
        
        if (this.sideMaterial && this.sideMaterial instanceof THREE.MeshPhongMaterial) {
            this.sideMaterial.color = new THREE.Color(color);
        }
    }

    /**
     * 设置透明度
     */
    public setTransparency(transparency: number): void {
        transparency = Math.max(0, Math.min(1, transparency));
        this.options.transparency = transparency;

        if (this.waterMaterial) {
            this.waterMaterial.uniforms.transparency.value = transparency;
        }

        if (this.sideMaterial && this.sideMaterial instanceof THREE.MeshPhongMaterial) {
            this.sideMaterial.opacity = transparency * 0.3;
        }

        if (this.bottomMaterial && this.bottomMaterial instanceof THREE.MeshPhongMaterial) {
            this.bottomMaterial.opacity = transparency * 0.8;
        }
    }

    /**
     * 设置波浪参数
     */
    public setWaveParameters(waveScale: number, distortionScale: number): void {
        this.options.waveScale = waveScale;
        this.options.distortionScale = distortionScale;

        if (this.waterMaterial) {
            this.waterMaterial.uniforms.waveScale.value = waveScale;
            this.waterMaterial.uniforms.distortionScale.value = distortionScale;
        }
    }

    /**
     * 启用/禁用动画
     */
    public setAnimationEnabled(enabled: boolean): void {
        this.options.enableAnimation = enabled;
    }

    /**
     * 更新轮廓（重新生成几何体）
     */
    public updateContour(newContour: THREE.Vector3[]): void {
        if (newContour.length < 3) {
            console.warn('⚠️ 轮廓至少需要3个点');
            return;
        }

        this.options.contour = newContour;

        // 清除现有几何体
        this.clearGeometry();

        // 重新创建几何体
        this.createGeometry();
        
        console.log(`🔄 轮廓已更新: ${newContour.length} 个点`);
    }

    /**
     * 清除几何体
     */
    private clearGeometry(): void {
        // 移除现有网格
        if (this.waterMesh) {
            this.group.remove(this.waterMesh);
            this.waterMesh.geometry.dispose();
            this.waterMesh = null;
        }

        if (this.bottomMesh) {
            this.group.remove(this.bottomMesh);
            this.bottomMesh.geometry.dispose();
            this.bottomMesh = null;
        }

        this.sideMeshes.forEach(mesh => {
            this.group.remove(mesh);
            mesh.geometry.dispose();
        });
        this.sideMeshes = [];
    }

    /**
     * 获取配置信息
     */
    public getOptions(): WaterMarkerOptions {
        return { ...this.options };
    }

    /**
     * 获取群组对象
     */
    public getGroup(): THREE.Group {
        return this.group;
    }

    /**
     * 销毁资源
     */
    public dispose(): void {
        this.removeFromScene();
        this.clearGeometry();

        // 清理材质
        if (this.waterMaterial) {
            this.waterMaterial.dispose();
        }
        if (this.sideMaterial) {
            this.sideMaterial.dispose();
        }
        if (this.bottomMaterial) {
            this.bottomMaterial.dispose();
        }

        console.log('🗑️ WaterMarker 资源已释放');
    }
}