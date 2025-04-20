import { PluginMeta } from './Plugin';
export declare class BasePlugin {
    name: string;
    path: string;
    strategy: 'sync' | 'async';
    status: 'unloaded' | 'loaded' | 'error';
    dependencies: string[];
    instance: any;
    version: string;
    constructor(meta: PluginMeta);
    init(coreInterface: any): Promise<void>;
    start(): Promise<void>;
    stop(): Promise<void>;
    uninstall(): Promise<void>;
    getExports(): any;
    initialize(coreInterface: any): Promise<void>;
    setGLContext(gl: WebGL2RenderingContext): void;

}
export default BasePlugin;
