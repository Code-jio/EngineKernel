const { Core } = require("../../src/core/core")
const { PluginManager } = require("../../src/core/pluginManager")
const { expect } = require("chai")

describe("核心模块测试", () => {
    let core

    beforeEach(() => {
        core = new Core()
    })

    it("应正确初始化插件管理器", () => {
        expect(core.pluginManager).to.be.instanceOf(PluginManager)
    })

    it("应处理插件加载生命周期", async () => {
        const mockPlugin = {
            install: sinon.stub(),
            uninstall: sinon.stub(),
        }

        await core.pluginManager.loadPlugin(mockPlugin)
        expect(mockPlugin.install.calledOnce).to.be.true

        core.pluginManager.unloadPlugin(mockPlugin)
        expect(mockPlugin.uninstall.calledOnce).to.be.true
    })
})
