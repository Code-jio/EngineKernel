import { ParticleEmitter, ParticleType, ParticleConfig } from "../src/plugins/webgl/ParticleEmitter"
import { BaseScene } from "../src/plugins/webgl/baseScene"
import { THREE } from "../src/utils/three-imports"

/**
 * 粒子发射器使用示例
 */

/**
 * 基础使用示例
 */
export function basicParticleExample(scene: BaseScene) {
    console.log("🎆 创建基础粒子发射器示例")
    
    // 创建一个简单的火焰粒子发射器
    const fireEmitter = new ParticleEmitter({
        userData: {
            scene: scene.sceneInstance,
            camera: scene.cameraInstance,
            renderer: scene.rendererInstance,
            config: ParticleEmitter.createFireEmitter({
                position: [0, 0, 0],
                maxParticles: 500,
                emissionRate: 80,
                debugMode: true
            })
        }
    })
    
    // 初始化发射器
    fireEmitter.init()
    
    return fireEmitter
}

/**
 * 高级多粒子系统示例
 */
export function advancedParticleExample(scene: BaseScene) {
    console.log("🎭 创建高级多粒子系统示例")
    
    const particleEmitters: ParticleEmitter[] = []
    
    // 1. 创建篝火效果 (火焰 + 烟雾 + 火花)
    const campfirePosition = new THREE.Vector3(0, 0, 0)
    
    // 主火焰
    const mainFire = new ParticleEmitter({
        userData: {
            scene: scene.sceneInstance,
            camera: scene.cameraInstance,
            renderer: scene.rendererInstance,
            config: ParticleEmitter.createFireEmitter({
                position: campfirePosition.clone(),
                maxParticles: 800,
                emissionRate: 120,
                particleLifetime: 2.5,
                startSize: 1.0,
                endSize: 0.1,
                velocity: new THREE.Vector3(0, 8, 0),
                acceleration: new THREE.Vector3(0, -2, 0),
                velocityRandomness: 1.5,
                emissionShape: 'cone',
                emissionRadius: 1.5,
                emissionAngle: Math.PI / 8
            })
        }
    })
    
    // 烟雾
    const smoke = new ParticleEmitter({
        userData: {
            scene: scene.sceneInstance,
            camera: scene.cameraInstance,
            renderer: scene.rendererInstance,
            config: ParticleEmitter.createSmokeEmitter({
                position: campfirePosition.clone().add(new THREE.Vector3(0, 5, 0)),
                maxParticles: 300,
                emissionRate: 30,
                particleLifetime: 8.0,
                startSize: 0.5,
                endSize: 4.0,
                velocity: new THREE.Vector3(0, 3, 0),
                acceleration: new THREE.Vector3(0.2, 0.5, 0), // 轻微的风向
                velocityRandomness: 2.0,
                emissionShape: 'sphere',
                emissionRadius: 1.0
            })
        }
    })
    
    // 火花
    const sparks = new ParticleEmitter({
        userData: {
            scene: scene.sceneInstance,
            camera: scene.cameraInstance,
            renderer: scene.rendererInstance,
            config: {
                position: campfirePosition.clone(),
                maxParticles: 200,
                emissionRate: 50,
                particleLifetime: 1.5,
                particleType: ParticleType.SPARK,
                startColor: new THREE.Color(0xffaa00),
                endColor: new THREE.Color(0xff2200),
                startSize: 0.3,
                endSize: 0.1,
                velocity: new THREE.Vector3(0, 12, 0),
                acceleration: new THREE.Vector3(0, -15, 0),
                velocityRandomness: 4.0,
                emissionShape: 'cone',
                emissionRadius: 0.5,
                emissionAngle: Math.PI / 3,
                blendMode: THREE.AdditiveBlending,
                renderOrder: 140,
                enableFrustumCulling: true,
                enableLOD: true
            }
        }
    })
    
    // 2. 创建魔法传送门效果
    const portalPosition = new THREE.Vector3(10, 0, 0)
    
    const magicPortal = new ParticleEmitter({
        userData: {
            scene: scene.sceneInstance,
            camera: scene.cameraInstance,
            renderer: scene.rendererInstance,
            config: ParticleEmitter.createMagicEmitter({
                position: portalPosition.clone(),
                maxParticles: 600,
                emissionRate: 100,
                particleLifetime: 4.0,
                startSize: 0.2,
                endSize: 1.5,
                velocity: new THREE.Vector3(0, 0, 0),
                acceleration: new THREE.Vector3(0, 0, 0),
                velocityRandomness: 0.5,
                emissionShape: 'sphere',
                emissionRadius: 3.0,
                angularVelocity: 3.0
            })
        }
    })
    
    // 3. 创建水花效果
    const fountainPosition = new THREE.Vector3(-10, 0, 0)
    
    const waterFountain = new ParticleEmitter({
        userData: {
            scene: scene.sceneInstance,
            camera: scene.cameraInstance,
            renderer: scene.rendererInstance,
            config: {
                position: fountainPosition.clone(),
                maxParticles: 1000,
                emissionRate: 200,
                particleLifetime: 3.0,
                particleType: ParticleType.WATER,
                startColor: new THREE.Color(0x4488ff),
                endColor: new THREE.Color(0x2244aa),
                startSize: 0.3,
                endSize: 0.1,
                velocity: new THREE.Vector3(0, 15, 0),
                acceleration: new THREE.Vector3(0, -20, 0),
                velocityRandomness: 3.0,
                emissionShape: 'cone',
                emissionRadius: 0.3,
                emissionAngle: Math.PI / 12,
                blendMode: THREE.NormalBlending,
                renderOrder: 170,
                opacity: 0.8
            }
        }
    })
    
    // 初始化所有发射器
    const emitters = [mainFire, smoke, sparks, magicPortal, waterFountain]
    
    emitters.forEach(async (emitter, index) => {
        await emitter.init()
        particleEmitters.push(emitter)
        console.log(`✅ 粒子发射器 ${index + 1} 初始化完成`)
    })
    
    return particleEmitters
}

