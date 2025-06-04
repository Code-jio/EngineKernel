# ResourceReaderPlugin 默认参数配置

## 概述

ResourceReaderPlugin现在提供了完善的默认参数系统，让插件的使用更加简单和可靠。系统提供了多种预设配置和自动验证功能。

## 🚀 快速开始

### 最简单的使用方式
```typescript
// 使用默认配置，适合大多数场景
const plugin = ResourceReaderPlugin.create()
```

### 自定义配置
```typescript
// 只修改需要的参数，其他使用默认值
const plugin = ResourceReaderPlugin.create({
  maxCacheSize: 200 * 1024 * 1024, // 200MB缓存
  dracoPath: '/assets/draco/'       // 自定义DRACO路径
})
```

## 📋 默认配置

```typescript
{
  url: '',                           // 基础URL
  maxCacheSize: 100 * 1024 * 1024,  // 100MB缓存
  maxConcurrentLoads: 3,             // 最大并发加载数
  enableDraco: true,                 // 启用DRACO解压
  dracoPath: '/draco/',              // DRACO解码器路径
  supportedFormats: ['gltf', 'glb'], // 支持的格式
  autoDispose: true                  // 自动释放过期资源
}
```

## 🛠️ 预设配置方法

### 1. 默认配置 (推荐)
```typescript
const plugin = ResourceReaderPlugin.create()
```
- ✅ 启用DRACO解压
- ✅ 100MB缓存
- ✅ 3个并发加载
- ✅ 自动资源清理
- ✅ 适合大多数Web应用

### 2. 基础配置 (轻量模式)
```typescript
const plugin = ResourceReaderPlugin.createBasic()
```
- ✅ 更快的初始化
- ✅ 更小的内存占用
- ❌ 不支持压缩模型
- ✅ 适合原型开发和快速测试

### 3. 高性能配置
```typescript
const plugin = ResourceReaderPlugin.createHighPerformance()
```
- ✅ 500MB大缓存
- ✅ 6个并发加载
- ✅ 禁用自动清理
- ✅ 适合游戏和大量模型应用

### 4. 传统构造函数 (兼容性)
```typescript
const plugin = new ResourceReaderPlugin({
  enableDraco: true,
  maxCacheSize: 50 * 1024 * 1024
})
```

## 🔍 配置验证功能

### 自动修正
系统会自动修正不合理的配置：

```typescript
// 缓存大小验证
if (maxCacheSize < 10MB) → 调整为 10MB
if (maxCacheSize > 2GB) → 调整为 2GB

// 并发数验证
if (maxConcurrentLoads < 1) → 调整为 1

// 路径标准化
dracoPath: '/draco' → '/draco/'

// 格式验证
supportedFormats: [] → ['gltf', 'glb']
```

### 性能警告
```typescript
if (maxConcurrentLoads > 10) {
  console.warn('⚠️ 并发数过大可能影响性能，建议不超过10')
}
```

## 🎯 使用场景

### 移动设备/低配置
```typescript
const plugin = ResourceReaderPlugin.create({
  maxCacheSize: 50 * 1024 * 1024,  // 50MB
  maxConcurrentLoads: 2            // 降低并发
})
```

### 桌面应用/高配置
```typescript
const plugin = ResourceReaderPlugin.createHighPerformance({
  maxCacheSize: 1024 * 1024 * 1024 // 1GB
})
```

### Web应用/通用
```typescript
const plugin = ResourceReaderPlugin.create() // 默认配置
```

### 原型开发/快速测试
```typescript
const plugin = ResourceReaderPlugin.createBasic() // 禁用DRACO
```

### 游戏/大量模型
```typescript
const plugin = ResourceReaderPlugin.createHighPerformance({
  autoDispose: false,              // 保持缓存
  maxConcurrentLoads: 8            // 高并发
})
```

## 📊 配置参数详解

### 基本参数
- **url**: `string` - 模型文件的基础URL路径
- **maxCacheSize**: `number` - 最大缓存大小(字节)，默认100MB
- **maxConcurrentLoads**: `number` - 最大并发加载数，默认3个

### DRACO相关
- **enableDraco**: `boolean` - 是否启用DRACO解压，默认true
- **dracoPath**: `string` - DRACO解码器文件路径，默认'/draco/'

### 功能控制
- **supportedFormats**: `string[]` - 支持的文件格式，默认['gltf', 'glb']
- **autoDispose**: `boolean` - 自动释放过期资源，默认true

## 🔧 调试信息

插件初始化时会输出配置信息：
```
🔧 ResourceReaderPlugin配置: {
  baseUrl: "(无)",
  maxCacheSize: "100.0MB",
  maxConcurrentLoads: 3,
  enableDraco: true,
  dracoPath: "/draco/",
  supportedFormats: ["gltf", "glb"],
  autoDispose: true
}
```

## ⚡ 性能建议

### 缓存大小设置
- **移动设备**: 50-100MB
- **桌面应用**: 100-500MB
- **高性能应用**: 500MB-1GB
- **内存受限**: 20-50MB

### 并发数设置
- **低配置设备**: 1-2个
- **普通设备**: 3-4个
- **高性能设备**: 4-6个
- **服务器应用**: 6-10个

### DRACO配置
- **Web应用**: 启用 (减少传输时间)
- **本地应用**: 可选 (减少解压开销)
- **快速原型**: 禁用 (简化部署)

## 🔄 配置更新

### 运行时获取配置
```typescript
const info = plugin.getLoaderInfo()
console.log(info) // { dracoEnabled, dracoPath, supportedFormats }

const status = plugin.getCacheStatus()
console.log(status) // { size, maxSize, itemCount, utilization, dracoEnabled }
```

### 动态调整
```typescript
// 清理缓存
plugin.clearCache()

// 释放特定资源
plugin.disposeResource('/model/example.gltf')
```

## 🚨 常见问题

### Q: 如何选择合适的配置？
A: 大多数情况下使用`ResourceReaderPlugin.create()`即可。根据设备性能和应用场景选择预设配置。

### Q: DRACO解压失败怎么办？
A: 检查`/draco/`目录是否存在必需文件，或使用`createBasic()`禁用DRACO。

### Q: 缓存占用太多内存？
A: 减少`maxCacheSize`或启用`autoDispose`自动清理。

### Q: 加载速度慢？
A: 增加`maxConcurrentLoads`并确保网络连接良好。

## 📈 升级指南

### 从旧版本升级
- 旧的构造函数方式仍然支持
- 建议使用新的静态工厂方法
- 配置参数自动验证和修正

### API兼容性
```typescript
// 旧方式 (仍然支持)
new ResourceReaderPlugin({ enableDraco: true })

// 新方式 (推荐)
ResourceReaderPlugin.create({ enableDraco: true })
```

## 🎉 总结

默认参数系统的优势：
- **简化使用**: 大多数场景只需一行代码
- **智能验证**: 自动修正不合理配置
- **预设配置**: 针对不同场景的优化配置
- **向后兼容**: 保持与旧版本的兼容性
- **调试友好**: 清晰的配置输出和警告信息

推荐在新项目中使用`ResourceReaderPlugin.create()`开始，根据实际需求调整配置参数。 