import { BasePlugin, THREE } from "../basePlugin";
import eventBus from "../../eventBus/eventBus";

/**
 * 拾取结果管理
详细拾取信息：物体ID、世界坐标、局部坐标、UV坐标、法向量
拾取历史记录：支持撤销/重做操作
选中状态管理：高亮显示、边框效果、颜色变化
⚡ 性能优化
空间分割：使用八叉树、BSP树等加速结构
视锥裁剪：只检测可见区域内的物体
LOD支持：根据距离使用不同精度的碰撞体
异步拾取：大场景下分帧处理，避免卡顿
🎮 交互体验
拾取预览：鼠标悬停时的即时反馈
拾取滤镜：按图层、标签、类型过滤可拾取物体
拾取热键：支持键盘组合键改变拾取行为
触摸设备支持：移动端的触摸拾取
🔧 调试和可视化
debug模式：显示射线、包围盒、碰撞网格
性能监控：拾取耗时、检测物体数量统计
可视化工具：拾取区域高亮、射线可视化
🛠 配置和扩展
回调系统：拾取开始、进行中、完成、失败等事件
插件化架构：支持自定义拾取算法
配置选项：拾取精度、性能等级、效果开关
💡 高级功能
语义拾取：支持拾取物体的子组件（如模型的某个部件）
区域拾取：矩形选框、圆形选框、自由绘制选框
智能拾取：根据场景复杂度自动调整算法
批量操作：对拾取结果进行批量变换、删除等
 */

// 拾取模式枚举
enum PickMode {
    SINGLE = 'single',      // 单选
    MULTI = 'multi',        // 多选
    BOX_SELECT = 'box'      // 框选
}

// 拾取结果接口
interface PickResult {
    object: THREE.Object3D;          // 被拾取的物体
    point: THREE.Vector3;            // 世界坐标交点
    localPoint: THREE.Vector3;       // 局部坐标交点
    distance: number;                // 距离摄像机的距离
    face?: THREE.Face;               // 相交的面（如果有）
    faceIndex?: number;              // 面索引
    uv?: THREE.Vector2;              // UV坐标
    normal?: THREE.Vector3;          // 法向量
    object3D?: THREE.Object3D;       // 原始THREE对象
}

// 拾取配置接口
interface PickConfig {
    mode: PickMode;                  // 拾取模式
    tolerance: number;               // 拾取容差（像素）
    maxDistance: number;             // 最大拾取距离
    sortByDistance: boolean;         // 是否按距离排序
    includeInvisible: boolean;       // 是否包含不可见物体
    recursive: boolean;              // 是否递归检测子物体
    enableDebug: boolean;            // 是否开启调试模式
}

// 框选区域接口
interface BoxSelectArea {
    startX: number;
    startY: number;
    endX: number;
    endY: number;
}

/**
 * 鼠标拾取插件
 * 支持射线投射拾取、多种拾取模式、精度控制和深度排序
 */
export class MousePickPlugin extends BasePlugin {
    // 核心组件
    private raycaster: THREE.Raycaster;
    private mouse: THREE.Vector2;
    private camera: THREE.Camera | null = null;
    private scene: THREE.Scene | null = null;
    private renderer: THREE.WebGLRenderer | null = null;

    // 拾取配置
    private config: PickConfig = {
        mode: PickMode.SINGLE,
        tolerance: 0,
        maxDistance: Infinity,
        sortByDistance: true,
        includeInvisible: false,
        recursive: true,
        enableDebug: false
    };

    // 选中状态管理
    private selectedObjects: Set<THREE.Object3D> = new Set();
    private hoveredObject: THREE.Object3D | null = null;

    // 框选相关
    private isBoxSelecting = false;
    private boxSelectArea: BoxSelectArea | null = null;
    private boxSelectElement: HTMLDivElement | null = null;

    // 事件绑定
    private boundMouseDown: (e: MouseEvent) => void;
    private boundMouseMove: (e: MouseEvent) => void;
    private boundMouseUp: (e: MouseEvent) => void;
    private boundKeyDown: (e: KeyboardEvent) => void;
    private boundKeyUp: (e: KeyboardEvent) => void;

