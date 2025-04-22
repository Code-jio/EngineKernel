// 用于读取模型文件资源
import BasePlugin from "plugins/basePlugin";
import * as THREE from "three"
import path from "path"
import fs from "fs"



/**
 * 功能要求：
 * 1.实现资源读取的异步任务队列（防止线程阻塞）
 * 2.支持serviceWorker静态资源缓存管理
 */

export default class RessourceReader extends BasePlugin{
    private url:string
    constructor(meta:any){
        super(meta)
        this.url = meta.userData.url
    }

    // 解析文件夹路径：取出对应模型文件、地图资源、天空盒贴图等主要内容（主要维护一个异步队列，同时分发相关事件）
    // 要求：1.避免跨域 2.避免大量资源请求导致线程阻塞，3.要求快速读取资源 4.serviceWorker 5.对接gltfLoader、 
}