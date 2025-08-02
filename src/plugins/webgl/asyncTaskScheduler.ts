// 异步任务调度器模块
import eventBus from "../../eventBus/eventBus"

/**
 * 任务优先级枚举
 */
export enum TaskPriority {
    LOW = 0,
    NORMAL = 1,
    HIGH = 2,
    URGENT = 3,
}

/**
 * 任务状态枚举
 */
export enum TaskStatus {
    PENDING = "pending",
    QUEUED = "queued",
    RUNNING = "running",
    COMPLETED = "completed",
    FAILED = "failed",
    CANCELLED = "cancelled",
    TIMEOUT = "timeout",
}

/**
 * 任务配置接口
 */
export interface TaskConfig {
    id: string
    url: string
    priority: TaskPriority
    timeout?: number // 超时时间（毫秒）
    retryCount?: number // 重试次数
    category?: string // 任务分类
    metadata?: any // 任务元数据
}

/**
 * 任务执行结果接口
 */
export interface TaskResult<T = any> {
    taskId: string
    success: boolean
    data?: T
    error?: Error
    executionTime: number
    retryCount: number
    fromCache: boolean
}

/**
 * 任务进度接口
 */
export interface TaskProgress {
    taskId: string
    loaded: number
    total: number
    percentage: number
    stage: string
}

/**
 * 异步任务接口
 */
export interface AsyncTask<T = any> {
    config: TaskConfig
    status: TaskStatus
    startTime: number
    completionTime?: number
    executionTime: number
    retryCount: number
    error?: Error
    result?: T
    promise: Promise<TaskResult<T>>
    resolve: (result: TaskResult<T>) => void
    reject: (error: Error) => void
    abortController: AbortController
    onProgress?: (progress: TaskProgress) => void
    onComplete?: (result: TaskResult<T>) => void
    onError?: (error: Error) => void
}

/**
 * 队列配置接口
 */
export interface QueueConfig {
    maxConcurrentTasks: number // 最大并发任务数
    maxQueueSize: number // 最大队列大小
    defaultTimeout: number // 默认超时时间
    defaultRetryCount: number // 默认重试次数
    priorityWeights: Record<TaskPriority, number> // 优先级权重
}

/**
 * 单个任务执行器
 */
export class TaskRunner<T = any> {
    private task: AsyncTask<T>
    private executor: (task: AsyncTask<T>) => Promise<T>

    constructor(task: AsyncTask<T>, executor: (task: AsyncTask<T>) => Promise<T>) {
        this.task = task
        this.executor = executor
    }

    /**
     * 执行任务
     */
    async execute(): Promise<TaskResult<T>> {
        const startTime = Date.now()
        this.task.startTime = startTime
        this.task.status = TaskStatus.RUNNING

        try {
            // 设置超时
            const timeout = this.task.config.timeout || 30000
            const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => {
                    this.task.abortController.abort()
                    reject(new Error(`Task timeout after ${timeout}ms`))
                }, timeout)
            })

            // 执行任务
            const result = await Promise.race([this.executor(this.task), timeoutPromise])

            const executionTime = Date.now() - startTime
            this.task.executionTime = executionTime
            this.task.completionTime = Date.now()
            this.task.status = TaskStatus.COMPLETED
            this.task.result = result

            const taskResult: TaskResult<T> = {
                taskId: this.task.config.id,
                success: true,
                data: result,
                executionTime,
                retryCount: this.task.retryCount,
                fromCache: false,
            }

            // 触发完成回调
            if (this.task.onComplete) {
                this.task.onComplete(taskResult)
            }

            return taskResult
        } catch (error) {
            const executionTime = Date.now() - startTime
            this.task.executionTime = executionTime
            this.task.error = error as Error

            // 判断是否为超时错误
            if (error instanceof Error && error.message.includes("timeout")) {
                this.task.status = TaskStatus.TIMEOUT
            } else {
                this.task.status = TaskStatus.FAILED
            }

            const taskResult: TaskResult<T> = {
                taskId: this.task.config.id,
                success: false,
                error: error as Error,
                executionTime,
                retryCount: this.task.retryCount,
                fromCache: false,
            }

            // 触发错误回调
            if (this.task.onError) {
                this.task.onError(error as Error)
            }

            throw taskResult
        }
    }

    /**
     * 取消任务
     */
    cancel(): void {
        this.task.abortController.abort()
        this.task.status = TaskStatus.CANCELLED
    }

    /**
     * 更新进度
     */
    updateProgress(loaded: number, total: number, stage: string = "loading"): void {
        const progress: TaskProgress = {
            taskId: this.task.config.id,
            loaded,
            total,
            percentage: total > 0 ? (loaded / total) * 100 : 0,
            stage,
        }

        if (this.task.onProgress) {
            this.task.onProgress(progress)
        }

        eventBus.emit("task:progress", progress)
    }
}

