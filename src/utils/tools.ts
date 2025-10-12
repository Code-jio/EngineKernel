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

/**
 * 设置物体透明度（自动保存原始材质）
 * @param object 需要设置透明度的Three.js物体
 * @param opacity 目标透明度值（0-1之间）
 * @param transparent 是否启用透明（默认为true，当opacity小于1时自动启用）
 * @param saveOriginal 是否保存原始材质信息（默认为true，用于后续恢复）
 * 
 * 注意：当saveOriginal为true时，会自动保存原始材质信息，后续可通过restoreOriginalOpacity恢复
 */
function setObjectOpacity(object: THREE.Object3D, opacity: number, transparent?: boolean, saveOriginal: boolean = true): void {
    if (!object) {
        console.warn('setObjectOpacity: 物体参数为空');
        return;
    }
    
    // 限制透明度值在0-1之间
    opacity = clamp(opacity, 0, 1);
    
    // 如果没有明确指定transparent参数，当opacity小于1时自动启用透明
    if (transparent === undefined) {
        transparent = opacity < 1;
    }
    
    // 如果需要保存原始材质信息且尚未保存
    if (saveOriginal && !object.userData.originalMaterialsMap) {
        const materialsMap = new Map<string, THREE.Material | THREE.Material[]>();
        
        // 遍历物体的所有子对象和网格，保存原始材质
        object.traverse((child) => {
            if (child instanceof THREE.Mesh && child.material) {
                // 保存原始材质引用
                materialsMap.set(child.uuid, child.material);
            }
        });
        
        // 将材质Map存储在物体的userData中，方便后续恢复
        object.userData.originalMaterialsMap = materialsMap;
    }
    
    // 遍历物体的所有子对象和网格
    object.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material) {
            // 处理材质数组（多材质）
            if (Array.isArray(child.material)) {
                child.material = child.material.map(material => {
                    // 克隆材质以避免影响其他物体
                    const clonedMaterial = material.clone();
                    clonedMaterial.transparent = transparent;
                    clonedMaterial.opacity = opacity;
                    
                    // 如果材质不透明，确保深度写入开启
                    if (!transparent && clonedMaterial.depthWrite !== undefined) {
                        clonedMaterial.depthWrite = true;
                    }
                    
                    return clonedMaterial;
                });
            } 
            // 处理单一材质
            else {
                // 克隆材质以避免影响其他物体
                const clonedMaterial = child.material.clone();
                clonedMaterial.transparent = transparent;
                clonedMaterial.opacity = opacity;
                
                // 如果材质不透明，确保深度写入开启
                if (!transparent && clonedMaterial.depthWrite !== undefined) {
                    clonedMaterial.depthWrite = true;
                }
                
                child.material = clonedMaterial;
            }
        }
    });
}

/**
 * 恢复物体的原始透明度（使用之前在setObjectOpacity中保存的材质信息）
 * @param object 需要恢复透明度的Three.js物体
 * @param forceRestore 是否强制恢复，即使没有保存的材质信息也会尝试恢复
 */
function restoreOriginalOpacity(object: THREE.Object3D, forceRestore: boolean = false): void {
    if (!object) {
        console.warn('restoreOriginalOpacity: 物体参数为空');
        return;
    }
    
    // 获取之前在setObjectOpacity中保存的材质信息
    let materialsMap = object.userData.originalMaterialsMap as Map<string, THREE.Material | THREE.Material[]>;
    
    // 如果没有保存的材质信息且不强制恢复，则警告并返回
    if (!materialsMap && !forceRestore) {
        console.warn('restoreOriginalOpacity: 没有找到保存的材质信息，请先调用setObjectOpacity或设置forceRestore为true');
        return;
    }
    
    // 如果没有保存的材质信息但强制恢复，则尝试保存当前材质作为"原始"材质
    if (!materialsMap && forceRestore) {
        materialsMap = new Map<string, THREE.Material | THREE.Material[]>();
        
        // 遍历物体的所有子对象和网格，保存当前材质作为"原始"材质
        object.traverse((child) => {
            if (child instanceof THREE.Mesh && child.material) {
                materialsMap.set(child.uuid, child.material);
            }
        });
        
        // 将材质Map存储在物体的userData中
        object.userData.originalMaterialsMap = materialsMap;
        console.info('restoreOriginalOpacity: 没有找到保存的材质信息，已保存当前材质作为"原始"材质');
    }
    
    // 遍历物体的所有子对象和网格
    object.traverse((child) => {
        if (child instanceof THREE.Mesh) {
            const originalMaterial = materialsMap.get(child.uuid);
            
            if (originalMaterial) {
                // 直接恢复原始材质
                child.material = originalMaterial;
            } else if (forceRestore) {
                // 如果强制恢复但没有找到对应的原始材质，则重置当前材质的透明度和透明状态
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material = child.material.map(material => {
                            const clonedMaterial = material.clone();
                            clonedMaterial.transparent = false;
                            clonedMaterial.opacity = 1;
                            // 恢复深度写入
                            if (clonedMaterial.depthWrite !== undefined) {
                                clonedMaterial.depthWrite = true;
                            }
                            return clonedMaterial;
                        });
                    } else {
                        const clonedMaterial = child.material.clone();
                        clonedMaterial.transparent = false;
                        clonedMaterial.opacity = 1;
                        // 恢复深度写入
                        if (clonedMaterial.depthWrite !== undefined) {
                            clonedMaterial.depthWrite = true;
                        }
                        child.material = clonedMaterial;
                    }
                }
            }
        }
    });
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
    mergeConfigs,
    setObjectOpacity,
    restoreOriginalOpacity
}