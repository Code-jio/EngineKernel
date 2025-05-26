#!/usr/bin/env node

const https = require('https');
const fs = require('fs');
const path = require('path');

// THREE.js 版本
const THREE_VERSION = '0.160.0';

// 需要下载的文件列表
const files = [
    {
        url: `https://unpkg.com/three@${THREE_VERSION}/build/three.module.js`,
        dest: 'examples/prototype/libs/three.module.js'
    },
    {
        url: `https://unpkg.com/three@${THREE_VERSION}/examples/jsm/controls/OrbitControls.js`,
        dest: 'examples/prototype/libs/OrbitControls.js'
    },
    {
        url: `https://unpkg.com/three@${THREE_VERSION}/examples/jsm/loaders/GLTFLoader.js`,
        dest: 'examples/prototype/libs/GLTFLoader.js'
    },
    {
        url: `https://unpkg.com/three@${THREE_VERSION}/examples/jsm/renderers/CSS3DRenderer.js`,
        dest: 'examples/prototype/libs/CSS3DRenderer.js'
    },
    {
        url: `https://unpkg.com/three@${THREE_VERSION}/examples/jsm/objects/Sky.js`,
        dest: 'examples/prototype/libs/Sky.js'
    }
];

// 确保目录存在
function ensureDir(filePath) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

// 下载文件
function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        ensureDir(dest);
        
        const file = fs.createWriteStream(dest);
        
        https.get(url, (response) => {
            if (response.statusCode === 200) {
                response.pipe(file);
                file.on('finish', () => {
                    file.close();
                    console.log(`✅ 下载完成: ${dest}`);
                    resolve();
                });
            } else {
                reject(new Error(`下载失败: ${url}, 状态码: ${response.statusCode}`));
            }
        }).on('error', (err) => {
            fs.unlink(dest, () => {});
            reject(err);
        });
    });
}

// 主函数
async function main() {
    console.log(`🚀 开始下载 THREE.js v${THREE_VERSION} 依赖...`);
    
    try {
        for (const file of files) {
            console.log(`📥 下载 ${file.url}`);
            await downloadFile(file.url, file.dest);
        }
        
        console.log('\n🎉 所有文件下载完成！');
        console.log('📂 文件位置: examples/prototype/libs/');
        
        // 计算总大小
        let totalSize = 0;
        files.forEach(file => {
            if (fs.existsSync(file.dest)) {
                const stats = fs.statSync(file.dest);
                totalSize += stats.size;
            }
        });
        
        console.log(`💾 总大小: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
        
    } catch (error) {
        console.error('❌ 下载失败:', error.message);
        process.exit(1);
    }
}

// 运行
main(); 