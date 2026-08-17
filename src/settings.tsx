import { App, PluginSettingTab, SettingDefinitionItem } from "obsidian";
import type MosaicPlugin from "./main";

export interface MosaicPluginSettings {
	showExportBtn: boolean;
}

export const DEFAULT_SETTINGS: MosaicPluginSettings = {
	showExportBtn: false,
};

// 控件 key 就是设置字段名。写成常量而不是各处重复字面量：改字段名时
// getControlValue / setControlValue 会跟着编译期报错，不会只改一半。
const SHOW_EXPORT_BTN = "showExportBtn" satisfies keyof MosaicPluginSettings;

// 声明式设置（1.13.0 起）而不是 display()：只有声明出来的设置项才进得了 Obsidian
// 设置页的搜索索引，用 display() 手工画的那份对搜索是隐形的。本插件的 minAppVersion
// 就是 1.13.0，所以不保留 display() 那条向下兼容的老路——它已被官方标记废弃，且
// getSettingDefinitions 返回非空时宿主根本不会调用它。
export class MosaicSettingTab extends PluginSettingTab {
	private readonly plugin: MosaicPlugin;

	constructor(app: App, plugin: MosaicPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				name: "Show export button",
				desc: "Add a PNG export button to the controls above each chart.",
				control: {
					type: "toggle",
					key: SHOW_EXPORT_BTN,
					defaultValue: DEFAULT_SETTINGS.showExportBtn,
				},
			},
		];
	}

	// 基类的默认实现读写宿主自己的配置存储；本插件的设置在 plugin.settings 里，
	// 两个方向都要接管，否则开关读到的和写下去的不是同一份数据。
	getControlValue(key: string): unknown {
		if (key !== SHOW_EXPORT_BTN) return undefined;
		return this.plugin.settings.showExportBtn;
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		if (key !== SHOW_EXPORT_BTN) return;
		this.plugin.settings.showExportBtn = Boolean(value);
		await this.plugin.saveSettings();
		// 已经渲染出来的图表读的是渲染那一刻的设置值。不重建的话，开关只对之后才
		// 打开的笔记生效，看上去就是「开了没反应」。
		this.plugin.rerenderOpenPreviews();
	}
}
