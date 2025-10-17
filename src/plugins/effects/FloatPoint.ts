import * as THREE from 'three';

export interface FloatPointConfig {
  count?: number // 光点数量，默认300
  range?: { x: number; y: number; z: number } // 分布范围，默认{ x: 20, y: 10, z: 20 }
  floatSpeed?: number // 漂浮速率，默认0.5
  breatheFrequency?: number // 呼吸频率，默认2.0
  color?: THREE.Color // 光点颜色，默认0x3fe0ff
  size?: number // 光点大小，默认0.1
}

export  class FloatPoint {
  private scene: THREE.Scene
  private points!: THREE.Points
  private material!: THREE.ShaderMaterial
  private geometry!: THREE.BufferGeometry
  private positions!: Float32Array
  private colors!: Float32Array
  private sizes!: Float32Array
  private opacities!: Float32Array
  private velocities!: Float32Array
  private breathePhases!: Float32Array
  private config: Required<FloatPointConfig>
  private clock: THREE.Clock
  private circleTexture!: THREE.Texture

  constructor(scene: THREE.Scene, config: FloatPointConfig = {}) {
    this.scene = scene
    this.clock = new THREE.Clock()
    
    // 设置默认配置
    this.config = {
      count: config.count || 300,
      range: config.range || { x: 20, y: 10, z: 20 },
      floatSpeed: config.floatSpeed || 0.5,
      breatheFrequency: config.breatheFrequency || 2.0,
      color: config.color || new THREE.Color(0x3fe0ff),
      size: config.size || 0.1
    }

    this.init()
  }

