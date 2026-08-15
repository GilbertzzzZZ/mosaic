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
			.setDesc("Show a PNG export button when hovering a chart.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showExportBtn)
					.onChange(async (value) => {
						this.plugin.settings.showExportBtn = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}
