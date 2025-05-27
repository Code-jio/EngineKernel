# BaseScene 栈溢出问题修复指南

## 🚨 问题描述

插件注册时出现 "Maximum call stack size exceeded" 错误：

```
{
  name: 'BaseScene', 
  path: '/plugins/scene', 
  error: 'Maximum call stack size exceeded'
}
```

## 🔍 问题分析

栈溢出通常由以下原因导致：

### 1. 无限递归调用
- 函数直接或间接调用自己
- 没有正确的终止条件

### 2. 配置对象循环引用
- 配置对象中包含循环引用
- `JSON.parse(JSON.stringify())` 遇到循环引用时失败

### 3. 深度嵌套处理
- 配置对象嵌套过深
- 递归处理时超出调用栈限制

## 🛠️ 解决方案

### 1. 防止循环引用的深拷贝

**问题代码：**
```typescript
// 危险：无法处理循环引用
const result = JSON.parse(JSON.stringify(defaultConfig))
```

**修复代码：**
```typescript
private safeDeepClone(obj: any, visited = new WeakMap()): any {
    // 处理基本类型
    if (obj === null || typeof obj !== 'object') {
        return obj
    }
    
    // 检查循环引用
    if (visited.has(obj)) {
        return visited.get(obj)
    }
    
    // 安全处理各种类型...
}
```

### 2. 防止循环引用的配置合并

**问题代码：**
```typescript
// 危险：可能无限递归
const merge = (target: any, source: any): any => {
    for (const key in source) {
        if (typeof source[key] === 'object') {
            merge(target[key], source[key]) // 可能无限递归
        }
    }
}
```

**修复代码：**
```typescript
const merge = (target: any, source: any, visited = new WeakSet()): any => {
    // 防止循环引用
    if (visited.has(source)) {
        console.warn('⚠️ 检测到循环引用，跳过此配置项')
        return target
    }
    
    if (source && typeof source === 'object') {
        visited.add(source)
    }
    
    // 安全合并逻辑...
    
    if (source && typeof source === 'object') {
        visited.delete(source)
    }
}
```

### 3. 错误处理和回退机制

```typescript
constructor(meta: any) {
    try {
        // 防护：确保参数存在
        if (!meta) {
            meta = { userData: {} }
        }
        if (!meta.userData) {
            meta.userData = {}
        }
        
        // 安全的初始化逻辑...
        
    } catch (error: any) {
        console.error('❌ BaseScene初始化失败:', error)
        
        // 提供回退配置
        this.performanceMonitor = { /* 默认配置 */ }
        this.rendererAdvancedConfig = { /* 默认配置 */ }
        
        // 重新抛出错误
        const errorMessage = error instanceof Error ? error.message : String(error)
        throw new Error(`BaseScene构造失败: ${errorMessage}`)
    }
}
```

## ✅ 修复内容总结

### 1. 新增安全方法

- **`safeDeepClone()`**: 防循环引用的深拷贝
- **`mergeConfigs()`**: 防循环引用的配置合并
- **错误处理**: 完善的try-catch机制

### 2. 防护机制

- **参数验证**: 确保meta和userData存在
- **循环引用检测**: 使用WeakMap/WeakSet防止无限递归
- **回退配置**: 初始化失败时提供默认配置

### 3. 调试优化

- **清理重复日志**: 删除重复的console.log
- **详细错误信息**: 更好的错误报告
- **警告提示**: 循环引用时的友好提示

## 🧪 测试验证

创建了全面的测试用例：

1. **正常场景测试**
2. **循环引用测试**
3. **空/null配置测试**
4. **深度嵌套测试**
5. **所有预设测试**
6. **性能监控测试**
7. **内存泄漏测试**

## 📋 使用建议

### 1. 安全的创建方式

```typescript
// ✅ 推荐：使用静态工厂方法
const scene = BaseScene.createMinimal()

// ✅ 推荐：基于预设的自定义
const scene = BaseScene.createBalanced({
    cameraConfig: {
        position: [100, 100, 100]
    }
})
```

### 2. 避免的做法

```typescript
// ❌ 避免：循环引用配置
const config: any = { rendererConfig: {} }
config.self = config
config.rendererConfig.parent = config

// ❌ 避免：过度嵌套
const config = {
    level1: { level2: { level3: { /* 过深嵌套 */ } } }
}
```

### 3. 最佳实践

- 优先使用预设配置
- 只覆盖必要的配置项
- 避免深度嵌套配置
- 使用工厂方法创建场景
- 及时调用destroy()清理资源

## 🔧 调试技巧

### 1. 检查配置对象

```typescript
// 检查是否有循环引用
try {
    JSON.stringify(config)
    console.log('配置对象安全')
} catch (error) {
    console.error('配置对象包含循环引用')
}
```

### 2. 监控内存使用

```typescript
const scene = BaseScene.createBalanced()
scene.setPerformanceMonitorEnabled(true)

// 定期检查性能统计
setInterval(() => {
    const stats = scene.getPerformanceStats()
    console.log('内存使用:', {
        textures: stats.textures,
        geometries: stats.geometries,
        programs: stats.programs
    })
}, 5000)
```

### 3. 安全销毁

```typescript
try {
    scene.destroy()
    console.log('场景销毁成功')
} catch (error) {
    console.error('场景销毁失败:', error)
}
```

## 🚀 性能优化建议

1. **移动端**: 使用 `createHighPerformance()`
2. **桌面端**: 使用 `createBalanced()` 或 `createHighQuality()`
3. **开发调试**: 使用 `createDevelopment()`
4. **生产环境**: 关闭不必要的监控和调试功能

这次修复确保了BaseScene的稳定性和安全性，彻底解决了栈溢出问题。 