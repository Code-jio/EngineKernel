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

// 安全深度克隆
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

// ==================== 轮廓提取相关函数 ====================

/**
 * 判断三点是否构成逆时针转向
 * @param a 第一个点
 * @param b 第二个点
 * @param c 第三个点
 * @returns 大于0表示逆时针，等于0表示共线，小于0表示顺时针
 */
function ccw(a: { x: number, y: number }, b: { x: number, y: number }, c: { x: number, y: number }): number {
    return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
}

/**
 * 计算点集的凸包
 * @param points 输入点集
 * @returns 凸包顶点数组
 */
function computeConvexHull(points: THREE.Vector3[]): THREE.Vector3[] {
    if (points.length < 3) return points

    // 投影到2D平面（忽略Y坐标）
    const points2D = points.map(p => ({ x: p.x, y: p.z, original: p }))

    // 使用Graham扫描算法计算凸包
    // 1. 找到最下方的点（y最小，如果相同则x最小）
    let start = points2D[0]
    for (const p of points2D) {
        if (p.y < start.y || (p.y === start.y && p.x < start.x)) {
            start = p
        }
    }

    // 2. 按照相对于起始点的极角排序
    points2D.sort((a, b) => {
        if (a === start) return -1
        if (b === start) return 1

        const angleA = Math.atan2(a.y - start.y, a.x - start.x)
        const angleB = Math.atan2(b.y - start.y, b.x - start.x)

        if (angleA !== angleB) return angleA - angleB

        // 如果角度相同，选择距离更近的点
        const distA = Math.sqrt((a.x - start.x) ** 2 + (a.y - start.y) ** 2)
        const distB = Math.sqrt((b.x - start.x) ** 2 + (b.y - start.y) ** 2)
        return distA - distB
    })

    // 3. 使用栈构建凸包
    const hull: typeof points2D = [points2D[0], points2D[1]]

    for (let i = 2; i < points2D.length; i++) {
        while (hull.length > 1 && ccw(hull[hull.length - 2], hull[hull.length - 1], points2D[i]) <= 0) {
            hull.pop()
        }
        hull.push(points2D[i])
    }

    // 返回原始3D点
    return hull.map(p => p.original)
}

/**
 * 提取3D对象的2D平面轮廓（俯视视角）,专用于房间
 * @param object3D 3D对象，包含所有mesh
 * @param options 配置选项
 * @returns 2D平面轮廓顶点数组（世界坐标）
 */
function extractObjectContour(
    object3D: THREE.Object3D, 
    options: {
        tolerance?: number,      // 顶点筛选容差值，默认0.05
        floorRatio?: number,     // 地板高度比例，默认0.3
        debugMode?: boolean      // 是否启用调试模式，默认false
    } = {}
): THREE.Vector3[] {
    const {
        tolerance = 0.05,
        floorRatio = 0.3,
        debugMode = false
    } = options

    const meshes: THREE.Mesh[] = []

    // 查找对象中的所有mesh
    object3D.traverse(child => {
        if (child instanceof THREE.Mesh) {
            meshes.push(child)
        }
    })

    if (meshes.length === 0) {
        if (debugMode) console.warn("⚠️ 对象中未找到任何mesh")
        return []
    }

    // 计算整个对象的边界框
    const objectBoundingBox = new THREE.Box3()
    meshes.forEach(mesh => {
        const meshBox = new THREE.Box3().setFromObject(mesh)
        objectBoundingBox.union(meshBox)
    })

    // 获取边界框的中心点和尺寸
    const center = new THREE.Vector3()
    const size = new THREE.Vector3()
    objectBoundingBox.getCenter(center)
    objectBoundingBox.getSize(size)

    // 确定地板高度（边界框的底部Y值）
    const floorY = objectBoundingBox.min.y

    // 收集所有可能构成轮廓的顶点
    const contourCandidates: THREE.Vector3[] = []

    // 从所有mesh中提取顶点
    meshes.forEach(mesh => {
        const geometry = mesh.geometry
        if (!geometry.attributes.position) return

        const verticesArray = geometry.attributes.position.array
        const worldMatrix = mesh.matrixWorld

        // 遍历所有顶点
        for (let i = 0; i < verticesArray.length; i += 3) {
            const x = verticesArray[i]
            const y = verticesArray[i + 1]
            const z = verticesArray[i + 2]

            const vertex = new THREE.Vector3(x, y, z)
            // 转换到世界坐标
            vertex.applyMatrix4(worldMatrix)

            // 优先考虑接近地板高度的顶点
            if (Math.abs(vertex.y - floorY) < size.y * floorRatio) {
                contourCandidates.push(vertex)
            }
        }
    })

    if (contourCandidates.length === 0) {
        if (debugMode) console.warn("⚠️ 未找到可用于轮廓提取的顶点")
        return []
    }

    // 使用凸包算法提取轮廓
    const contourVertices = computeConvexHull(contourCandidates)

    if (contourVertices.length < 3) {
        if (debugMode) console.warn("⚠️ 轮廓顶点数量不足，无法构成有效轮廓")
        return []
    }

    // 按照逆时针方向排序顶点（从上方看）
    const contourCenter = new THREE.Vector3()
    contourVertices.forEach(v => contourCenter.add(v))
    contourCenter.divideScalar(contourVertices.length)

    contourVertices.sort((a, b) => {
        const angleA = Math.atan2(a.z - contourCenter.z, a.x - contourCenter.x)
        const angleB = Math.atan2(b.z - contourCenter.z, b.x - contourCenter.x)
        return angleA - angleB
    })

    return contourVertices
}

