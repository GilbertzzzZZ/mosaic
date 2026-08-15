import { MarkdownView, Plugin, WorkspaceLeaf } from 'obsidian';
import { MosaicPluginSettings, MosaicSettingTab, DEFAULT_SETTINGS } from './settings';
import { createChartTagProcessor } from './dataset/chart-tag-processor';
import { createChartBlockProcessor } from './dataset/chart-block-processor';

export default class MosaicPlugin extends Plugin {
	settings: MosaicPluginSettings;

	rerenderOpenPreviews() {
		// rebuildView（未进 d.ts 的私有 API，故可选调用）而非 rerender(true)：
		// 后者与阅读视图虚拟化存在竞态，视口外章节延迟物化时拿不到 section
		// info，会留下空段落。
		this.app.workspace.iterateAllLeaves((leaf) => {
			const view = leaf.view;
			if (view instanceof MarkdownView && view.getMode() === "preview") {
				(leaf as WorkspaceLeaf & { rebuildView?: () => void }).rebuildView?.();
			}
		});
	}

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new MosaicSettingTab(this.app, this));
		this.registerMarkdownCodeBlockProcessor("chartview", createChartBlockProcessor(this));
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

		try {
			this.registerExtensions(["mdx"], "markdown");
		} catch (error) {
			// .mdx 已被其他插件注册时的预期冲突：静默降级，本插件其余功能不受影响。
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
