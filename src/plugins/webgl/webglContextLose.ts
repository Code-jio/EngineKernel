// 响应webgl渲染上下文丢失的情况、诸如此类还有内存溢出导致程序崩溃、渲染进程阻塞导致程序卡顿。
import BasePlugin from "plugins/basePlugin";
import eventBus from "eventBus/eventBus";
import WebGPURenderer from "three/examples/jsm/renderers/webgpu/WebGPURenderer";

// 