import { App, PluginSettingTab, Setting } from 'obsidian';
import MosaicPlugin from "./main";

export interface MosaicPluginSettings {
	showExportBtn: boolean;
}

export const DEFAULT_SETTINGS: MosaicPluginSettings = {
	showExportBtn: false,
};

export class MosaicSettingTab extends PluginSettingTab {

	constructor(app: App, private plugin: MosaicPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl('h2', { text: 'Mosaic Settings' });

		new Setting(containerEl)
			.setName("Show Export Button")
			.setDesc("Show a PNG export button when hovering a chart.")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showExportBtn)
				.onChange(async (value) => {
					this.plugin.settings.showExportBtn = value;
					await this.plugin.saveSettings();
				}));
	}
}
