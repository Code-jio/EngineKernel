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
                }
            },
        }),
    )
})
