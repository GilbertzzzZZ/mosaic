// src/dataset/chart-tag-processor.tsx
import ReactDOM from "react-dom";
import { MarkdownPostProcessorContext, MarkdownRenderChild } from "obsidian";
import MosaicPlugin from "../main";
import { findComponentTags, findChartTags, isOnlyComponentTags, COMPONENT_NAMES } from "../parse/chart-tag.mjs";
import { renderChartInto } from "../render/render-chart";
import { renderComponentInto } from "../render/render-component";

const RUN_KEY = "__mosaicTagRun";

type ChartTagRun = { hosts: HTMLElement[] };

// 两个解析器（findChartTags / findComponentTags）产出的标签统一形态：
// Chart 带 csv（fence 已剥出），其余五类只带 body 原文。
type RenderableTag = {
	name: string;
	start: number;
	end: number;
	attributes: Record<string, string>;
	body: string | null;
	csv: string | null;
};

// 廉价预筛：section 里连候选开标签都没有就直接返回，避免逐段跑完整解析。
const FAST_PATH = new RegExp(`<(${(COMPONENT_NAMES as string[]).join("|")})`);

export function createChartTagProcessor(plugin: MosaicPlugin) {
	return async (el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
		const info = ctx.getSectionInfo(el);
		if (!info) return;
		const section = info.text
			.split("\n")
			.slice(info.lineStart, info.lineEnd + 1)
			.join("\n");
		if (!FAST_PATH.test(section)) return;
		// Chart 候选沿用 findChartTags 的既有 csv-fence 校验语义（不匹配的候选被弃，
		// 现状不变：既有 Chart 渲染行为零改变）；其余五类的 body 原文校验交给各自视图。
		// 两组标签按 start 合并排序，isOnlyComponentTags 才能正确判定"整段仅由已识别标签构成"。
		const chartTags: RenderableTag[] = findChartTags(section).map((t: { start: number; end: number; attributes: Record<string, string>; csv: string | null }) => ({
			name: "Chart",
			start: t.start,
			end: t.end,
			attributes: t.attributes,
			body: null,
			csv: t.csv,
		}));
		const otherTags: RenderableTag[] = (findComponentTags(section) as Omit<RenderableTag, "csv">[])
			.filter((t) => t.name !== "Chart")
			.map((t) => ({ ...t, csv: null }));
		const tags = [...chartTags, ...otherTags].sort((a, b) => a.start - b.start);
		if (tags.length === 0 || !isOnlyComponentTags(section, tags)) return;

		// Obsidian 可能在快速编辑时对同一 el 重复调用处理器；用代际 token 让旧调用
		// 在 await 之后发现自己已过期，从而不再写入已被新调用清空/接管的 el。
		// run 同时记录本轮 render 过的 host,供重入接管（下方）和 section 被丢弃时
		// （child.onunload）两条路径 unmount，避免 AntV 图表实例泄漏。
		const prevRun = (el as any)[RUN_KEY] as ChartTagRun | undefined;
		if (prevRun) {
			for (const host of prevRun.hosts) {
				ReactDOM.unmountComponentAtNode(host);
			}
		}
		const run: ChartTagRun = { hosts: [] };
		(el as any)[RUN_KEY] = run;
		// unloaded 必须并入 stale()：section 被丢弃时只有 onunload 会触发，
		// 若仅比对代际 token，whenHostReady 的轮询会对 detached 节点永远等下去。
		let unloaded = false;
		const stale = () => unloaded || (el as any)[RUN_KEY] !== run;

		const child = new MarkdownRenderChild(el);
		child.onunload = () => {
			unloaded = true;
			for (const host of run.hosts) {
				ReactDOM.unmountComponentAtNode(host);
			}
		};
		ctx.addChild(child);

		el.empty();
		for (const tag of tags) {
			if (stale()) return;
			const host = el.createDiv({ cls: "mosaic-tag-host" });
			run.hosts.push(host);
			try {
				if (tag.name === "Chart") {
					await renderChartInto(
						plugin,
						host,
						ctx.sourcePath,
						{ attributes: tag.attributes, csv: tag.csv },
						stale,
					);
				} else {
					// renderComponentInto 内部已 catch 并落地 mosaic-error，此处 catch 只作兜底。
					await renderComponentInto(
						plugin,
						host,
						ctx.sourcePath,
						{
							name: tag.name,
							attributes: tag.attributes,
							body: tag.body,
						},
						stale,
					);
				}
			} catch (e) {
				if (stale()) return;
				host.createDiv({
					cls: "mosaic-error",
					text: `Mosaic: ${String((e as Error)?.message ?? e)}`,
				});
			}
		}
	};
}