/**
 * 将轮廓的几何中心移动到原点
 * @param contour 轮廓顶点数组
 * @returns 平移后的轮廓顶点数组，几何中心位于原点
 */
function centerContourAtOrigin(contour: THREE.Vector3[]): THREE.Vector3[] {
    if (!contour || contour.length === 0) {
        console.warn("⚠️ 轮廓顶点数组为空，无法进行中心化处理")
        return []
    }

    // 计算轮廓的几何中心
    const center = new THREE.Vector3()
    contour.forEach(vertex => {
        center.add(vertex)
    })
    center.divideScalar(contour.length)

    // 创建平移后的轮廓顶点数组
    const centeredContour: THREE.Vector3[] = []
    contour.forEach(vertex => {
        const centeredVertex = vertex.clone()
        centeredVertex.sub(center) // 从每个顶点减去中心点坐标
        centeredContour.push(centeredVertex)
    })

    return centeredContour
}

/**
 * 为对象提取并保存轮廓信息到userData
 * @param object3D 3D对象
 * @param options 配置选项
 * @returns 是否成功提取并保存轮廓
 */
function extractAndSaveObjectBounding(
    object3D: THREE.Object3D, 
    options: {
        objectName?: string,     // 对象名称，用于日志输出
        tolerance?: number,      // 顶点筛选容差值，默认0.05
        floorRatio?: number,     // 地板高度比例，默认0.3
        debugMode?: boolean,     // 是否启用调试模式，默认false
        saveToUserData?: boolean, // 是否保存到userData，默认true
        saveCenteredContour?: boolean // 是否保存中心化后的轮廓，默认true
    } = {}
): boolean {
    const {
        objectName = "对象",
        tolerance = 0.05,
        floorRatio = 0.3,
        debugMode = false,
        saveToUserData = true,
        saveCenteredContour = true
    } = options

    try {
        // 提取对象的2D平面轮廓（俯视视角）
        const contourVertices = extractObjectContour(object3D, {
            tolerance,
            floorRatio,
            debugMode
        })

        if (contourVertices.length > 0 && saveToUserData) {
            // 将轮廓信息保存到对象的userData中
            if (!object3D.userData) {
                object3D.userData = {}
            }

            // 计算轮廓中心
            const contourCenter = new THREE.Vector3()
            contourVertices.forEach(v => contourCenter.add(v))
            contourCenter.divideScalar(contourVertices.length)

            // 保存轮廓信息
            object3D.userData.bounding = {
                vertices: contourVertices.map(v => ({ x: v.x, y: v.y, z: v.z })),
                vertexCount: contourVertices.length,
                center: {
                    x: contourCenter.x,
                    y: contourCenter.y,
                    z: contourCenter.z,
                },
                type: "contour", // 标记为2D平面轮廓
                extractedAt: Date.now(),
            }

            // 如果需要保存中心化后的轮廓
            if (saveCenteredContour) {
                const centeredContour = centerContourAtOrigin(contourVertices)
                object3D.userData.bounding.centeredVertices = centeredContour.map(v => ({ x: v.x, y: v.y, z: v.z }))
                
                if (debugMode) {
                    console.log(`   - 中心化轮廓顶点数: ${centeredContour.length}`)
                }
            }

            if (debugMode) {
                console.log(`✅ ${objectName} 2D平面轮廓提取完成`)
                console.log(`   - 轮廓顶点数: ${contourVertices.length}`)
                console.log(`   - 轮廓中心: (${contourCenter.x.toFixed(2)}, ${contourCenter.y.toFixed(2)}, ${contourCenter.z.toFixed(2)})`)
            }
            
            return true
        } else if (contourVertices.length === 0) {
            if (debugMode) console.warn(`⚠️ ${objectName} 轮廓提取失败：没有有效的顶点`)
            return false
        }
        
        return contourVertices.length > 0
    } catch (error) {
        if (debugMode) console.error(`❌ ${objectName} 轮廓提取出错:`, error)
        return false
    }
}