    // 调试可视化
    private debugRayLine: THREE.Line | null = null;
    private debugEnabled = false;

    // 按键状态
    private isCtrlPressed = false;
    private isShiftPressed = false;

    constructor(meta: any) {
        super(meta);

        // 初始化射线投射器
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        // 验证必要参数
        if (!meta.userData?.camera) {
            throw new Error("MousePickPlugin 需要在 meta.userData.camera 中提供摄像机实例");
        }
        if (!meta.userData?.scene) {
            throw new Error("MousePickPlugin 需要在 meta.userData.scene 中提供场景实例");
        }
        if (!meta.userData?.renderer) {
            throw new Error("MousePickPlugin 需要在 meta.userData.renderer 中提供渲染器实例");
        }

        this.camera = meta.userData.camera;
        this.scene = meta.userData.scene;
        this.renderer = meta.userData.renderer;

        // 绑定事件处理函数
        this.boundMouseDown = this.handleMouseDown.bind(this);
        this.boundMouseMove = this.handleMouseMove.bind(this);
        this.boundMouseUp = this.handleMouseUp.bind(this);
        this.boundKeyDown = this.handleKeyDown.bind(this);
        this.boundKeyUp = this.handleKeyUp.bind(this);

        this.initializeEventListeners();
        this.createBoxSelectElement();
    }

    /**
     * 初始化事件监听器
     */
    private initializeEventListeners(): void {
        const canvas = this.renderer?.domElement;
        if (!canvas) return;

        canvas.addEventListener('mousedown', this.boundMouseDown);
        canvas.addEventListener('mousemove', this.boundMouseMove);
        canvas.addEventListener('mouseup', this.boundMouseUp);
        
        window.addEventListener('keydown', this.boundKeyDown);
        window.addEventListener('keyup', this.boundKeyUp);
    }

    /**
     * 创建框选元素
     */
    private createBoxSelectElement(): void {
        this.boxSelectElement = document.createElement('div');
        this.boxSelectElement.style.position = 'absolute';
        this.boxSelectElement.style.border = '1px dashed #fff';
        this.boxSelectElement.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
        this.boxSelectElement.style.pointerEvents = 'none';
        this.boxSelectElement.style.display = 'none';
        this.boxSelectElement.style.zIndex = '9999';
        document.body.appendChild(this.boxSelectElement);
    }

    /**
     * 鼠标按下事件处理
     */
    private handleMouseDown(event: MouseEvent): void {
        if (event.button !== 0) return; // 只处理左键

        this.updateMousePosition(event);

        // 根据当前模式和按键状态决定行为
        if (this.config.mode === PickMode.BOX_SELECT || this.isShiftPressed) {
            this.startBoxSelection(event);
        } else {
            this.performRaycastPick(event);
        }
    }

    /**
     * 鼠标移动事件处理
     */
    private handleMouseMove(event: MouseEvent): void {
        this.updateMousePosition(event);

        if (this.isBoxSelecting) {
            this.updateBoxSelection(event);
        } else {
            // 悬停检测
            this.performHoverDetection(event);
        }

        // 更新调试射线
        if (this.debugEnabled) {
            this.updateDebugRay();
        }
    }

    /**
     * 鼠标抬起事件处理
     */
    private handleMouseUp(event: MouseEvent): void {
        if (this.isBoxSelecting) {
            this.finishBoxSelection(event);
        }
    }

