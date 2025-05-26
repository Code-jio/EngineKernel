// 初始化引擎核心
const engine = new EngineKernel.BaseCore({
    pluginsParams: [
        {
            name: "BaseScene",
            path: "/plugins/scene",
            pluginClass: EngineKernel.BaseScene,
            userData: {
                rendererConfig: {
                    container: document.getElementById("renderer"),
                    antialias: true,
                    alpha: false,
                    clearColor: 0x444444,
                },
                cameraConfig: {
                    type: "perspective",
                    fov: 45,
                    near: 0.1,
                    far: 1000,
                    position: [0, 5, 10],
                    lookAt: [0, 0, 0],
                },
                lightConfig: {
                    ambientLight: {
                        color: 0xffffff,
                        intensity: 0.5,
                    },
                    directionalLight: {
                        color: 0xffffff,
                        intensity: 1,
                        position: [10, 10, 10],
                    },
                },
            },
        },
    ],
});

// 添加资源读取插件
engine.register({
    name: "ResourceReader",
    path: "/plugins/webgl/resourceReaderPlugin",
    pluginClass: EngineKernel.ResourceReaderPlugin,
    userData: {
        baseUrl: "./public",
        supportedFormats: ["gltf", "fbx", "jpg", "png", "hdr", "env"]
    }
});

// 添加轨道控制器插件
engine.register({
    name: "OrbitControls",
    path: "/plugins/webgl/orbitControl",
    pluginClass: EngineKernel.orbitControls,
    userData: {
        camera: engine.getPlugin("BaseScene").camera,
        domElement: engine.getPlugin("BaseScene").renderer.domElement,
    },
});

// DOM元素
const loadingOverlay = document.getElementById('loading-overlay');
const loadingText = document.getElementById('loading-text');
const statusEl = document.getElementById('status');

// 更新状态
function updateStatus(message) {
    statusEl.textContent = message;
}

// 添加资源到列表
function addResourceToList(type, name, status = 'loading') {
    const listEl = document.getElementById(`${type}-list`);
    
    // 检查是否已存在
    const existingItem = document.getElementById(`${type}-${name}`);
    if (existingItem) {
        existingItem.className = status;
        existingItem.textContent = `${name} (${status})`;
        return;
    }
    
    const li = document.createElement('li');
    li.id = `${type}-${name}`;
    li.className = status;
    li.textContent = `${name} (${status})`;
    listEl.appendChild(li);
}

// 显示资源加载进度
function updateProgress(progress) {
    loadingText.textContent = `资源加载中... ${Math.round(progress * 100)}%`;
    
    if (progress >= 1) {
        setTimeout(() => {
            loadingOverlay.style.display = 'none';
        }, 500);
    }
}

// 监听事件
function setupEventListeners() {
    // 模型加载完成事件
    EngineKernel.eventBus.on('MODEL_READY', (data) => {
        const { resource, path } = data;
        const name = path.split('/').pop();
        addResourceToList('models', name, 'loaded');
        updateStatus(`已加载模型: ${name}`);
    });
    
    // 纹理加载完成事件
    EngineKernel.eventBus.on('TEXTURE_READY', (data) => {
        const { resource, path } = data;
        const name = path.split('/').pop();
        addResourceToList('textures', name, 'loaded');
        updateStatus(`已加载纹理: ${name}`);
    });
    
    // 天空盒加载完成事件
    EngineKernel.eventBus.on('SKYBOX_READY', (data) => {
        addResourceToList('skybox', 'skybox', 'loaded');
        updateStatus('已加载天空盒');
    });
    
    // 地图数据加载完成事件
    EngineKernel.eventBus.on('MAP_READY', (data) => {
        const { resource, path } = data;
        const name = path.split('/').pop();
        addResourceToList('maps', name, 'loaded');
        updateStatus(`已加载地图数据: ${name}`);
    });
    
    // 加载进度事件
    EngineKernel.eventBus.on('RESOURCE_LOAD_PROGRESS', (data) => {
        const { progress } = data;
        updateProgress(progress);
    });
    
    // 加载错误事件
    EngineKernel.eventBus.on('LOAD_ERROR', (error) => {
        console.error('资源加载错误:', error);
        updateStatus(`加载错误: ${error.message || '未知错误'}`);
    });
    
    // 所有资源加载完成事件
    EngineKernel.eventBus.on('RESOURCES_LOAD_COMPLETE', (data) => {
        updateStatus(`所有资源加载完成，共 ${data.totalLoaded} 项`);
        updateProgress(1);
    });
}

// 初始化应用
async function init() {
    setupEventListeners();
    updateStatus('开始加载资源...');
    
    try {
        // 预先添加资源到列表
        const response = await fetch('./public/index.json');
        const data = await response.json();
        
        if (data.models) {
            data.models.forEach(model => addResourceToList('models', model));
        }
        if (data.textures) {
            data.textures.forEach(texture => addResourceToList('textures', texture));
        }
        if (data.skybox) {
            addResourceToList('skybox', 'skybox');
        }
        if (data.maps) {
            data.maps.forEach(map => addResourceToList('maps', map));
        }
        
        // 开始加载资源
        const resourceReader = engine.getPlugin("ResourceReader");
        
        // 加载模型
        if (data.models) {
            for (const modelPath of data.models) {
                resourceReader.loadModel(modelPath);
            }
        }
        
        // 加载纹理
        if (data.textures) {
            for (const texturePath of data.textures) {
                resourceReader.loadTexture(texturePath);
            }
        }
        
        // 加载天空盒
        if (data.skybox) {
            resourceReader.loadSkybox(data.skybox);
        }
        
        // 加载地图
        if (data.maps) {
            for (const mapPath of data.maps) {
                resourceReader.loadMap(mapPath);
            }
        }
    } catch (error) {
        console.error('无法获取或加载资源:', error);
        updateStatus('资源加载失败');
    }
}

// 启动应用
init();
