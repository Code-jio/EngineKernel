import { PluginManager } from "@/core/pluginManager"
import { expect } from "chai"
import sinon from "sinon"

describe("PluginManager 测试", () => {
    let pluginManager
    const mockCore = {
        gpuManager: {
            createTexture: sinon.stub(),
            createBuffer: sinon.stub(),
        },
    }

    beforeEach(() => {
        pluginManager = new PluginManager(mockCore)
    })

    it("应正确加载合法插件", () => {
        const validPlugin = {
            install: sinon.stub(),
            uninstall: sinon.stub(),
            version: "1.0.0",
        }

        const result = pluginManager.validatePlugin(validPlugin)
        expect(result.valid).to.be.true

        pluginManager.loadPlugin(validPlugin)
        expect(validPlugin.install.calledOnce).to.be.true
    })

    it("应拒绝非法插件格式", () => {
        const invalidPlugin = {
            install: "notFunction",
        }

        const result = pluginManager.validatePlugin(invalidPlugin)
        expect(result.valid).to.be.false
        expect(result.errors).to.include("缺少必需的uninstall方法")
    })
})