/**
 * 性能优化示例
 */
export function performanceOptimizedParticleExample(scene: BaseScene) {
    console.log("⚡ 创建性能优化粒子系统示例")
    
    // 移动端优化配置
    const mobileOptimizedConfig: Partial<ParticleConfig> = {
        maxParticles: 300,        // 减少粒子数量
        emissionRate: 50,         // 降低发射速率
        enableLOD: true,          // 启用LOD
        enableFrustumCulling: true, // 启用视锥剔除
        updateFrequency: 0.7,     // 降低更新频率
        maxDistance: 50,          // 减少渲染距离
        billboardMode: true       // 启用billboard优化
    }
    
    // 桌面端高质量配置
    const desktopOptimizedConfig: Partial<ParticleConfig> = {
        maxParticles: 2000,       // 更多粒子
        emissionRate: 300,        // 更高发射速率
        enableLOD: true,
        enableFrustumCulling: true,
        updateFrequency: 1.0,     // 全频率更新
        maxDistance: 200,         // 更远渲染距离
        billboardMode: true
    }
    
    // 根据设备性能选择配置
    const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    const config = isMobile ? mobileOptimizedConfig : desktopOptimizedConfig
    
    console.log(`📱 检测到${isMobile ? '移动' : '桌面'}设备，应用相应优化`)
    
    const optimizedEmitter = new ParticleEmitter({
        userData: {
            scene: scene.sceneInstance,
            camera: scene.cameraInstance,
            renderer: scene.rendererInstance,
            config: {
                ...ParticleEmitter.createFireEmitter(),
                ...config,
                debugMode: true
            }
        }
    })
    
    optimizedEmitter.init()
    
    // 性能监控
    setInterval(() => {
        const stats = optimizedEmitter.getPerformanceStats()
        console.log('📊 粒子系统性能统计:', stats)
    }, 5000)
    
    return optimizedEmitter
}

