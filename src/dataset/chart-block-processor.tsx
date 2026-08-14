// src/dataset/chart-block-processor.tsx
// chartview 代码块入口：frontmatter 属性 + 可选内联 CSV，语义与 <Chart /> 标签一致。
import ReactDOM from "react-dom";
import { MarkdownPostProcessorContext, MarkdownRenderChild } from "obsidian";
import MosaicPlugin from "../main";
import { parseChartBlock } from "./chart-block.mjs";
import { renderChartInto } from "./render-chart";

export function createChartBlockProcessor(plugin: MosaicPlugin) {
	return async (
		source: string,
		el: HTMLElement,
		ctx: MarkdownPostProcessorContext,
	) => {
		const host = el.createDiv({ cls: "mosaic-tag-host" });
		const child = new MarkdownRenderChild(el);
		child.onunload = () => ReactDOM.unmountComponentAtNode(host);
		ctx.addChild(child);
		try {
			const parsed = parseChartBlock(source);
			await renderChartInto(plugin, host, ctx.sourcePath, parsed);
		} catch (e) {
			ReactDOM.unmountComponentAtNode(host);
			host.empty();
			host.createDiv({
				cls: "mosaic-error",
				text: `Mosaic: ${String((e as Error)?.message ?? e)}`,
			});
		}
	};
}
