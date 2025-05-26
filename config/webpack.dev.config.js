import path from "path"
import os from "os"
import baseConfig from "./webpack.base.config.js"
import { merge } from "webpack-merge"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 获取本机IP地址
const getLocalIpAddress = () => {
    const interfaces = os.networkInterfaces()
    for (const name of Object.keys(interfaces)) {
        for (const networkInterface of interfaces[name]) {
            // 跳过内部地址和非IPv4地址
            if (networkInterface.family === "IPv4" && !networkInterface.internal) {
                return networkInterface.address
            }
        }
    }
    return "localhost"
}

const port = 8000;

export default merge(baseConfig, {
    stats: {
        colors: true,
        hash: false,
        version: false,
        timings: true,
        assets: false, // 不显示资产信息
        chunks: false, // 不显示代码块信息
        modules: false, // 不显示模块信息
        reasons: false, // 不显示模块被包含的原因
        children: false, // 不显示子编译信息
        source: false, // 不显示源码
        errors: true, // 显示错误
        errorDetails: true, // 显示错误详情
        warnings: true, // 显示警告
        publicPath: false, // 不显示公共路径
        entrypoints: false, // 不显示入口点信息
    },
    mode: "development",
    entry: path.resolve(__dirname, "../src/index.ts"),
    devtool: "eval-source-map", // 开发模式使用更快的source map
    output: {
        filename: "engine-kernel.dev.js",
        // 开发模式下文件在内存中，不需要指定path
        publicPath: "/",
        library: {
            name: "EngineKernel",
            type: "umd",
            umdNamedDefine: true,
            export: "default", // 确保导出默认模块
        },
        globalObject: "typeof self !== 'undefined' ? self : this",
        // 开发模式下的额外配置
        clean: false, // 开发模式不清理输出目录
        pathinfo: true, // 在生成的代码中包含路径信息，便于调试
        // 开发模式下的模块命名
        chunkFilename: "[name].chunk.js",
        // 开发模式下的异步模块加载
        asyncChunks: true,
        // 开发模式下的模块ID命名
        chunkLoadingGlobal: "webpackChunkEngineKernel",
    },
    devServer: {
        // https: true,
        client: {
            overlay: {
                errors: true,
                warnings: false,
                runtimeErrors: true,
            },
            logging: "warn",
            reconnect: 5,
            webSocketTransport: "ws",
            progress: true, // 显示编译进度
        },
        static: {
            directory: path.join(__dirname, "../examples"),
            publicPath: "/examples",
            watch: {
                ignored: [/node_modules/, /dist/],
                usePolling: true,
                interval: 300,
            },
            serveIndex: true,
        },
        // 新增跨域配置
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
            "Access-Control-Allow-Headers": "X-Requested-With, content-type, Authorization",
        },
        host: "0.0.0.0",
        port,
        open: [
            `http://localhost:${port}/engine-kernel.dev.js`,
            // `http://${getLocalIpAddress()}:${port}`,
        ],
        hot: true, 
        allowedHosts: "all",
        liveReload: true,
        // 如果需要代理API，可添加以下配置（示例）
        // proxy: {
        //   '/api': {
        //     target: 'http://your-api-server.com',
        //     changeOrigin: true,
        //     pathRewrite: { '^/api': '' }
        // }
        watchFiles: {
            paths: ["src/**/*.ts", "src/**/*.tsx"], // 监听的文件路径
            options: {
                usePolling: true, // 使用轮询
                interval: 300, // 轮询间隔时间（毫秒）
            },
        },
        onListening: function (devServer) {
            if (!devServer) {
                throw new Error("webpack-dev-server is not defined")
            }

            const port = devServer.server.address().port
            const localIp = getLocalIpAddress()

            console.log("\n项目启动成功！可通过以下地址访问：")
            console.log(`- 本机访问: http://localhost:${port}/engine-kernel.dev.js`)
            console.log(`- 局域网访问: http://${localIp}:${port}/engine-kernel.dev.js`)
            console.log(`- 外部访问: http://0.0.0.0:${port}/engine-kernel.dev.js\n`)
        },
    },
    infrastructureLogging: {
        level: "warn", // 只显示警告和错误级别的基础设施日志
    },
})