    /**
     * 键盘按下事件处理
     */
    private handleKeyDown(event: KeyboardEvent): void {
        if (event.code === 'ControlLeft' || event.code === 'ControlRight') {
            this.isCtrlPressed = true;
        }
        if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
            this.isShiftPressed = true;
        }
    }

    /**
     * 键盘抬起事件处理
     */
    private handleKeyUp(event: KeyboardEvent): void {
        if (event.code === 'ControlLeft' || event.code === 'ControlRight') {
            this.isCtrlPressed = false;
        }
        if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
            this.isShiftPressed = false;
        }
    }

    /**
     * 更新鼠标标准化坐标
     */
    private updateMousePosition(event: MouseEvent): void {
        const canvas = this.renderer?.domElement;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    }

    /**
     * 执行射线投射拾取
     */
    private performRaycastPick(event: MouseEvent): void {
        if (!this.camera || !this.scene) return;

        // 设置射线
        this.raycaster.setFromCamera(this.mouse, this.camera);
        
        // 设置射线参数
        if (this.config.maxDistance !== Infinity) {
            this.raycaster.far = this.config.maxDistance;
        }

        // 获取拾取目标
        const targets = this.getPickableObjects();
        const intersects = this.raycaster.intersectObjects(targets, this.config.recursive);

        // 过滤结果
        const filteredResults = this.filterIntersections(intersects);

        if (filteredResults.length > 0) {
            this.handlePickResults(filteredResults, event);
        } else {
            // 没有拾取到物体，清空选择（如果不是多选模式）
            if (!this.isCtrlPressed && this.config.mode !== PickMode.MULTI) {
                this.clearSelection();
            }
        }
    }

    /**
     * 获取可拾取的物体列表
     */
    private getPickableObjects(): THREE.Object3D[] {
        if (!this.scene) return [];

        const objects: THREE.Object3D[] = [];
        this.scene.traverse((child) => {
            // 跳过不可见物体（除非配置允许）
            if (!child.visible && !this.config.includeInvisible) return;
            
            // 跳过没有几何体的物体
            if (!(child as any).geometry && !(child as any).isMesh) return;
            
            objects.push(child);
        });

        return objects;
    }

    /**
     * 过滤交点结果
     */
    private filterIntersections(intersects: THREE.Intersection[]): PickResult[] {
        let results: PickResult[] = intersects.map(intersect => ({
            object: intersect.object,
            point: intersect.point,
            localPoint: intersect.point.clone(),
            distance: intersect.distance,
            face: intersect.face || undefined,
            faceIndex: intersect.faceIndex,
            uv: intersect.uv,
            normal: intersect.face?.normal,
            object3D: intersect.object
        }));

        // 距离过滤
        if (this.config.maxDistance !== Infinity) {
            results = results.filter(result => result.distance <= this.config.maxDistance);
        }

        // 排序
        if (this.config.sortByDistance) {
            results.sort((a, b) => a.distance - b.distance);
        }

        return results;
    }

    /**
     * 处理拾取结果
     */
    private handlePickResults(results: PickResult[], event: MouseEvent): void {
        const closestResult = results[0];

        if (this.isCtrlPressed || this.config.mode === PickMode.MULTI) {
            // 多选模式：切换选中状态
            this.toggleObjectSelection(closestResult.object);
        } else {
            // 单选模式：选中当前物体
            this.selectSingleObject(closestResult.object);
        }

        // 发送拾取事件
        this.emitPickEvent('object-picked', {
            results,
            selectedObject: closestResult.object,
            mouseEvent: event,
            pickMode: this.config.mode
        });
    }

    /**
     * 开始框选
     */
    private startBoxSelection(event: MouseEvent): void {
        this.isBoxSelecting = true;
        const rect = this.renderer?.domElement.getBoundingClientRect();
        if (!rect) return;

        this.boxSelectArea = {
            startX: event.clientX - rect.left,
            startY: event.clientY - rect.top,
            endX: event.clientX - rect.left,
            endY: event.clientY - rect.top
        };

        if (this.boxSelectElement) {
            this.boxSelectElement.style.display = 'block';
            this.updateBoxSelectDisplay();
        }
    }

    /**
     * 更新框选
     */
    private updateBoxSelection(event: MouseEvent): void {
        if (!this.boxSelectArea) return;

        const rect = this.renderer?.domElement.getBoundingClientRect();
        if (!rect) return;

        this.boxSelectArea.endX = event.clientX - rect.left;
        this.boxSelectArea.endY = event.clientY - rect.top;

        this.updateBoxSelectDisplay();
    }

    /**
     * 更新框选显示
     */
    private updateBoxSelectDisplay(): void {
        if (!this.boxSelectElement || !this.boxSelectArea) return;

        const left = Math.min(this.boxSelectArea.startX, this.boxSelectArea.endX);
        const top = Math.min(this.boxSelectArea.startY, this.boxSelectArea.endY);
        const width = Math.abs(this.boxSelectArea.endX - this.boxSelectArea.startX);
        const height = Math.abs(this.boxSelectArea.endY - this.boxSelectArea.startY);

        const rect = this.renderer?.domElement.getBoundingClientRect();
        if (!rect) return;

        this.boxSelectElement.style.left = `${rect.left + left}px`;
        this.boxSelectElement.style.top = `${rect.top + top}px`;
        this.boxSelectElement.style.width = `${width}px`;
        this.boxSelectElement.style.height = `${height}px`;
    }

    /**
     * 完成框选
     */
    private finishBoxSelection(event: MouseEvent): void {
        if (!this.boxSelectArea) return;

        // 计算框选区域内的物体
        const objectsInBox = this.getObjectsInBox(this.boxSelectArea);

        // 处理选择
        if (!this.isCtrlPressed) {
            this.clearSelection();
        }

        objectsInBox.forEach(obj => this.addToSelection(obj));

        // 隐藏框选元素
        if (this.boxSelectElement) {
            this.boxSelectElement.style.display = 'none';
        }

        this.isBoxSelecting = false;
        this.boxSelectArea = null;

        // 发送框选事件
        this.emitPickEvent('box-select-finished', {
            selectedObjects: Array.from(this.selectedObjects),
            boxArea: this.boxSelectArea
        });
    }

    /**
     * 获取框选区域内的物体
     */
    private getObjectsInBox(box: BoxSelectArea): THREE.Object3D[] {
        if (!this.camera || !this.scene) return [];

        const objects: THREE.Object3D[] = [];
        const targets = this.getPickableObjects();

        // 将框选区域转换为标准化坐标
        const rect = this.renderer?.domElement.getBoundingClientRect();
        if (!rect) return [];

        const left = Math.min(box.startX, box.endX) / rect.width * 2 - 1;
        const right = Math.max(box.startX, box.endX) / rect.width * 2 - 1;
        const top = -(Math.min(box.startY, box.endY) / rect.height * 2 - 1);
        const bottom = -(Math.max(box.startY, box.endY) / rect.height * 2 - 1);

        targets.forEach(obj => {
            // 获取物体的屏幕投影位置
            const worldPos = new THREE.Vector3();
            obj.getWorldPosition(worldPos);
            
            const screenPos = worldPos.project(this.camera!);
            
            // 检查是否在框选区域内
            if (screenPos.x >= left && screenPos.x <= right &&
                screenPos.y >= bottom && screenPos.y <= top) {
                objects.push(obj);
            }
        });

        return objects;
    }

    /**
     * 悬停检测
     */
    private performHoverDetection(event: MouseEvent): void {
        if (!this.camera || !this.scene) return;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const targets = this.getPickableObjects();
        const intersects = this.raycaster.intersectObjects(targets, this.config.recursive);

        const newHoveredObject = intersects.length > 0 ? intersects[0].object : null;

        if (newHoveredObject !== this.hoveredObject) {
            // 发送悬停变化事件
            this.emitPickEvent('hover-changed', {
                previousObject: this.hoveredObject,
                currentObject: newHoveredObject,
                mouseEvent: event
            });

            this.hoveredObject = newHoveredObject;
        }
    }

    /**
     * 选中单个物体
     */
    private selectSingleObject(object: THREE.Object3D): void {
        this.clearSelection();
        this.addToSelection(object);
    }

    /**
     * 切换物体选中状态
     */
    private toggleObjectSelection(object: THREE.Object3D): void {
        if (this.selectedObjects.has(object)) {
            this.removeFromSelection(object);
        } else {
            this.addToSelection(object);
        }
    }

    /**
     * 添加到选中列表
     */
    private addToSelection(object: THREE.Object3D): void {
        this.selectedObjects.add(object);
        this.emitPickEvent('object-selected', { object });
    }

    /**
     * 从选中列表移除
     */
    private removeFromSelection(object: THREE.Object3D): void {
        this.selectedObjects.delete(object);
        this.emitPickEvent('object-deselected', { object });
    }

    /**
     * 清空选择
     */
    private clearSelection(): void {
        const previousSelected = Array.from(this.selectedObjects);
        this.selectedObjects.clear();
        
        if (previousSelected.length > 0) {
            this.emitPickEvent('selection-cleared', { previousSelected });
        }
    }

    /**
     * 更新调试射线
     */
    private updateDebugRay(): void {
        if (!this.debugRayLine || !this.camera) return;

        const rayOrigin = this.raycaster.ray.origin;
        const rayDirection = this.raycaster.ray.direction;
        const rayEnd = rayOrigin.clone().add(rayDirection.clone().multiplyScalar(100));

        const points = [rayOrigin, rayEnd];
        this.debugRayLine.geometry.setFromPoints(points);
    }

    /**
     * 发送拾取事件
     */
    private emitPickEvent(eventName: string, data: any): void {
        eventBus.emit(`mouse-pick:${eventName}`, data);
    }

    // ==================== 公共API ====================

    /**
     * 设置拾取配置
     */
    public setConfig(config: Partial<PickConfig>): void {
        this.config = { ...this.config, ...config };
        
        // 如果调试模式发生变化，更新调试可视化
        if (config.enableDebug !== undefined) {
            this.enableDebug(config.enableDebug);
        }
    }

    /**
     * 获取当前配置
     */
    public getConfig(): PickConfig {
        return { ...this.config };
    }

    /**
     * 设置拾取模式
     */
    public setPickMode(mode: PickMode): void {
        this.config.mode = mode;
    }

    /**
     * 设置拾取容差
     */
    public setTolerance(tolerance: number): void {
        this.config.tolerance = Math.max(0, tolerance);
    }

    /**
     * 获取当前选中的物体
     */
    public getSelectedObjects(): THREE.Object3D[] {
        return Array.from(this.selectedObjects);
    }

    /**
     * 获取当前悬停的物体
     */
    public getHoveredObject(): THREE.Object3D | null {
        return this.hoveredObject;
    }

    /**
     * 启用/禁用调试模式
     */
    public enableDebug(enable: boolean): void {
        this.debugEnabled = enable;
        
        if (enable && !this.debugRayLine && this.scene) {
            // 创建调试射线
            const geometry = new THREE.BufferGeometry();
            const material = new THREE.LineBasicMaterial({ color: 0xff0000 });
            this.debugRayLine = new THREE.Line(geometry, material);
            this.scene.add(this.debugRayLine);
        } else if (!enable && this.debugRayLine && this.scene) {
            // 移除调试射线
            this.scene.remove(this.debugRayLine);
            this.debugRayLine.geometry.dispose();
            (this.debugRayLine.material as THREE.Material).dispose();
            this.debugRayLine = null;
        }
    }

    /**
     * 手动执行拾取（用于编程式拾取）
     */
    public pickAtPosition(x: number, y: number): PickResult[] {
        // 转换为标准化坐标
        const rect = this.renderer?.domElement.getBoundingClientRect();
        if (!rect) return [];

        this.mouse.x = ((x - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((y - rect.top) / rect.height) * 2 + 1;

        if (!this.camera || !this.scene) return [];

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const targets = this.getPickableObjects();
        const intersects = this.raycaster.intersectObjects(targets, this.config.recursive);

        return this.filterIntersections(intersects);
    }

    /**
     * 销毁插件
     */
    public destroy(): void {
        // 移除事件监听器
        const canvas = this.renderer?.domElement;
        if (canvas) {
            canvas.removeEventListener('mousedown', this.boundMouseDown);
            canvas.removeEventListener('mousemove', this.boundMouseMove);
            canvas.removeEventListener('mouseup', this.boundMouseUp);
        }
        
        window.removeEventListener('keydown', this.boundKeyDown);
        window.removeEventListener('keyup', this.boundKeyUp);

        // 清理框选元素
        if (this.boxSelectElement) {
            document.body.removeChild(this.boxSelectElement);
            this.boxSelectElement = null;
        }

        // 清理调试射线
        this.enableDebug(false);

        // 清空状态
        this.clearSelection();
        this.selectedObjects.clear();
        this.hoveredObject = null;

        // 清空引用
        this.camera = null;
        this.scene = null;
        this.renderer = null;
    }
}