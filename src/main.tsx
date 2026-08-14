import { fileDialog } from 'file-select-dialog';
import yaml from 'js-yaml';

import React from 'react';
import ReactDOM from 'react-dom';

import { MarkdownPostProcessorContext, MarkdownView, Plugin, Platform } from 'obsidian';
import { Chart } from './components/Chart';
import { parseConfig } from './parser';
import { MosaicPluginSettings, MosaicSettingTab, DEFAULT_SETTINGS } from './settings';
import { insertEditor, parseCsv } from './tools';
import { ChartTemplateSuggestModal } from './components/Modal';
import { ChartWizardModal } from './components/ChartWizardModal';
import { createChartTagProcessor } from './dataset/chart-tag-processor';

const CSV_FILE_EXTENSION = "csv";
const VIEW_TYPE_CSV = "csv";

export default class MosaicPlugin extends Plugin {
	settings: MosaicPluginSettings;

	async MosaicProcessor(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
		ReactDOM.unmountComponentAtNode(el);
		try {
			const chartProps = await parseConfig(source, this, ctx.sourcePath);
			ReactDOM.render(
				<Chart {...chartProps} />,
				el
			);
		} catch (e) {
			ReactDOM.render(
				<div style={{ color: 'var(--text-title-h1)' }}>{e.toString()}</div>,
				el
			);
		}
	}

	rerenderOpenPreviews() {
		this.app.workspace.iterateAllLeaves((leaf) => {
			const view = leaf.view;
			if (view instanceof MarkdownView && view.getMode() === "preview") {
				view.previewMode.rerender(true);
			}
		});
	}

	async onload() {
		try {
			await this.loadSettings();
			this.addSettingTab(new MosaicSettingTab(this.app, this));
			this.registerMarkdownCodeBlockProcessor("chartview", this.MosaicProcessor.bind(this));
			this.registerMarkdownPostProcessor(createChartTagProcessor(this));

			// Sections rendered while this plugin was disabled keep their vanilla
			// (chart-less) HTML forever; force open previews through the processor once.
			this.app.workspace.onLayoutReady(() => this.rerenderOpenPreviews());
			// Theme switches must NOT re-render markdown (races with reading-view
			// virtualization and leaves vanilla sections). Broadcast instead; every
			// mounted ChartFigure rebuilds itself with the current theme. Debounced
			// because one switch fires css-change several times.
			let cssChangeTimer: number | undefined;
			this.registerEvent(
				this.app.workspace.on("css-change", () => {
					window.clearTimeout(cssChangeTimer);
					cssChangeTimer = window.setTimeout(() => {
						window.dispatchEvent(new CustomEvent("mosaic:theme-change"));
					}, 150);
				})
			);

			this.addCommand({
				id: 'insert-mosaic-template',
				name: 'Insert Template',
				editorCallback: (editor) => {
					new ChartTemplateSuggestModal(this.app, editor).open();
				}
			});
			
			this.addCommand({
				id: `mosaic-wizard`,
				name: `Wizard`,
				editorCallback: async (editor) => {
					new ChartWizardModal(this.app, editor, this.settings).open();
				}
			});

			if (Platform.isDesktopApp) {
				this.addCommand({
					id: `import-mosaic-data-csv`,
					name: `Import data from external CSV file`,
					editorCallback: async (editor) => {
						const file = await fileDialog({ accept: '.csv', strict: true });
						const content = await file.text();
						const records = parseCsv(content);

						insertEditor(
							editor,
							yaml.dump(records, { quotingType: '"', noRefs: true })
								.replace(/\n/g, "\n" + " ".repeat(editor.getCursor().ch))
						);
					}
				});
			}
		} catch (error) {
			console.log(`Load error. ${error}`);
		}

		try {
			this.registerExtensions([CSV_FILE_EXTENSION], VIEW_TYPE_CSV);
		} catch (error) {
			console.log(`Existing file extension ${CSV_FILE_EXTENSION}`);
		}

		try {
			this.registerExtensions(["mdx"], "markdown");
		} catch (error) {
			console.log(`Existing file extension mdx`);
		}
		console.log('Loaded Mosaic plugin');
	}

	onunload() {
		console.log('Unloading Mosaic plugin');
	}

	async loadSettings() {
		this.settings = Object.assign(DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}