/**
 * 将 THREE.Vector3 转换为 {x, y, z} 对象
 * @param vec - THREE.Vector3 实例
 * @returns 包含 x, y, z 属性的普通对象
 */
function vector3ToObject(vec: THREE.Vector3): { x: number; y: number; z: number } {
    return {
        x: vec.x,
        y: vec.y,
        z: vec.z
    };
}

/**
 * 将 { x, y, z } 对象转换为 THREE.Vector3
 * @param obj - 包含 x, y, z 属性的对象
 * @returns THREE.Vector3 实例
 */
function objectToVector3(obj: { x: number; y: number; z: number }): THREE.Vector3 {
    return new THREE.Vector3(obj.x, obj.y, obj.z);
}

/**
 * 将 mesh 的材质克隆并修改颜色，原始材质保存在 mesh.userData.originalMaterial 或 mesh.userData.originalMaterials
 * @param mesh - 你要修改的 Three.js mesh
 * @param targetHexColor - 目标颜色（十六进制，例如 0x00ff00）
 */
function changeMeshColor(mesh: THREE.Mesh, targetHexColor: number): void {
    if (!mesh.material) return;

    // 保存原始材质
    if (Array.isArray(mesh.material)) {
        if (!mesh.userData.originalMaterials) {
            mesh.userData.originalMaterials = [];
        }

        mesh.material.forEach((mat, index) => {
            const clone = mat.clone();
            if (clone instanceof THREE.MeshStandardMaterial) {
                clone.color.set(targetHexColor);
            }

            if (Array.isArray(mesh.material)) {
                mesh.material[index] = clone;
            } else {
                mesh.material = clone;
            }

            // 保存原材质到 userData
            mesh.userData.originalMaterials![index] = mat;
        });
    } else {
        const original = mesh.material.clone();
        const clone = mesh.material.clone();
        if (clone instanceof THREE.MeshStandardMaterial) {
            clone.color.set(targetHexColor);
        }
        mesh.material = clone;

        mesh.userData.originalMaterial = original;
    }
}

/**
 * 从 mesh.userData 恢复原始材质
 * @param mesh - 你要恢复的 Three.js mesh
 */
function restoreMeshOriginalMaterial(mesh: THREE.Mesh): void {
    if (mesh.userData.originalMaterial) {
        mesh.material = mesh.userData.originalMaterial.clone();
        delete mesh.userData.originalMaterial;
    } else if (Array.isArray(mesh.userData.originalMaterials)) {
        mesh.material = mesh.userData.originalMaterials.map(mat => mat.clone());
        delete mesh.userData.originalMaterials;
    }
}

export {
    degreesToRadians, // 角度转弧度
    radiansToDegrees, // 弧度转角度
    clamp, // 限制数值在指定范围内
    lerp, //线性插值
    lerpVector3, // 向量线性插值
    distance2D, // 计算两点之间的距离
    distance3D, // 计算3D空间中的距离
    randomColor, // 生成随机颜色
    deepClone, // 深度克隆对象（简单对象）
    debounce, // 防抖函数
    throttle, // 节流函数
    isMobile, // 判断是否为移动设备
    formatFileSize, // 格式化文件大小
    sleep, // 等待指定时间

    safeDeepClone, // 安全深度克隆
    mergeConfigs, // 深度合并配置对象（防止循环引用）
    
    setObjectOpacity, // 设置物体透明度（自动保存原始材质）
    restoreOriginalOpacity, // 恢复物体的原始透明度（使用之前在setObjectOpacity中保存的材质信息）

    ccw, // 判断三点是否构成逆时针转向
    computeConvexHull, // 计算点集的凸包

    extractObjectContour, // 提取3D对象的2D平面轮廓（俯视视角）,专用于房间
    extractAndSaveObjectBounding, // 为对象提取并保存轮廓信息到userData
    centerContourAtOrigin, // 将轮廓的几何中心移动到原点

    objectToVector3, // 对象转向量
    vector3ToObject, // 向量转对象

    changeMeshColor, // 将 mesh 的材质克隆并修改颜色，原始材质保存在 mesh.userData
    restoreMeshOriginalMaterial // 从 mesh.userData 恢复原始材质
} 