/**
 * 交互式粒子控制示例
 */
export function interactiveParticleExample(scene: BaseScene) {
    console.log("🎮 创建交互式粒子控制示例")
    
    const interactiveEmitter = new ParticleEmitter({
        userData: {
            scene: scene.sceneInstance,
            camera: scene.cameraInstance,
            renderer: scene.rendererInstance,
            config: ParticleEmitter.createMagicEmitter({
                position: [0, 2, 0],
                debugMode: true
            })
        }
    })
    
    interactiveEmitter.init()
    
    // 创建控制面板
    const controls = createParticleControls(interactiveEmitter)
    
    return { emitter: interactiveEmitter, controls }
}

/**
 * 创建粒子控制面板
 */
function createParticleControls(emitter: ParticleEmitter) {
    const controlPanel = document.createElement('div')
    controlPanel.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        background: rgba(0,0,0,0.8);
        color: white;
        padding: 15px;
        border-radius: 8px;
        font-family: Arial, sans-serif;
        z-index: 1000;
        min-width: 200px;
    `
    
    controlPanel.innerHTML = `
        <h3>🎆 粒子控制</h3>
        <div>
            <label>发射速率: <span id="rateValue">100</span></label><br>
            <input type="range" id="emissionRate" min="0" max="500" value="100" style="width: 100%">
        </div>
        <div style="margin-top: 10px;">
            <button id="startBtn">▶️ 开始</button>
            <button id="stopBtn">⏹️ 停止</button>
            <button id="clearBtn">🧹 清空</button>
        </div>
        <div style="margin-top: 10px;">
            <button id="debugBtn">🔍 调试模式</button>
        </div>
        <div id="stats" style="margin-top: 10px; font-size: 12px;"></div>
    `
    
    document.body.appendChild(controlPanel)
    
    // 绑定事件
    const rateSlider = document.getElementById('emissionRate') as HTMLInputElement
    const rateValue = document.getElementById('rateValue') as HTMLSpanElement
    const startBtn = document.getElementById('startBtn') as HTMLButtonElement
    const stopBtn = document.getElementById('stopBtn') as HTMLButtonElement
    const clearBtn = document.getElementById('clearBtn') as HTMLButtonElement
    const debugBtn = document.getElementById('debugBtn') as HTMLButtonElement
    const statsDiv = document.getElementById('stats') as HTMLDivElement
    
    rateSlider.addEventListener('input', () => {
        const rate = parseInt(rateSlider.value)
        rateValue.textContent = rate.toString()
        emitter.setEmissionRate(rate)
    })
    
    startBtn.addEventListener('click', () => emitter.startEmission())
    stopBtn.addEventListener('click', () => emitter.stopEmission())
    clearBtn.addEventListener('click', () => emitter.clearAllParticles())
    debugBtn.addEventListener('click', () => emitter.enableDebugMode())
    
    // 实时统计更新
    setInterval(() => {
        const stats = emitter.getPerformanceStats()
        statsDiv.innerHTML = `
            活跃粒子: ${stats.activeParticles}/${stats.maxParticles}<br>
            利用率: ${(stats.particleUtilization * 100).toFixed(1)}%<br>
            LOD级别: ${(stats.lodLevel * 100).toFixed(0)}%<br>
            发射状态: ${stats.isEmitting ? '🟢' : '🔴'}
        `
    }, 1000)
    
    return {
        panel: controlPanel,
        cleanup: () => document.body.removeChild(controlPanel)
    }
}

/**
 * 粒子预设切换示例
 */
export function particlePresetsExample(scene: BaseScene) {
    console.log("🎨 创建粒子预设切换示例")
    
    let currentEmitter: ParticleEmitter | null = null
    
    // 预设配置
    const presets = {
        fire: () => ParticleEmitter.createFireEmitter(),
        smoke: () => ParticleEmitter.createSmokeEmitter(),
        magic: () => ParticleEmitter.createMagicEmitter(),
        custom: (): ParticleConfig => ({
            position: [0, 0, 0],
            maxParticles: 600,
            emissionRate: 150,
            particleLifetime: 4.0,
            particleType: ParticleType.CUSTOM,
            startColor: new THREE.Color(0x00ff88),
            endColor: new THREE.Color(0x0088ff),
            startSize: 0.5,
            endSize: 2.0,
            velocity: new THREE.Vector3(0, 0, 0),
            acceleration: new THREE.Vector3(0, 1, 0),
            velocityRandomness: 5.0,
            emissionShape: 'sphere',
            emissionRadius: 2.0,
            emissionAngle: Math.PI / 4,
            angularVelocity: 4.0,
            blendMode: THREE.AdditiveBlending,
            renderOrder: 190,
            enableFrustumCulling: true,
            enableLOD: true,
            billboardMode: true,
            depthWrite: false,
            opacity: 0.8,
            updateFrequency: 1.0,
            maxDistance: 100,
            debugMode: false
        })
    }
    
    // 创建预设切换按钮
    const presetPanel = document.createElement('div')
    presetPanel.style.cssText = `
        position: fixed;
        top: 10px;
        left: 10px;
        background: rgba(0,0,0,0.8);
        color: white;
        padding: 15px;
        border-radius: 8px;
        font-family: Arial, sans-serif;
        z-index: 1000;
    `
    
    presetPanel.innerHTML = `
        <h3>🎨 粒子预设</h3>
        <button data-preset="fire">🔥 火焰</button>
        <button data-preset="smoke">💨 烟雾</button>
        <button data-preset="magic">✨ 魔法</button>
        <button data-preset="custom">🌟 自定义</button>
    `
    
    document.body.appendChild(presetPanel)
    
    // 绑定点击事件
    presetPanel.addEventListener('click', async (e) => {
        const target = e.target as HTMLButtonElement
        const presetName = target.dataset.preset
        
        if (presetName && presets[presetName as keyof typeof presets]) {
            // 清理当前发射器
            if (currentEmitter) {
                currentEmitter.dispose()
            }
            
            // 创建新发射器
            const config = presets[presetName as keyof typeof presets]()
            currentEmitter = new ParticleEmitter({
                userData: {
                    scene: scene.sceneInstance,
                    camera: scene.cameraInstance,
                    renderer: scene.rendererInstance,
                    config: { ...config, debugMode: true }
                }
            })
            
            await currentEmitter.init()
            console.log(`🎆 切换到${presetName}粒子预设`)
        }
    })
    
    // 默认加载火焰预设
    setTimeout(() => {
        const fireBtn = presetPanel.querySelector('[data-preset="fire"]') as HTMLButtonElement
        fireBtn.click()
    }, 100)
    
    return {
        panel: presetPanel,
        getCurrentEmitter: () => currentEmitter,
        cleanup: () => {
            if (currentEmitter) currentEmitter.dispose()
            document.body.removeChild(presetPanel)
        }
    }
}

/**
 * 完整示例运行函数
 */
export function runParticleEmitterExample() {
    console.log("🚀 运行粒子发射器完整示例")
    
    // 创建基础场景
    const scene = BaseScene.createBalanced()
    
    // 可以选择运行不同的示例
    // const basicEmitter = basicParticleExample(scene)
    // const advancedEmitters = advancedParticleExample(scene)
    // const optimizedEmitter = performanceOptimizedParticleExample(scene)
    const interactiveExample = interactiveParticleExample(scene)
    const presetsExample = particlePresetsExample(scene)
    
    console.log("✅ 粒子发射器示例运行完成")
    console.log("💡 使用右侧控制面板调整粒子参数")
    console.log("💡 使用左侧按钮切换粒子预设")
    
    // 返回清理函数
    return () => {
        interactiveExample.controls.cleanup()
        presetsExample.cleanup()
        interactiveExample.emitter.dispose()
        scene.destroy()
        console.log("🧹 粒子发射器示例已清理")
    }
} 