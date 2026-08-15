import { MarkdownView, Plugin, WorkspaceLeaf } from 'obsidian';
import { MosaicPluginSettings, MosaicSettingTab, DEFAULT_SETTINGS } from './settings';
import { createChartTagProcessor } from './entry/chart-tag-processor';
import { createChartBlockProcessor } from './entry/chart-block-processor';

export default class MosaicPlugin extends Plugin {
	declare settings: MosaicPluginSettings;
	private cssChangeTimer: number | undefined;
	// 已挂载、尚未卸载的渲染子项的 teardown。这些 child 由预览视图（ctx.addChild）
	// 持有：只有预览丢弃 section 时才 unload，禁用插件时不会。插件必须自己留一份
	// 句柄，否则 preact root、图表实例、ResizeObserver、window 上的
	// mosaic:theme-change 监听，以及 host-ready 那个不设超时的 250ms 轮询，
	// 都会留在已打开的预览里继续跑。
	// 不用 Component.register()：它登记的回调只在插件 unload 时排空，一次会话里
	// 渲染过的每个 section 都会把闭包（连同 DOM 引用）攒到卸载为止，本身就是泄漏。
	private readonly teardowns = new Set<() => void>();
	// unload 期间为 true：两个入口处理器据此拒绝新渲染，卸载途中被重建的预览
	// 才不会又注册出一批没人负责清理的资源。
	isUnloading = false;

	/**
	 * 登记一个渲染子项的 teardown，返回执行它的函数。
	 * 预览丢弃 section 与插件卸载两条路径谁先到谁执行，且只执行一次。
	 */
	registerTeardown(teardown: () => void): () => void {
		const run = () => {
			// delete 返回 false 说明这份 teardown 已经跑过，不重复执行。
			if (!this.teardowns.delete(run)) return;
			teardown();
		};
		this.teardowns.add(run);
		return run;
	}

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
		// 同一实例被卸载后再次 load 时复位，否则处理器会一直拒绝渲染。
		this.isUnloading = false;
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
		this.registerEvent(
			this.app.workspace.on("css-change", () => {
				window.clearTimeout(this.cssChangeTimer);
				this.cssChangeTimer = window.setTimeout(() => {
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

	onunload() {
		// 先置位，再做任何可能触发重渲染的事。
		this.isUnloading = true;
		window.clearTimeout(this.cssChangeTimer);
		// 预览持有的 child 不会因插件被禁用而 unload，这里代为执行它们的 teardown：
		// 卸载 preact root（连带图表实例、ResizeObserver、theme-change 监听），并把
		// stale() 置真，让 host-ready 的轮询在下一拍（≤250ms）自行清掉 interval。
		// 逐个隔离：某个 teardown 抛错不能连累其余，也不能让 onunload 半途中断。
		for (const teardown of [...this.teardowns]) {
			try {
				teardown();
			} catch (error) {
				// 卸载路径没有可恢复动作，继续清理剩下的。
			}
		}
		// 纯观感收尾，资源在上面已经清完：已打开的预览此刻只剩空的 host 容器，
		// 重建一次让它们回到没有本插件时的原生 markdown。rebuildView 缺失时不重建，
		// 用户重新打开笔记即恢复（不影响上面的清理）。
		this.rerenderOpenPreviews();
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
