import { App, PluginSettingTab, Setting } from "obsidian";
import type MosaicPlugin from "./main";

export interface MosaicPluginSettings {
	showExportBtn: boolean;
}

export const DEFAULT_SETTINGS: MosaicPluginSettings = {
	showExportBtn: false,
};

export class MosaicSettingTab extends PluginSettingTab {
	private readonly plugin: MosaicPlugin;

	constructor(app: App, plugin: MosaicPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		this.containerEl.empty();

		new Setting(this.containerEl)
			.setName("Show export button")
			.setDesc("Add a PNG export button to the controls above each chart.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showExportBtn)
					.onChange(async (value) => {
						this.plugin.settings.showExportBtn = value;
						await this.plugin.saveSettings();
						// 已经渲染出来的图表读的是渲染那一刻的设置值。不重建的话，
						// 开关只对之后才打开的笔记生效，看上去就是「开了没反应」。
						this.plugin.rerenderOpenPreviews();
					}),
			);
	}
}
