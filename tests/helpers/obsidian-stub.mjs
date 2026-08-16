// tests/helpers/obsidian-stub.mjs
// 打包测试用的 `obsidian` 替身：宿主包本身只发布 .d.ts，运行期没有任何实现。
// 只提供本仓库真正调用到的那几个符号。
export const apiVersion = "1.13.7";

// 图标注入：真身把一段 lucide svg 写进 innerHTML。这里落成一个属性，断言看得见
// 「哪个按钮挂了哪个图标」，又不必真的搬一套 svg 进来。
export function setIcon(el, icon) {
	el.setAttribute("data-icon", icon);
}

export function normalizePath(path) {
	return String(path);
}

export class Component {
	onunload() {}
	onload() {}
}
export class MarkdownRenderChild extends Component {
	constructor(containerEl) {
		super();
		this.containerEl = containerEl;
	}
}
export class Plugin extends Component {}
export class PluginSettingTab {
	constructor(app, plugin) {
		this.app = app;
		this.plugin = plugin;
	}
}
export class Setting {
	constructor() {}
	setName() {
		return this;
	}
	setDesc() {
		return this;
	}
	addToggle() {
		return this;
	}
}
export class MarkdownView {}
export class TFile {}
export class App {}
export class WorkspaceLeaf {}
