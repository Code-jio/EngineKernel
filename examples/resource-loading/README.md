# 资源读取插件示例

这个示例展示了如何使用 `ResourceReaderPlugin` 插件来加载和管理3D资源，包括模型、纹理、天空盒和地图数据。

## 功能特点

1. **异步任务队列** - 防止线程阻塞，按顺序加载资源
2. **ServiceWorker缓存** - 使用ServiceWorker缓存已加载的资源
3. **分类加载** - 根据资源类型分配不同的加载任务
4. **事件驱动** - 通过eventBus发布资源加载事件
5. **进度跟踪** - 实时显示资源加载进度

## 如何运行

要运行此示例，请使用以下命令：

```bash
# 在项目根目录下执行
npm install
npm run dev

# 然后访问 http://localhost:8080/examples/resource-loading/
```

## 目录结构

```
examples/resource-loading/
├── public/               # 资源文件夹
│   ├── models/           # 3D模型文件
│   ├── textures/         # 纹理图片
│   ├── skybox/           # 天空盒贴图
│   ├── maps/             # 地图数据文件
│   ├── service-worker.js # ServiceWorker脚本
│   └── index.json        # 资源索引文件
├── index.html            # 示例HTML页面
├── style.css             # 样式文件
├── index.js              # 示例主JavaScript代码
└── README.md             # 说明文档
```

## 示例说明

这个示例演示了如何：

1. 初始化 `ResourceReaderPlugin` 插件并指定资源目录
2. 监听各种资源加载事件（MODEL_READY, TEXTURE_READY等）
3. 处理不同类型的资源（GLTF模型、纹理、天空盒、地图数据）
4. 显示加载进度和加载状态
5. 将加载的资源添加到Three.js场景中

## 添加自己的资源

要添加自己的资源进行测试：

1. 将模型文件放入 `public/models/` 目录
2. 将纹理图片放入 `public/textures/` 目录
3. 将天空盒图片放入 `public/skybox/` 目录
4. 将地图数据放入 `public/maps/` 目录
5. 更新 `public/index.json` 文件，添加新资源的文件名

## 注意事项

- 示例中使用了模拟数据，实际运行时可能没有真实的资源文件
- ServiceWorker需要在HTTPS环境下运行，开发时可使用localhost
- 如果资源文件过大，可能需要调整ServiceWorker中的缓存策略 