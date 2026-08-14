import { App, Platform, PluginSettingTab, Setting } from 'obsidian';
import MosaicPlugin from "./main";
import { getFolderOptions } from './tools';

export interface MosaicPluginSettings {
	dataPath: string;
	theme: string;
	backgroundColor: string;
	paddingTop: number;
	paddingRight: number;
	paddingBottom: number;
	paddingLeft: number;
	wordCountFilter: string;
	showExportBtn: boolean;
}

export const DEFAULT_SETTINGS: MosaicPluginSettings = {
	theme: 'default',
	dataPath: '',
	backgroundColor: 'transparent',
	paddingTop: 0,
	paddingRight: 0,
	paddingBottom: 0,
	paddingLeft: 0,
	showExportBtn: false,
	wordCountFilter: `[A-z]{1,2}
[0-9]+
(?=[MDCLXVI])M*(C[MD]|D?C*)(X[CL]|L?X*)(I[XV]|V?I*)
and
are
but
did
for
get
got
had
has
her
him
his
its
not
our
she
the
was
you
been
from
have
into
mine
ours
that
them
they
this
went
were
with
these
those`
}

export class MosaicSettingTab extends PluginSettingTab {

	constructor(app: App, private plugin: MosaicPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl('h2', {text: 'Mosaic Settings'});

		new Setting(containerEl)
			.setName("Theme")
			.setDesc("Choose default color scheme.")
			.addDropdown(dropdown => dropdown
				.addOption("default", "default")
				.addOption("dark", "dark")
				.addOption("theme1", "Theme #1")
				.addOption("theme2", "Theme #2")
				.setValue(this.plugin.settings.theme)
				.onChange(async (value) => {
					this.plugin.settings.theme = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Background Color")
			.setDesc("Change the background color of chart. e.g., #FFFFFF")
			.addText(text => text
				.setPlaceholder("transparent")
				.setValue(this.plugin.settings.backgroundColor)
				.onChange(async (value) => {
					this.plugin.settings.backgroundColor = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Chart Padding")
			.setDesc("Change the padding of chart. (Top, Right, Bottom, Left)")
			.addText(text => {
				text.inputEl.size = 5;
				text
					.setPlaceholder("30")
					.setValue(String(this.plugin.settings.paddingTop))
					.onChange(async (value) => {
						this.plugin.settings.paddingTop = Number(value);
						await this.plugin.saveSettings();
					});
			})
			.addText(text => {
				text.inputEl.size = 5;
				text
					.setPlaceholder("30")
					.setValue(String(this.plugin.settings.paddingRight))
					.onChange(async (value) => {
						this.plugin.settings.paddingRight = Number(value);
						await this.plugin.saveSettings();
					});
			})
			.addText(text => {
				text.inputEl.size = 5;
				text
					.setPlaceholder("30")
					.setValue(String(this.plugin.settings.paddingBottom))
					.onChange(async (value) => {
						this.plugin.settings.paddingBottom = Number(value);
						await this.plugin.saveSettings();
					});
			})
			.addText(text => {
				text.inputEl.size = 5;
				text
					.setPlaceholder("30")
					.setValue(String(this.plugin.settings.paddingLeft))
					.onChange(async (value) => {
						this.plugin.settings.paddingLeft = Number(value);
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Data Folder")
			.setDesc("Choose default folder for loading chart datas.")
			.addDropdown(dropdown => dropdown
				.addOptions(getFolderOptions(this.app))
				.setValue(this.plugin.settings.dataPath)
				.onChange(async (value) => {
					this.plugin.settings.dataPath = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Show Export Button")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showExportBtn)
				.onChange(async (value) => {
					this.plugin.settings.showExportBtn = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Word Filter")
			.setDesc("For word count, any words in the list will be ignored.")
			.addTextArea(text => {
				text.inputEl.rows = 6;
				text
					.setValue(this.plugin.settings.wordCountFilter)
					.onChange(async (value) => {
						this.plugin.settings.wordCountFilter = value;
						await this.plugin.saveSettings();
					});
			});

	}
}
