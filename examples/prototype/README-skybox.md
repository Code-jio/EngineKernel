# SkyBox 插件使用说明

SkyBox插件为3D场景提供了多种类型的天空盒渲染功能，支持程序化天空、立方体贴图和环境贴图。

## 🌟 功能特性

- ✅ **程序化天空**：基于物理的大气散射算法，可调节太阳位置、大气参数
- ✅ **立方体贴图**：支持6面立方体贴图天空盒
- ✅ **环境贴图**：支持全景环境贴图
- ✅ **动态切换**：运行时可以切换不同类型的天空盒
- ✅ **参数调节**：实时调整天空参数，支持日夜循环效果
- ✅ **事件系统**：完整的加载状态和错误处理

## 📋 支持的天空盒类型

### 1. 程序化天空 (proceduralSky) - 推荐
基于Preetham大气散射模型实现的程序化天空，效果最为真实。

**配置参数：**
```javascript
{
    skyBoxType: "proceduralSky",
    turbidity: 10,        // 大气浑浊度 (1-20)
    rayleigh: 2,          // 瑞利散射系数 (0-4) 
    mieCoefficient: 0.005,// 米氏散射系数 (0-0.1)
    mieDirectionalG: 0.7, // 米氏散射方向性 (0-1)
    elevation: 15,        // 太阳高度角 (度)
    azimuth: 180,         // 太阳方位角 (度)
    exposure: 0.5,        // 曝光度 (0-1)
    size: 50000,          // 天空盒大小
}
```

### 2. 立方体贴图 (cubeTexture)
使用6张图片构成的立方体贴图。

**配置参数：**
```javascript
{
    skyBoxType: "cubeTexture",
    texturePaths: [
        '/path/to/px.jpg', // 正X
        '/path/to/nx.jpg', // 负X  
        '/path/to/py.jpg', // 正Y
        '/path/to/ny.jpg', // 负Y
        '/path/to/pz.jpg', // 正Z
        '/path/to/nz.jpg'  // 负Z
    ],
    size: 1000
}
```

### 3. 环境贴图 (environmentMap)
使用单张全景图片的环境贴图。

**配置参数：**
```javascript
{
    skyBoxType: "environmentMap", 
    envMapPath: '/path/to/panorama.jpg',
    size: 1000
}
```

## 🚀 基础用法

### 插件注册
```javascript
// 在BaseScene插件初始化之后注册
engine.register({
    name: "SkyBoxPlugin",
    path: "/plugins/webgl/skyBox",
    pluginClass: EngineKernel.SkyBox,
    userData: {
        scene: baseScene.scene,      // 必需：THREE.Scene实例
        camera: baseScene.camera,    // 必需：THREE.Camera实例  
        renderer: baseScene.renderer,// 必需：THREE.WebGLRenderer实例
        skyBoxType: "proceduralSky", // 天空盒类型
        // ...其他配置参数
    },
})
```

### 获取插件实例
```javascript
const skyBox = engine.getPlugin("SkyBoxPlugin")
```

## 📱 动态控制API

### 更新天空参数
```javascript
// 仅对程序化天空有效
skyBox.updateSkyConfig({
    turbidity: 15,
    elevation: 30,
    azimuth: 90,
    exposure: 0.8
})
```

### 切换天空盒类型
```javascript
// 切换到立方体贴图
skyBox.switchSkyBoxType("cubeTexture", {
    texturePaths: [/* 贴图路径 */]
})

// 切换到环境贴图  
skyBox.switchSkyBoxType("environmentMap", {
    envMapPath: "/path/to/panorama.jpg"
})

// 切换回程序化天空
skyBox.switchSkyBoxType("proceduralSky", {
    elevation: 45,
    azimuth: 180
})
```

### 获取状态信息
```javascript
const info = skyBox.getSkyBoxInfo()
console.log(info)
// {
//     type: "proceduralSky",
//     isLoaded: true,
//     config: { /* 当前配置 */ }
// }
```

### 控制可见性
```javascript
skyBox.setVisible(false) // 隐藏天空盒
skyBox.setVisible(true)  // 显示天空盒
```

## 🎯 事件监听

### 天空盒就绪事件
```javascript
EngineKernel.eventBus.on("skybox-ready", (data) => {
    console.log(`天空盒已就绪: ${data.type}`)
})
```

### 错误处理
```javascript
EngineKernel.eventBus.on("skybox-error", (error) => {
    console.error("天空盒加载失败:", error)
})
```

## 🌅 日夜循环示例

```javascript
// 模拟日夜循环
let time = 0
function animateSky() {
    time += 0.01
    const elevation = Math.sin(time) * 90 // -90到90度
    const azimuth = (time * 10) % 360     // 0到360度
    
    skyBox.updateSkyConfig({
        elevation: elevation,
        azimuth: azimuth,
        exposure: Math.max(0.1, Math.sin(time) * 0.8 + 0.5)
    })
    
    requestAnimationFrame(animateSky)
}
animateSky()
```

## ⚠️ 注意事项

1. **插件顺序**：SkyBox插件必须在BaseScene插件之后注册
2. **资源路径**：确保贴图文件路径正确且可访问
3. **性能考虑**：程序化天空的着色器计算较复杂，在移动设备上可能需要调整参数
4. **尺寸设置**：天空盒size参数应该比场景中最远物体距离更大
5. **渲染器设置**：程序化天空会自动设置渲染器的色调映射和曝光参数

## 🎨 推荐参数组合

### 晴朗白天
```javascript
{
    turbidity: 2,
    rayleigh: 2,
    elevation: 60,
    azimuth: 180,
    exposure: 0.5
}
```

### 夕阳/日出
```javascript
{
    turbidity: 10,
    rayleigh: 1,
    elevation: 5,
    azimuth: 90,
    exposure: 0.8
}
```

### 阴霾天气
```javascript
{
    turbidity: 20,
    rayleigh: 0.5,
    elevation: 30,
    azimuth: 180,
    exposure: 0.3
}
``` 