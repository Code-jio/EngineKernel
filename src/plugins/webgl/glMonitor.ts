import { BasePlugin } from "../basePlugin"
import * as THREE from "three"
import eventBus from "../../eventBus/eventBus"

interface GLState {
    programCount: number
    bufferCount: number
    textureCount: number
    shaderCount: number
    programCompileError: boolean
    bufferCreationError: boolean
    textureCreationError: boolean
    framebufferCount: number
    renderbufferCount: number
    drawElementsCallCount: number
    drawArraysCallCount: number
    gpuMemoryUsage: number // Estimated GPU memory usage in bytes
    extensionsSupported: { timerQuery: boolean; memoryInfo: boolean }
}

export class GLMonitor extends BasePlugin {
    private gl: WebGL2RenderingContext
    private state: GLState = {
        programCount: 0,
        bufferCount: 0,
        textureCount: 0,
        shaderCount: 0,
        programCompileError: false,
        bufferCreationError: false,
        textureCreationError: false,
        framebufferCount: 0,
        renderbufferCount: 0,
        drawElementsCallCount: 0,
        drawArraysCallCount: 0,
        gpuMemoryUsage: 0,
        extensionsSupported: { timerQuery: false, memoryInfo: false },
    }

    private originalMethods: { [key: string]: Function } = {}
    private statsPanel: HTMLElement | null = null
    private boundUpdateStats: () => void
    private renderer: any // 存储 context 的引用

    constructor(meta: any) {
        super(meta)
        if (!meta.userData || !meta.userData.renderer) {
            throw new Error("Invalid WebGLRenderer instance")
        }
        this.renderer = meta.userData.renderer

        if (this.renderer instanceof THREE.WebGLRenderer) {
            this.gl = this.renderer.getContext() as WebGL2RenderingContext
            if (!this.gl) {
                throw new Error("Failed to get WebGL2 context")
            }
            this.detectExtensions()
        } else {
            throw new Error("GLContextMonitorPlugin requires a WebGL2 renderer")
        }
        this.setupMethodProxies()
        this.createStatsPanel()
        this.boundUpdateStats = this.updateStats.bind(this)
    }

    private detectExtensions() {
        this.state.extensionsSupported = {
            timerQuery: !!this.gl.getExtension("EXT_disjoint_timer_query"),
            memoryInfo: !!this.gl.getExtension("WEBGL_memory_info"),
        }
    }

    private _getBytesPerPixel(format: number, type: number): number {
        // Simplified mapping of format and type to bytes per pixel, adjust as needed
        const formatMap: { [key: number]: number } = {
            [this.gl.RGBA]: 4,
            [this.gl.RGB]: 3,
            [this.gl.ALPHA]: 1,
            // Add more formats as needed
        }
        const typeMap: { [key: number]: number } = {
            [this.gl.UNSIGNED_BYTE]: 1,
            [this.gl.FLOAT]: 4,
            // Add more types as needed
        }
        return formatMap[format] * typeMap[type] || 4 // Default to 4 bytes per pixel if not found
    }

    private setupMethodProxies() {
        // Proxy createProgram/deleteProgram
        this.originalMethods.createProgram = this.gl.createProgram
        this.gl.createProgram = () => {
            const program = this.originalMethods.createProgram.call(this.gl)
            this.state.programCount++
            return program
        }
        this.originalMethods.deleteProgram = this.gl.deleteProgram
        this.gl.deleteProgram = program => {
            this.originalMethods.deleteProgram.call(this.gl, program)
            this.state.programCount--
        }

        // Proxy createBuffer/deleteBuffer
        this.originalMethods.createBuffer = this.gl.createBuffer
        this.gl.createBuffer = () => {
            const buffer = this.originalMethods.createBuffer.call(this.gl)
            this.state.bufferCount++
            return buffer
        }
        this.originalMethods.deleteBuffer = this.gl.deleteBuffer
        this.gl.deleteBuffer = buffer => {
            this.originalMethods.deleteBuffer.call(this.gl, buffer)
            this.state.bufferCount--
        }

        // Proxy createTexture/deleteTexture
        this.originalMethods.createTexture = this.gl.createTexture
        this.gl.createTexture = () => {
            const texture = this.originalMethods.createTexture.call(this.gl)
            this.state.textureCount++
            return texture
        }
        this.originalMethods.deleteTexture = this.gl.deleteTexture
        this.gl.deleteTexture = texture => {
            this.originalMethods.deleteTexture.call(this.gl, texture)
            this.state.textureCount--
        }

        // Proxy createFramebuffer/deleteFramebuffer
        this.originalMethods.createFramebuffer = this.gl.createFramebuffer
        this.gl.createFramebuffer = () => {
            const framebuffer = this.originalMethods.createFramebuffer.call(this.gl)
            this.state.framebufferCount++
            return framebuffer
        }
        this.originalMethods.deleteFramebuffer = this.gl.deleteFramebuffer
        this.gl.deleteFramebuffer = framebuffer => {
            this.originalMethods.deleteFramebuffer.call(this.gl, framebuffer)
            this.state.framebufferCount--
        }

        // Proxy createRenderbuffer/deleteRenderbuffer
        this.originalMethods.createRenderbuffer = this.gl.createRenderbuffer
        this.gl.createRenderbuffer = () => {
            const renderbuffer = this.originalMethods.createRenderbuffer.call(this.gl)
            this.state.renderbufferCount++
            return renderbuffer
        }
        this.originalMethods.deleteRenderbuffer = this.gl.deleteRenderbuffer
        this.gl.deleteRenderbuffer = renderbuffer => {
            this.originalMethods.deleteRenderbuffer.call(this.gl, renderbuffer)
            this.state.renderbufferCount--
        }

        // Proxy drawElements/drawArrays to count calls
        this.originalMethods.drawElements = this.gl.drawElements
        this.gl.drawElements = (mode, count, type, offset) => {
            this.state.drawElementsCallCount++
            this.originalMethods.drawElements.call(this.gl, mode, count, type, offset)
        }
        this.originalMethods.drawArrays = this.gl.drawArrays
        this.gl.drawArrays = (mode, first, count) => {
            this.state.drawArraysCallCount++
            this.originalMethods.drawArrays.call(this.gl, mode, first, count)
        }

        // Proxy compileShader to catch errors
        this.originalMethods.compileShader = this.gl.compileShader
        this.gl.compileShader = shader => {
            this.originalMethods.compileShader.call(this.gl, shader)
            if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
                this.state.programCompileError = true
                eventBus.emit("gl-shader-compile-error", this.gl.getShaderInfoLog(shader))
            }
        }