/**
 * 智能异步队列
 */
export class AsyncQueue<T = any> {
    private queue: AsyncTask<T>[] = []
    private runningTasks: Map<string, AsyncTask<T>> = new Map()
    private completedTasks: Map<string, TaskResult<T>> = new Map()
    private config: QueueConfig

    constructor(config: Partial<QueueConfig> = {}) {
        this.config = {
            maxConcurrentTasks: 3,
            maxQueueSize: 100,
            defaultTimeout: 30000,
            defaultRetryCount: 3,
            priorityWeights: {
                [TaskPriority.LOW]: 1,
                [TaskPriority.NORMAL]: 2,
                [TaskPriority.HIGH]: 4,
                [TaskPriority.URGENT]: 8,
            },
            ...config,
        }
    }

    /**
     * 添加任务到队列
     */
    enqueue(taskConfig: TaskConfig): AsyncTask<T> {
        // 检查队列大小
        if (this.queue.length >= this.config.maxQueueSize) {
            throw new Error(`Queue is full (max: ${this.config.maxQueueSize})`)
        }

        // 检查是否已有相同任务
        const existingTask = this.findTask(taskConfig.id)
        if (existingTask) {
            return existingTask
        }

        // 创建任务
        const task = this.createTask(taskConfig)

        // 按优先级插入队列
        this.insertByPriority(task)

        // console.log(`📋 任务已加入队列: ${taskConfig.id} (优先级: ${TaskPriority[taskConfig.priority]})`)

        eventBus.emit("queue:enqueue", {
            taskId: task.config.id,
            queueSize: this.queue.length,
            priority: task.config.priority.toString(),
        })

        return task
    }

    /**
     * 从队列获取下一个任务
     */
    dequeue(): AsyncTask<T> | null {
        if (this.queue.length === 0) {
            return null
        }

        // 使用加权随机选择算法，提高高优先级任务的选中概率
        const task = this.selectByWeightedPriority()

        if (task) {
            const index = this.queue.indexOf(task)
            this.queue.splice(index, 1)
            task.status = TaskStatus.QUEUED

            // console.log(`📤 任务出队列: ${task.config.id}`)

            eventBus.emit("queue:dequeue", {
                taskId: task.config.id,
                queueSize: this.queue.length,
            })
        }

        return task
    }

    /**
     * 创建任务
     */
    private createTask(taskConfig: TaskConfig): AsyncTask<T> {
        const abortController = new AbortController()

        let resolve: (result: TaskResult<T>) => void
        let reject: (error: Error) => void

        const promise = new Promise<TaskResult<T>>((res, rej) => {
            resolve = res
            reject = rej
        })

        return {
            config: {
                ...taskConfig,
                timeout: taskConfig.timeout || this.config.defaultTimeout,
                retryCount: taskConfig.retryCount || this.config.defaultRetryCount,
            },
            status: TaskStatus.PENDING,
            startTime: 0,
            executionTime: 0,
            retryCount: 0,
            promise,
            resolve: resolve!,
            reject: reject!,
            abortController,
        }
    }

