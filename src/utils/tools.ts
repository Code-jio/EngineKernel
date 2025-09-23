import THREE from "./three-imports";

// 角度转弧度
function degreesToRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
}

// 弧度转角度
function radiansToDegrees(radians: number): number {
    return radians * (180 / Math.PI);
}

// 限制数值在指定范围内
function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

// 线性插值
function lerp(start: number, end: number, factor: number): number {
    return start + (end - start) * factor;
}

// 向量线性插值
function lerpVector3(start: THREE.Vector3, end: THREE.Vector3, factor: number): THREE.Vector3 {
    return new THREE.Vector3(
        lerp(start.x, end.x, factor),
        lerp(start.y, end.y, factor),
        lerp(start.z, end.z, factor)
    );
}

// 计算两点之间的距离
function distance2D(x1: number, y1: number, x2: number, y2: number): number {
    return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
}

// 计算3D空间中的距离
function distance3D(v1: THREE.Vector3, v2: THREE.Vector3): number {
    return v1.distanceTo(v2);
}

// 生成随机颜色
function randomColor(): string {
    return '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
}

// 深度克隆对象（简单对象）
function deepClone<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime()) as any;
    if (obj instanceof Array) return obj.map(item => deepClone(item)) as any;
    if (typeof obj === 'object') {
        const cloned = {} as T;
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                cloned[key] = deepClone(obj[key]);
            }
        }
        return cloned;
    }
    return obj;
}

// 防抖函数
function debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout;
    return (...args: Parameters<T>) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(null, args), wait);
    };
}

// 节流函数
function throttle<T extends (...args: any[]) => any>(
    func: T,
    limit: number
): (...args: Parameters<T>) => void {
    let inThrottle: boolean;
    return (...args: Parameters<T>) => {
        if (!inThrottle) {
            func.apply(null, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// 判断是否为移动设备
function isMobile(): boolean {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// 格式化文件大小
function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 等待指定时间
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function safeDeepClone(obj: any, visited = new WeakMap()): any {
    // 处理基本类型
    if (obj === null || typeof obj !== 'object') {
        return obj
    }

    // 检查循环引用
    if (visited.has(obj)) {
        return visited.get(obj)
    }

    // 处理日期
    if (obj instanceof Date) {
        return new Date(obj.getTime())
    }

    // 处理数组
    if (Array.isArray(obj)) {
        const arrCopy: any[] = []
        visited.set(obj, arrCopy)
        for (let i = 0; i < obj.length; i++) {
            arrCopy[i] = safeDeepClone(obj[i], visited)
        }
        return arrCopy
    }

    // 处理对象
    const objCopy: any = {}
    visited.set(obj, objCopy)
    for (const key in obj) {
        if (obj.hasOwnProperty && obj.hasOwnProperty(key)) {
            objCopy[key] = safeDeepClone(obj[key], visited)
        }
    }

    return objCopy
}

/**
 * 深度合并配置对象（防止循环引用）
 */
function mergeConfigs(defaultConfig: any, userConfig: any): any {
    // 使用更安全的深拷贝方法
    const result = safeDeepClone(defaultConfig)

    const merge = (
        target: any,
        source: any,
        visited = new WeakSet()
    ): any => {
        // 防止循环引用
        if (visited.has(source)) {
            console.warn('⚠️ 检测到循环引用，跳过此配置项')
            return target
        }

        if (source && typeof source === 'object') {
            visited.add(source)
        }

        for (const key in source) {
            if (source.hasOwnProperty && source.hasOwnProperty(key)) {
                const sourceValue = source[key]

                if (
                    sourceValue &&
                    typeof sourceValue === 'object' &&
                    !Array.isArray(sourceValue)
                ) {
                    target[key] = target[key] || {}
                    merge(target[key], sourceValue, visited)
                } else if (sourceValue !== undefined) {
                    target[key] = sourceValue
                }
            }
        }

        if (source && typeof source === 'object') {
            visited.delete(source)
        }

        return target
    }

    return merge(result, userConfig)
}

export {
    degreesToRadians,
    radiansToDegrees,
    clamp,
    lerp,
    lerpVector3,
    distance2D,
    distance3D,
    randomColor,
    deepClone,
    debounce,
    throttle,
    isMobile,
    formatFileSize,
    sleep,
    safeDeepClone,
    mergeConfigs
}