  private init() {
    // 创建圆形纹理
    this.createCircleTexture()
    
    // 创建几何体
    this.geometry = new THREE.BufferGeometry()
    
    // 初始化数组
    this.positions = new Float32Array(this.config.count * 3)
    this.colors = new Float32Array(this.config.count * 3)
    this.sizes = new Float32Array(this.config.count)
    this.opacities = new Float32Array(this.config.count)
    this.velocities = new Float32Array(this.config.count * 3)
    this.breathePhases = new Float32Array(this.config.count)

    // 随机生成粒子属性
    for (let i = 0; i < this.config.count; i++) {
      const i3 = i * 3
      
      // 位置
      this.positions[i3] = (Math.random() - 0.5) * this.config.range.x
      this.positions[i3 + 1] = (Math.random() - 0.5) * this.config.range.y
      this.positions[i3 + 2] = (Math.random() - 0.5) * this.config.range.z
      
      // 颜色（添加一些随机变化）
      const colorVariation = 0.8 + Math.random() * 0.4
      this.colors[i3] = this.config.color.r * colorVariation
      this.colors[i3 + 1] = this.config.color.g * colorVariation
      this.colors[i3 + 2] = this.config.color.b * colorVariation
      
      // 大小（统一的小尺寸）
      this.sizes[i] = this.config.size
      
      // 透明度（初始为0，通过呼吸效果变化）
      this.opacities[i] = 0
      
      // 漂浮速度
      this.velocities[i3] = (Math.random() - 0.5) * 0.02
      this.velocities[i3 + 1] = Math.random() * 0.01 + 0.005
      this.velocities[i3 + 2] = (Math.random() - 0.5) * 0.02
      
      // 呼吸相位
      this.breathePhases[i] = Math.random() * Math.PI * 2
    }

    // 设置几何体属性
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3))
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3))
    this.geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1))
    this.geometry.setAttribute('opacity', new THREE.BufferAttribute(this.opacities, 1))

    // 创建自定义着色器材质
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        pointTexture: { value: this.circleTexture }
      },
      vertexShader: `
        attribute float size;
        attribute float opacity;
        varying vec3 vColor;
        varying float vOpacity;

        #include <common>
        #include <logdepthbuf_pars_vertex>

        void main() {
          vColor = color;
          vOpacity = opacity;
          
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (300.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;

          #include <logdepthbuf_vertex>
        }
      `,
      fragmentShader: `
        uniform sampler2D pointTexture;
        varying vec3 vColor;
        varying float vOpacity;

        #include <fog_pars_fragment>
        #include <logdepthbuf_pars_fragment>
        
        void main() {
          vec4 texColor = texture2D(pointTexture, gl_PointCoord);
          gl_FragColor = vec4(vColor * texColor.rgb, texColor.a * vOpacity);

          #include <fog_fragment>
          #include <logdepthbuf_fragment>
        }
      `,
      blending: THREE.AdditiveBlending,
      depthTest: true,
      depthWrite: false,
      transparent: true,
      vertexColors: true
    })

    // 创建点云
    this.points = new THREE.Points(this.geometry, this.material)
    this.scene.add(this.points)
  }

  // 创建圆形纹理
  private createCircleTexture() {
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 64
    const context = canvas.getContext('2d')!
    
    // 创建渐变圆形
    const centerX = 32
    const centerY = 32
    const radius = 30
    
    // 创建径向渐变
    const gradient = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius)
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)')
    gradient.addColorStop(0.4, 'rgba(255, 255, 255, 0.8)')
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')
    
    // 绘制圆形
    context.fillStyle = gradient
    context.beginPath()
    context.arc(centerX, centerY, radius, 0, Math.PI * 2)
    context.fill()
    
    this.circleTexture = new THREE.CanvasTexture(canvas)
    this.circleTexture.needsUpdate = true
  }

  // 更新动画
  update(elapsedTime:number) {
    
    // 更新位置
    for (let i = 0; i < this.config.count; i++) {
      const i3 = i * 3
      
      // 基础漂浮运动
      this.positions[i3] += this.velocities[i3] * this.config.floatSpeed
      this.positions[i3 + 1] += this.velocities[i3 + 1] * this.config.floatSpeed
      this.positions[i3 + 2] += this.velocities[i3 + 2] * this.config.floatSpeed
      
      // 添加正弦波动效果
      this.positions[i3] += Math.sin(elapsedTime * 0.5 + this.breathePhases[i]) * 0.001
      this.positions[i3 + 1] += Math.cos(elapsedTime * 0.3 + this.breathePhases[i]) * 0.0005
      this.positions[i3 + 2] += Math.sin(elapsedTime * 0.4 + this.breathePhases[i]) * 0.001
      
      // 边界检查，让粒子在范围内循环
      const range = this.config.range
      if (this.positions[i3] > range.x / 2) this.positions[i3] = -range.x / 2
      if (this.positions[i3] < -range.x / 2) this.positions[i3] = range.x / 2
      if (this.positions[i3 + 1] > range.y / 2) this.positions[i3 + 1] = -range.y / 2
      if (this.positions[i3 + 1] < -range.y / 2) this.positions[i3 + 1] = range.y / 2
      if (this.positions[i3 + 2] > range.z / 2) this.positions[i3 + 2] = -range.z / 2
      if (this.positions[i3 + 2] < -range.z / 2) this.positions[i3 + 2] = range.z / 2
      
      // 呼吸效果 - 动态调整大小和透明度
      const breathe = Math.sin(elapsedTime * this.config.breatheFrequency + this.breathePhases[i])
      const breatheIntensity = (breathe + 1) / 2 // 转换为0-1范围
      
      // 大小变化（轻微的呼吸效果）
      this.sizes[i] = this.config.size * (0.8 + breatheIntensity * 0.4)
      
      // 透明度变化（明显的呼吸灯效果）
      this.opacities[i] = breatheIntensity * 0.9 + 0.1
    }
    
    // 更新几何体
    this.geometry.attributes.position.needsUpdate = true
    this.geometry.attributes.size.needsUpdate = true
    this.geometry.attributes.opacity.needsUpdate = true
  }

  // 设置可见性
  setVisible(visible: boolean) {
    this.points.visible = visible
  }

  // 获取可见性
  getVisible(): boolean {
    return this.points.visible
  }

  // 销毁
  dispose() {
    this.scene.remove(this.points)
    this.geometry.dispose()
    this.material.dispose()
    if (this.circleTexture) {
      this.circleTexture.dispose()
    }
  }

  // 更新配置
  updateConfig(config: Partial<FloatPointConfig>) {
    Object.assign(this.config, config)
    // 重新初始化
    this.dispose()
    this.init()
  }
}
