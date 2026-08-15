// src/dataset/chart-block-processor.tsx
// chartview 代码块入口：frontmatter 属性 + 可选内联 CSV，语义与 <Chart /> 标签一致。
import { MarkdownPostProcessorContext, MarkdownRenderChild } from "obsidian";
import MosaicPlugin from "../main";
import { parseChartBlock } from "../parse/chart-block.mjs";
import { unmountRoot } from "../render/react-root";
import { renderChartInto } from "../render/render-chart";

export function createChartBlockProcessor(plugin: MosaicPlugin) {
	return async (
		source: string,
		el: HTMLElement,
		ctx: MarkdownPostProcessorContext,
	) => {
		// 插件正在卸载：不再建 host / root / 轮询，代码块留给原生渲染。
		if (plugin.isUnloading) return;
		const host = el.createDiv({ cls: "mosaic-tag-host" });
		// child 由预览视图持有，禁用插件时预览不会 unload 它；registerTeardown 让
		// 插件卸载成为第三条触发路径，两条路径谁先到谁执行，且只执行一次。
		const child = new MarkdownRenderChild(el);
		let unloaded = false;
		child.onunload = plugin.registerTeardown(() => {
			unloaded = true;
			unmountRoot(host);
		});
		ctx.addChild(child);
		try {
			const parsed = parseChartBlock(source);
			await renderChartInto(plugin, host, ctx.sourcePath, { attributes: parsed.attributes as Record<string, string>, csv: parsed.csv }, () => unloaded);
		} catch (e) {
			if (unloaded) return;
			unmountRoot(host);
			host.empty();
			host.createDiv({
				cls: "mosaic-error",
				text: `Mosaic: ${String((e as Error)?.message ?? e)}`,
			});
		}
	};
}
