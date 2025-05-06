// 模型加载流程管理器核心类
// 后续转变为插件：考虑好所负职责、资源加载插件区分
import eventBus from '../eventBus/eventBus';

export class PipelineManager {
  private stages: { [key: string]: Function[] } = {
    'preload': [],
    'cache': [],
    'lod': [],
    'model': [],
    'postprocess': []
  };

  constructor() {
    this.setupEventListeners();
  }

  private setupEventListeners() {
    eventBus.on('RESOURCE_LOAD_START', this.handleLoadStart);
    eventBus.on('CACHE_VERIFIED', this.handleCacheVerified);
    eventBus.on('LOD_PRECOMPUTED', this.handleLODPrecomputed);
  }

  registerStage(stage: string, handler: Function) {
    this.stages[stage]?.push(handler);
  }

  private async executeStage(stage: string, payload: any) {
    for (const handler of this.stages[stage]) {
      await handler(payload);
    }
  }

  private handleLoadStart = (payload: any) => {
    this.executeStage('preload', payload)
      .then(() => eventBus.emit('CACHE_CHECK', payload));
  };

  private handleCacheVerified = (payload: any) => {
    this.executeStage('cache', payload)
      .then(() => eventBus.emit('LOD_PRECOMPUTE', payload));
  };

  private handleLODPrecomputed = (payload: any) => {
    this.executeStage('lod', payload)
      .then(() => eventBus.emit('MODEL_INSTANTIATE', payload));
  };

  destroy() {
    eventBus.off('RESOURCE_LOAD_START', this.handleLoadStart);
    eventBus.off('CACHE_VERIFIED', this.handleCacheVerified);
    eventBus.off('LOD_PRECOMPUTED', this.handleLODPrecomputed);
  }
}