    /**
     * 按优先级插入任务
     */
    insertByPriority(task: AsyncTask<T>): void {
        let insertIndex = this.queue.length

        // 找到合适的插入位置
        for (let i = 0; i < this.queue.length; i++) {
            if (task.config.priority > this.queue[i].config.priority) {
                insertIndex = i
                break
            }
        }

        this.queue.splice(insertIndex, 0, task)
    }

    /**
     * 使用加权优先级选择任务
     */
    private selectByWeightedPriority(): AsyncTask<T> | null {
        if (this.queue.length === 0) return null
        if (this.queue.length === 1) return this.queue[0]

        // 计算总权重
        let totalWeight = 0
        const weights: number[] = []

        for (const task of this.queue) {
            const weight = this.config.priorityWeights[task.config.priority] || 1
            weights.push(weight)
            totalWeight += weight
        }

        // 加权随机选择
        let random = Math.random() * totalWeight

        for (let i = 0; i < this.queue.length; i++) {
            random -= weights[i]
            if (random <= 0) {
                return this.queue[i]
            }
        }

        // 回退到第一个任务
        return this.queue[0]
    }

    /**
     * 查找任务
     */
    findTask(taskId: string): AsyncTask<T> | null {
        // 在队列中查找
        const queuedTask = this.queue.find(task => task.config.id === taskId)
        if (queuedTask) return queuedTask

        // 在运行中任务中查找
        const runningTask = this.runningTasks.get(taskId)
        if (runningTask) return runningTask

        return null
    }

    /**
     * 移除任务
     */
    removeTask(taskId: string): boolean {
        // 从队列中移除
        const queueIndex = this.queue.findIndex(task => task.config.id === taskId)
        if (queueIndex !== -1) {
            this.queue.splice(queueIndex, 1)
            // console.log(`❌ 任务已从队列移除: ${taskId}`)
            return true
        }

        // 从运行中任务移除
        const runningTask = this.runningTasks.get(taskId)
        if (runningTask) {
            runningTask.abortController.abort()
            runningTask.status = TaskStatus.CANCELLED
            this.runningTasks.delete(taskId)
            // console.log(`❌ 运行中任务已取消: ${taskId}`)
            return true
        }

        return false
    }

    /**
     * 标记任务为运行中
     */
    markAsRunning(task: AsyncTask<T>): void {
        this.runningTasks.set(task.config.id, task)
    }

    /**
     * 标记任务完成
     */
    markAsCompleted(taskId: string, result: TaskResult<T>): void {
        this.runningTasks.delete(taskId)
        this.completedTasks.set(taskId, result)

        // 限制完成任务的缓存大小
        if (this.completedTasks.size > 1000) {
            const firstKey = this.completedTasks.keys().next().value
            if (firstKey !== undefined) {
                this.completedTasks.delete(firstKey)
            }
        }
    }

    /**
     * 获取队列状态
     */
    getStatus() {
        return {
            pending: this.queue.length,
            running: this.runningTasks.size,
            completed: this.completedTasks.size,
            maxConcurrent: this.config.maxConcurrentTasks,
            maxQueueSize: this.config.maxQueueSize,
        }
    }

    /**
     * 清空队列
     */
    clear(): void {
        // 取消所有排队任务
        for (const task of this.queue) {
            task.status = TaskStatus.CANCELLED
            task.reject(new Error("Queue cleared"))
        }
        this.queue = []

        // 取消所有运行中任务
        Array.from(this.runningTasks.entries()).forEach(([taskId, task]) => {
            task.abortController.abort()
            task.status = TaskStatus.CANCELLED
            task.reject(new Error("Queue cleared"))
        })
        this.runningTasks.clear()

        // console.log('🧹 队列已清空')
    }
}

/**
 * 异步任务调度器
 */
export class TaskScheduler<T = any> {
    private queue: AsyncQueue<T>
    private executor: (task: AsyncTask<T>) => Promise<T>
    private isRunning: boolean = false
    private processingInterval: number = 100 // 处理间隔（毫秒）

