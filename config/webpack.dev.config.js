import detectPort from "detect-port"
import path from "path"
import baseConfig from "./webpack.base.config.js"
import { merge } from "webpack-merge"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default new Promise(async resolve => {
    const port = await detectPort(8080)

    resolve(
        merge(baseConfig, {
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
            entry: path.resolve(__dirname, '../src/index.ts'),
            devtool: "source-map",
            output: {
                filename: 'engine-kernel.dev.js',
                path: path.resolve(__dirname, '../dist'),
                publicPath: '/',
            },
            devServer: {
                // https: true,
                client: {
                    overlay: {
                        errors: false,
                        warnings: false,
                        runtimeErrors: false,
                    },
                    logging: "warn",
                    reconnect: 5,
                    webSocketTransport: 'ws',
                    // processEnv: { NODE_ENV: 'development' }
                },
                static: {
                    directory: path.join(__dirname, "../dist"),
                    watch: {
                        ignored: [/node_modules/, /dist/],
                        usePolling: true,
                        interval: 300,
                    },
                    serveIndex: true,
                },
                // 新增跨域配置
                headers: {
                  'Access-Control-Allow-Origin': '*',
                  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
                  'Access-Control-Allow-Headers': 'X-Requested-With, content-type, Authorization'
                },
                host: "0.0.0.0",
                port,
                open: true,
                hot: true, // 启用完全热模块替换
                liveReload: true, // 启用自动刷新
                // 如果需要代理API，可添加以下配置（示例）
                // proxy: {
                //   '/api': {
                //     target: 'http://your-api-server.com',
                //     changeOrigin: true,
                //     pathRewrite: { '^/api': '' }
                // }
                watchFiles: {
                    paths: ['src/**/*.ts', 'src/**/*.tsx'], // 监听的文件路径
                    options: {
                        usePolling: true, // 使用轮询
                        interval: 300, // 轮询间隔时间（毫秒）
                    },
                },
                setupMiddlewares: (middlewares, devServer) => {
                    // 在这里可以添加自定义中间件
                    if (!devServer) {
                        throw new Error('webpack-dev-server is not defined');
                    }
                    
                    // 服务器启动后的回调
                    devServer.compiler.hooks.done.tap('dev-server-info', () => {
                        const serverPort = devServer.server.address().port;
                        const localIp = getLocalIpAddress();
                        
                        console.log("\n项目启动成功！可通过以下地址访问：");
                        console.log(`- 本机访问: http://localhost:${serverPort}/engine-kernel.dev.js`);
                        console.log(`- 局域网访问: http://${localIp}:${serverPort}/engine-kernel.dev.js`);
                        // console.log(`- 外部访问: http://0.0.0.0:${serverPort}/engine-kernel.dev.js\n`);
                    });
                    
                    return middlewares;
                }
            },
        }),
    )
    
})

function getLocalIpAddress() {
    const interfaces = require('os').networkInterfaces()

    for (const devName in interfaces) {
        const iface = interfaces[devName]

        for (let i = 0; i < iface.length; i++) {
            const alias = iface[i]

            if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
                return alias.address
            }
        }
    }
}
