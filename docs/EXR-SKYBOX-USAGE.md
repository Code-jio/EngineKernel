# EXR格式天空盒使用指南

## 概述

现在SkyBox插件同时支持HDR (.hdr, .pic) 和 EXR (.exr) 格式的全景贴图。EXR格式提供更高的动态范围和更好的数据精度。

## 支持的格式

- **HDR格式**: .hdr, .pic (使用RGBELoader)
- **EXR格式**: .exr (使用EXRLoader)
  - 支持压缩格式: uncompressed, ZIP(S), RLE, PIZ, DWA/B
  - 支持数据类型: HalfFloat (默认), Float

## 使用方法

### 1. 使用EXR文件

```typescript
const skybox = new SkyBox({
    userData: {
        scene: scene,
        camera: camera,
        renderer: renderer,
        skyBoxType: SkyBoxType.HDR_ENVIRONMENT,
        exrMapPath: '/path/to/environment.exr',
        exrIntensity: 1.0,
        exrDataType: 'HalfFloat' // 或 'Float'
    }
});
```

### 2. 使用HDR文件

```typescript
const skybox = new SkyBox({
    userData: {
        scene: scene,
        camera: camera,
        renderer: renderer,
        skyBoxType: SkyBoxType.HDR_ENVIRONMENT,
        hdrMapPath: '/path/to/environment.hdr',
        hdrIntensity: 1.0
    }
});
```

### 3. 通用环境贴图路径（自动检测格式）

```typescript
const skybox = new SkyBox({
    userData: {
        scene: scene,
        camera: camera,
        renderer: renderer,
        skyBoxType: SkyBoxType.HDR_ENVIRONMENT,
        envMapPath: '/path/to/environment.exr', // 或 .hdr
        intensity: 1.0,
        exrDataType: 'HalfFloat' // 仅对EXR文件有效
    }
});
```

## 配置选项

### EXR专用选项

- `exrMapPath`: EXR文件路径
- `exrIntensity`: EXR强度 (默认: 1.0)
- `exrDataType`: 数据类型
  - `'HalfFloat'`: 半精度浮点 (默认，节省内存)
  - `'Float'`: 单精度浮点 (更高精度)

### HDR专用选项

- `hdrMapPath`: HDR文件路径
- `hdrIntensity`: HDR强度 (默认: 1.0)

### 通用选项

- `envMapPath`: 环境贴图路径 (自动检测格式)
- `intensity`: 通用强度设置

## 特性

### 自动格式检测

系统会根据文件扩展名自动选择合适的加载器：
- `.exr` → EXRLoader
- `.hdr`, `.pic` → RGBELoader

### 内存优化

EXR文件默认使用HalfFloat数据类型以节省GPU内存，同时保持良好的质量。

### 高动态范围

EXR格式支持真正的高动态范围数据，提供更准确的光照信息。

## 事件

加载完成后会触发事件：

```typescript
eventBus.on("skybox-ready", (data) => {
    console.log("天空盒就绪:", data.format); // 'HDR' 或 'EXR'
    console.log("强度:", data.intensity);
    console.log("纹理:", data.texture);
});
```

## 错误处理

```typescript
eventBus.on("skybox-error", (error) => {
    console.error("天空盒加载失败:", error);
});
```

## 性能建议

1. **内存使用**: 对于大型EXR文件，建议使用HalfFloat数据类型
2. **文件大小**: EXR文件通常比HDR文件更大，但压缩效果更好
3. **加载时间**: EXR文件的解压缩可能需要更多时间，建议显示加载进度

## 兼容性

- Three.js r167+
- 支持WebGL和WebGPU渲染器
- 现代浏览器环境 