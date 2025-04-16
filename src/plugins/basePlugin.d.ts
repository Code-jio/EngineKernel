import { PluginMeta } from '../types/Plugin';
export declare class BasePlugin {
    name: string;
    path: string;
    strategy: 'sync' | 'async';
    status: 'unloaded' | 'loaded' | 'error';
    dependencies: string[];
    instance: any;
    constructor(meta: PluginMeta);
    init(coreInterface: any): Promise<void>;
    start(): Promise<void>;
    stop(): Promise<void>;
}
export default BasePlugin;
