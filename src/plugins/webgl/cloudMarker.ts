// 体积云标注核心类（增强版）
import { THREE } from "../basePlugin";

interface CloudMarkerOptions {
    height: number;
    contour: THREE.Vector3[];
    density?: number;
    color?: number;
    animationSpeed?: number;
    noiseTexture?: string;
}

export class CloudMarker {
    private options: Required<CloudMarkerOptions>;
    private group: THREE.Group;
    private cloudMesh: THREE.Mesh;
    private material: THREE.MeshPhongMaterial;
    private animationTime: number = 0;
    private noiseTexture: THREE.Texture | null = null;

    constructor(options: CloudMarkerOptions) {
        this.options = {
            density: 0.7,
            color: 0xeeeeee,
            animationSpeed: 0.3,
            noiseTexture: './textures/cloud_noise.jpg',
            ...options
        };

        this.validateOptions();
        this.group = new THREE.Group();
        this.preloadTexture();
        this.material = this.createCloudMaterial();
        this.cloudMesh = this.createCloudGeometry();
        this.group.add(this.cloudMesh);
    }

    private validateOptions(): void {
        if (this.options.contour.length < 3) {
            throw new Error('云标注需要至少3个轮廓点');
        }
        if (this.options.height <= 0) {
            throw new Error('云层高度必须大于0');
        }
    }

    private preloadTexture(): void {
        const loader = new THREE.TextureLoader();
        this.noiseTexture = loader.load(this.options.noiseTexture, tex => {
            tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
            tex.repeat.set(3, 3);
        });
    }

    private createCloudMaterial(): THREE.MeshPhongMaterial {
        return new THREE.MeshPhongMaterial({
            color: this.options.color,
            transparent: true,
            opacity: this.options.density,
            depthWrite: false,
            side: THREE.DoubleSide,
            alphaMap: this.noiseTexture,
            bumpMap: this.noiseTexture,
            bumpScale: 0.05
        });
    }

    private createCloudGeometry(): THREE.Mesh {
        const shape = new THREE.Shape();
        this.options.contour.forEach((p, i) => {
            if (i === 0) shape.moveTo(p.x, p.z);
            else shape.lineTo(p.x, p.z);
        });

        const extrudeSettings = {
            depth: this.options.height,
            bevelEnabled: false,
            curveSegments: 32
        };

        const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        geometry.rotateX(-Math.PI / 2);
        geometry.computeVertexNormals();
        return new THREE.Mesh(geometry, this.material);
    }

    public update(deltaTime: number): void {
        this.animationTime += deltaTime * this.options.animationSpeed;
        
        // 复合动画：旋转 + 上下浮动 + 形态变化
        this.group.rotation.y = Math.sin(this.animationTime) * 0.1;
        this.group.position.y = Math.sin(this.animationTime * 2) * 0.05;
        this.cloudMesh.scale.setX(1 + Math.sin(this.animationTime * 0.5) * 0.02);
        
        // 更新材质动画
        if (this.noiseTexture) {
            this.noiseTexture.offset.x += deltaTime * 0.01;
            this.noiseTexture.offset.y += deltaTime * 0.005;
        }
    }

    public getGroup(): THREE.Group {
        return this.group;
    }
}