        // Proxy texImage2D to estimate GPU memory usage
        this.originalMethods.texImage2D = this.gl.texImage2D
        this.gl.texImage2D = (
            target: number,
            level: number,
            internalformat: number,
            format: number,
            type: number,
            ...args: any[]
        ) => {
            const bytesPerPixel = this._getBytesPerPixel(format, type)
            const source = args.length > 0 ? args[0] : null
            let memoryUsage = 0
            if (source) {
                const width = source.width
                const height = source.height
                memoryUsage = width * height * bytesPerPixel
            }
            this.state.gpuMemoryUsage += memoryUsage
            this.originalMethods.texImage2D.call(this.gl, target, level, internalformat, format, type, ...args)
        }

        // Proxy texSubImage2D to update GPU memory usage
        this.originalMethods.texSubImage2D = this.gl.texSubImage2D
        this.gl.texSubImage2D = (
            target: number,
            level: number,
            xoffset: number,
            yoffset: number,
            format: number,
            type: number,
            ...args: any[]
        ) => {
            const bytesPerPixel = this._getBytesPerPixel(format, type)
            const source = args.length > 0 ? args[0] : null
            let memoryUsage = 0
            if (source) {
                const width = source.width
                const height = source.height
                memoryUsage = width * height * bytesPerPixel
            }
            this.state.gpuMemoryUsage += memoryUsage
            this.originalMethods.texSubImage2D.call(this.gl, target, level, xoffset, yoffset, format, type, ...args)
        }
    }

    private createStatsPanel() {
        if (!document.body) return
        this.statsPanel = document.createElement("div") as HTMLElement
        this.statsPanel.style.position = "fixed"
        this.statsPanel.style.top = "10px"
        this.statsPanel.style.left = "10px"
        this.statsPanel.style.backgroundColor = "rgba(0,0,0,0.5)"
        this.statsPanel.style.color = "white"
        this.statsPanel.style.padding = "5px"
        this.statsPanel.style.zIndex = "1000"
        this.statsPanel.style.display = "flex"
        this.statsPanel.style.flexDirection = "column"
        document.body.appendChild(this.statsPanel)
    }

    private updateStats() {
        if (!this.statsPanel) return
        // Reset error states at the start of each frame
        this.state.programCompileError = false
        this.state.bufferCreationError = false
        this.state.textureCreationError = false

        if (this.state.extensionsSupported.memoryInfo) {
            const memoryInfo = this.gl.getExtension("WEBGL_memory_info")
            this.state.gpuMemoryUsage = memoryInfo.getMemoryUsage()
        }

        const errorIndicator =
            this.state.programCompileError || this.state.bufferCreationError || this.state.textureCreationError
                ? "⚠️"
                : "✅"
        this.statsPanel.innerHTML = `
      <div>Programs: ${this.state.programCount}</div>
      <div>Buffers: ${this.state.bufferCount}</div>
      <div>Textures: ${this.state.textureCount}</div>
      <div>Framebuffers: ${this.state.framebufferCount}</div>
      <div>Renderbuffers: ${this.state.renderbufferCount}</div>
      <div>Draw Elements Calls: ${this.state.drawElementsCallCount}</div>
      <div>Draw Arrays Calls: ${this.state.drawArraysCallCount}</div>
      <div>GPU Memory Usage: ${this.state.gpuMemoryUsage} bytes</div>
      <div>Status: ${errorIndicator}</div>
    `
    }

    public initialize() {
        eventBus.on("render-loop-begin", this.boundUpdateStats)
    }

    // public destroy() {
    //     // Restore original methods
    //     Object.keys(this.originalMethods).forEach((method: keyof WebGL2RenderingContext) => {
    //         this.gl[method] = this.originalMethods[method] as WebGL2RenderingContext[typeof method]
    //     })

    //     // Remove DOM element
    //     this.statsPanel?.parentNode?.removeChild(this.statsPanel)

    //     // Remove event listener
    //     eventBus.off("render-loop-begin", this.boundUpdateStats)
    // }
}
