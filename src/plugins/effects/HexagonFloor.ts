import * as THREE from 'three'

export class HexagonFloor {
    scene: THREE.Scene
    public floorMesh: THREE.Mesh | null = null
    public width: number
    public height: number
    public animationTime: number = 0

    constructor(scene: THREE.Scene, width: number = 1000, height: number = 1000) {
        this.scene = scene
        this.width = width
        this.height = height
        this.init()
    }

    // 初始化
    async init() {
        this.createHexagonFloor()
    }

    // 创建六边形地板
    private createHexagonFloor() {
        // 创建平面几何体
        const floorGeometry = new THREE.PlaneGeometry(this.width, this.height, 32, 32)
        
        // 自定义六边形着色器材质
        const floorMaterial = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0.0 },
                resolution: { value: new THREE.Vector2(this.width, this.height) },
                color: { value: new THREE.Color(0x2a4d8a) },
                lineColor: { value: new THREE.Color(0x3fe0ff) },
                lineWidth: { value: 0.03 }, // 修改线条宽度：值越大，六边形线条越粗
                glowIntensity: { value: 0.8 },
                baseBrightness: { value: 0.2 } // 添加基础亮度参数
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
                uniform vec2 resolution;
                uniform vec3 color;
                uniform vec3 lineColor;
                uniform float lineWidth;
                uniform float glowIntensity;
                uniform float baseBrightness;
                
                varying vec2 vUv;
                varying vec3 vPosition;
                
                #define W 0.001
                
                // 计算点 p 到线段 (a -> b) 的距离
                float sdSegment(vec2 p, vec2 a, vec2 b) {
                    vec2 ab = b - a;
                    vec2 ap = p - a;
                    
                    // 投影计算
                    float t = clamp(dot(ap, ab) / dot(ab, ab), 0.0, 1.0);
                    vec2 projection = a + t * ab; // 最近投影点
                    
                    return length(p - projection);
                }
                
                float drawLine(vec2 st, vec2 start, vec2 end) {
                    float dist = sdSegment(st, start, end);
                    return step(dist, lineWidth);
                }
                
                // 画可重复六边形 - 仿照Hexagon.glsl格式
                float drawHexagon(vec2 st) {
                    float l1 = drawLine(st, vec2(0.0, W), vec2(1.0/6.0, W));
                    float l2 = drawLine(st, vec2(1.0/6.0, W), vec2(1.0/3.0, 0.5));
                    float l3 = drawLine(st, vec2(1.0/3.0, 0.5), vec2(2.0/3.0, 0.5));
                    float l4 = drawLine(st, vec2(2.0/3.0, 0.5), vec2(5.0/6.0, W));
                    float l5 = drawLine(st, vec2(5.0/6.0, W), vec2(1.0, W));
                    
                    float l7 = drawLine(st, vec2(1.0/6.0, 1.0), vec2(1.0/3.0, 0.5));
                    float l8 = drawLine(st, vec2(2.0/3.0, 0.5), vec2(5.0/6.0, 1.0));
                    
                    return step(0.5, l1 + l2 + l3 + l4 + l5 + l7 + l8);
                }
                
                // 画圈圈
                vec4 createHalo(vec2 st) {
                    vec2 center = vec2(0.5, 0.5); // 屏幕中心
                    // 修改六边形密度：数值越大，六边形越小且密度越高
                    vec2 sp = fract(st * vec2(400.0, 640.0)); // 原来是 vec2(20.0, 32.0)
                    float c = drawHexagon(sp);
                    
                    // 扩散圆圈效果 - 逐渐降低透明度
                    float progress = fract(time * 0.15); // 0到1的循环进度
                    float r = progress * 0.1; // 扩大扩散范围到0.3
                    float dist = distance(st, center);
                    
                    // 创建更宽的圆环，并添加透明度衰减
                    float ringWidth = 0.01;
                    float ring = smoothstep(r - ringWidth, r, dist) - smoothstep(r, r + ringWidth, dist);
                    
                    // 透明度衰减：圆圈越大越透明，同时随时间逐渐消失
                    float alphaFalloff = 1.0 - progress; // 随时间降低透明度
                    float distFalloff = 1.0 - smoothstep(0.0, 0.3, dist); // 距离中心越远越透明
                    float alpha = ring * alphaFalloff * distFalloff * 0.8;
                    
                    vec3 finalColor = vec3(0.5, 0.6, 1.0) * c;
                    
                    // 添加基础亮度到扫光效果中
                    finalColor += color * baseBrightness * 0.5;
                    
                    return vec4(finalColor, alpha);
                }
                
                void main() {
                    vec2 st = vUv;
                    vec4 result = createHalo(st);
                    
                    // 添加基础亮度，让所有六边形都有一定亮度
                    vec3 finalColor = result.rgb + color * baseBrightness;
                    float finalAlpha = min(result.a + baseBrightness * 0.3, 1.0);
                    
                    gl_FragColor = vec4(finalColor, finalAlpha);
                }
            `,
            transparent: true, // 启用透明度支持
            side: THREE.DoubleSide
        })

        // 创建地板网格
        this.floorMesh = new THREE.Mesh(floorGeometry, floorMaterial)
        this.floorMesh.rotation.x = -Math.PI / 2 // 旋转到水平面
        this.floorMesh.position.y = 0 // 设置在地面上
        
        // 启用阴影接收
        this.floorMesh.receiveShadow = true
        
        this.scene.add(this.floorMesh)
    }

    // 更新动画
    update(time: number) {
        this.animationTime = time
        if (this.floorMesh) {
            const material = this.floorMesh.material as THREE.ShaderMaterial
            material.uniforms.time.value = time
        }
    }

    // 设置可见性
    setVisible(visible: boolean) {
        if (this.floorMesh) {
            this.floorMesh.visible = visible
        }
    }

    // 获取可见性
    getVisible(): boolean {
        return this.floorMesh?.visible ?? false
    }

    // 清理资源
    dispose() {
        if (this.floorMesh) {
            this.scene.remove(this.floorMesh)
            this.floorMesh.geometry.dispose()
            ;(this.floorMesh.material as THREE.Material).dispose()
            this.floorMesh = null
        }
    }
}