    constructor(executor: (task: AsyncTask<T>) => Promise<T>, queueConfig: Partial<QueueConfig> = {}) {
        this.executor = executor
        this.queue = new AsyncQueue<T>(queueConfig)
    }

    /**
     * 启动调度器
     */
    start(): void {
        if (this.isRunning) {
            console.warn("⚠️ 调度器已在运行")
            return
        }

        this.isRunning = true
        // console.log('🚀 异步任务调度器已启动')
        this.processQueue()
    }

    /**
     * 停止调度器
     */
    stop(): void {
        this.isRunning = false
        // console.log('⏹️ 异步任务调度器已停止')
    }

    /**
     * 调度任务
     */
    async schedule(taskConfig: TaskConfig): Promise<TaskResult<T>> {
        const task = this.queue.enqueue(taskConfig)
        return task.promise
    }

    /**
     * 批量调度任务
     */
    async scheduleBatch(taskConfigs: TaskConfig[]): Promise<TaskResult<T>[]> {
        const promises = taskConfigs.map(config => this.schedule(config))
        return Promise.allSettled(promises).then(results =>
            results.map(result =>
                result.status === "fulfilled"
                    ? result.value
                    : {
                          taskId: "",
                          success: false,
                          error: new Error("Task failed"),
                          executionTime: 0,
                          retryCount: 0,
                          fromCache: false,
                      },
            ),
        )
    }

    /**
     * 取消任务
     */
    cancel(taskId: string): boolean {
        return this.queue.removeTask(taskId)
    }

    /**
     * 获取任务状态
     */
    getTaskStatus(taskId: string): TaskStatus | null {
        const task = this.queue.findTask(taskId)
        return task ? task.status : null
    }

    /**
     * 获取调度器状态
     */
    getStatus() {
        return {
            ...this.queue.getStatus(),
            isRunning: this.isRunning,
            processingInterval: this.processingInterval,
        }
    }

    /**
     * 处理队列
     */
    private async processQueue(): Promise<void> {
        while (this.isRunning) {
            const status = this.queue.getStatus()

            // 如果有可用并发槽位且队列不为空
            if (status.running < status.maxConcurrent && status.pending > 0) {
                const task = this.queue.dequeue()

                if (task) {
                    this.queue.markAsRunning(task)
                    this.executeTask(task)
                }
            }

            // 等待一段时间再检查
            await this.sleep(this.processingInterval)
        }
    }

    /**
     * 执行单个任务
     */
    private async executeTask(task: AsyncTask<T>): Promise<void> {
        const runner = new TaskRunner(task, this.executor)

        try {
            const result = await runner.execute()
            this.queue.markAsCompleted(task.config.id, result)
            task.resolve(result)

            // console.log(`✅ 任务执行成功: ${task.config.id} (${result.executionTime}ms)`)

            eventBus.emit("task:completed", result)
        } catch (error) {
            // 检查是否需要重试
            if (task.retryCount < (task.config.retryCount || 0) && task.status !== TaskStatus.CANCELLED) {
                task.retryCount++
                task.status = TaskStatus.PENDING

                // console.log(`🔄 任务重试: ${task.config.id} (第${task.retryCount}次)`)

                // 重新加入队列
                this.queue.insertByPriority(task)

                eventBus.emit("task:retry", {
                    taskId: task.config.id,
                    retryCount: task.retryCount,
                    error: task.error,
                })
            } else {
                // 重试次数用完或任务被取消
                const result = error as TaskResult<T>
                this.queue.markAsCompleted(task.config.id, result)
                task.reject(result.error || new Error("Task failed"))

                console.error(`❌ 任务执行失败: ${task.config.id}`, result.error)

                eventBus.emit("task:failed", result)
            }
        }
    }

    /**
     * 休眠函数
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms))
    }

    /**
     * 销毁调度器
     */
    destroy(): void {
        this.stop()
        this.queue.clear()
        // console.log('�� 任务调度器已销毁')
    }
}
