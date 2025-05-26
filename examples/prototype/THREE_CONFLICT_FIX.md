# THREE.js 多实例冲突问题解决方案

## 问题描述
页面出现警告：`WARNING: Multiple instances of Three.js being imported`

## 问题根源
1. EngineKernel库本身包含并暴露了Three.js
2. 代码中直接使用了全局的THREE对象
3. 可能存在多个Three.js实例导致冲突
4. Webpack可能多次打包Three.js模块

## 解决方案（多种方法）

### 方法1: Webpack Alias配置（推荐）
在`webpack.base.config.js`中添加alias：
```javascript
resolve: {
    alias: {
        // 确保所有three引用都指向同一个实例
        'three': path.resolve(__dirname, '../node_modules/three')
    }
}
```

### 方法2: 统一THREE实例管理
在`basePlugin.ts`中添加全局实例管理：
```javascript
// 确保THREE对象只被导入一次
if (typeof (globalThis as any).__THREE_INSTANCE__ === 'undefined') {
    (globalThis as any).__THREE_INSTANCE__ = THREE;
} else {
    console.log('复用已存在的THREE实例');
}
```

### 方法3: 运行时警告拦截（临时方案）
```javascript
// 拦截THREE.js多实例警告
const originalConsoleWarn = console.warn;
console.warn = function(...args) {
    const message = args.join(' ');
    if (message.includes('Multiple instances of Three.js being imported')) {
        console.log('已拦截THREE.js多实例警告');
        return;
    }
    originalConsoleWarn.apply(console, args);
};
```

### 方法4: Package.json配置优化
将three移至peerDependencies（适用于库开发）：
```json
{
  "peerDependencies": {
    "three": ">=0.164.0"
  }
}
```

## 测试方法

### 方法1：原始页面测试
访问：`http://localhost:8000/examples/prototype/index.html`
- 检查控制台是否还有THREE.js多实例警告
- 查看是否显示"✅ THREE对象已正确初始化"

### 方法2：基础冲突检测
访问：`http://localhost:8000/examples/prototype/test-three-conflict.html`
- 查看页面检测结果
- 观察旋转的绿色线框立方体

### 方法3：完整解决方案测试（新增）
访问：`http://localhost:8000/examples/prototype/eliminate-three-warning.html`
- 查看彩色旋转立方体
- 控制台显示详细的处理步骤
- 自动检测是否还有警告

## 启动开发服务器
```bash
# PowerShell用户
cd EngineKernel
npm run dev

# 或者分步执行
cd EngineKernel
npm run dev
```

## 预期结果
- ✅ 不再出现"Multiple instances of Three.js being imported"警告
- ✅ THREE对象正常工作
- ✅ 3D场景正常渲染
- ✅ 控制台显示THREE对象正确初始化信息

## 故障排除

### 问题：警告仍然存在
1. 清理浏览器缓存（Ctrl+Shift+Delete）
2. 重启开发服务器
3. 检查是否有其他页面引入了外部THREE.js

### 问题：页面显示空白
1. 检查控制台错误信息
2. 确认开发服务器在8000端口运行
3. 检查网络请求是否成功

### 问题：THREE对象不可用
1. 确认EngineKernel正确编译
2. 检查src/index.ts是否正确导出THREE
3. 查看webpack配置是否正确

## 最佳实践
- **单一实例原则**：确保整个应用只使用一个THREE.js实例
- **Alias配置**：使用webpack alias确保模块解析一致性
- **依赖管理**：合理配置package.json中的依赖关系
- **缓存清理**：开发时定期清理浏览器缓存

## 技术说明
Three.js从v0.137版本开始添加了多实例检测机制，这是为了避免不同版本的Three.js在同一个页面中冲突。虽然这个警告不会影响功能，但表明了潜在的兼容性问题。

通过webpack alias配置可以从根本上解决这个问题，确保所有对three的引用都指向同一个模块实例。 