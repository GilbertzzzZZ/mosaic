// src/entry/chart-tag-processor.tsx
import React from "react";
import { MarkdownPostProcessorContext, MarkdownRenderChild, apiVersion } from "obsidian";
import MosaicPlugin from "../main";
import { findComponentTags, findChartTags, isOnlyComponentTags, COMPONENT_NAMES } from "../parse/chart-tag.mjs";
import { formatBlockReport } from "../render/block-report.mjs";
import { renderInto, unmountRoot } from "../render/react-root";
import { renderChartInto } from "../render/render-chart";
import { renderComponentInto } from "../render/render-component";
import {
	BlockContext,
	BlockErrorBox,
	copyToClipboard,
} from "../render/components/blocks/BlockShell";

type ChartTagRun = { hosts: HTMLElement[] };

// 每个 section el 的当前渲染代（WeakMap 随 el 回收，无泄漏）。
const ACTIVE_RUNS = new WeakMap<HTMLElement, ChartTagRun>();

// 两个解析器（findChartTags / findComponentTags）产出的标签统一形态：
// Chart 带 csv（fence 已剥出），其余五类只带 body 原文。
type RenderableTag = {
	name: string;
	start: number;
	end: number;
	attributes: Record<string, string>;
	unrecognized: string[];
	body: string | null;
	csv: string | null;
};

// 廉价预筛：section 里连候选开标签都没有就直接返回，避免逐段跑完整解析。
const FAST_PATH = new RegExp(`<(${COMPONENT_NAMES.join("|")})`);

export function createChartTagProcessor(plugin: MosaicPlugin) {
	return async (el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
		// 插件正在卸载：保留原生 markdown，不再建 host / root / 轮询。
		if (plugin.isUnloading) return;
		// ⚠️ 时序：getSectionInfo 必须在 processor 的同步阶段取好并存进闭包。文档被
		// 编辑后 section 会被回收替换，旧的 el 不再在 sections 数组里，那时再调返回
		// null——而复制/切换按钮点下去的时刻恰恰是「那时」。这条路径本来就是先取
		// 再判空，原文与行号顺带都在手里，切片即得。
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
		const chartTags: RenderableTag[] = findChartTags(section).map((t) => ({
			name: "Chart",
			start: t.start,
			end: t.end,
			attributes: t.attributes,
			unrecognized: t.unrecognized,
			body: null,
			csv: t.csv,
		}));
		const otherTags: RenderableTag[] = findComponentTags(section)
			.filter((t) => t.name !== "Chart")
			.map((t) => ({ ...t, csv: null }));
		const tags = [...chartTags, ...otherTags].sort((a, b) => a.start - b.start);
		if (tags.length === 0 || !isOnlyComponentTags(section, tags)) return;

		// Obsidian 可能在快速编辑时对同一 el 重复调用处理器；用代际 token 让旧调用
		// 在 await 之后发现自己已过期，从而不再写入已被新调用清空/接管的 el。
		// run 同时记录本轮 render 过的 host,供重入接管（下方）和 section 被丢弃时
		// （child.onunload）两条路径 unmount，避免 AntV 图表实例泄漏。
		const prevRun = ACTIVE_RUNS.get(el);
		if (prevRun) {
			for (const host of prevRun.hosts) {
				unmountRoot(host);
			}
		}
		const run: ChartTagRun = { hosts: [] };
		ACTIVE_RUNS.set(el, run);
		// unloaded 必须并入 stale()：section 被丢弃时只有 onunload 会触发，
		// 若仅比对代际 token，whenHostReady 的轮询会对 detached 节点永远等下去。
		let unloaded = false;
		const stale = () => unloaded || ACTIVE_RUNS.get(el) !== run;

		// child 由预览视图持有，禁用插件时预览不会 unload 它；registerTeardown 让
		// 插件卸载成为第三条触发路径，两条路径谁先到谁执行，且只执行一次。
		const child = new MarkdownRenderChild(el);
		child.onunload = plugin.registerTeardown(() => {
			unloaded = true;
			for (const host of run.hosts) {
				unmountRoot(host);
			}
		});
		ctx.addChild(child);

		el.empty();
		for (const tag of tags) {
			if (stale()) return;
			const host = el.createDiv({ cls: "mosaic-tag-host" });
			run.hosts.push(host);
			// 同段多标签时，本标签的行号 = section 起始行 + 该标签之前的换行数。
			const before = section.slice(0, tag.start).split("\n").length - 1;
			const raw = section.slice(tag.start, tag.end);
			const context: BlockContext = {
				sourcePath: ctx.sourcePath,
				lineStart: info.lineStart + before,
				lineEnd: info.lineStart + before + (raw.split("\n").length - 1),
				// 标签入口握着 section 原文与标签偏移量，切片即得逐字原文（含开标签、
				// fence body、闭标签），永远不需要拼回。
				syntax: raw.endsWith("/>") ? "self-closing tag" : "paired tag",
				raw,
				rawIsReconstructed: false,
				pluginVersion: plugin.manifest.version,
				appVersion: apiVersion,
				...(tag.attributes.dataset ? { dataset: tag.attributes.dataset } : {}),
			};
			try {
				if (tag.name === "Chart") {
					await renderChartInto(
						plugin,
						host,
						context,
						{
							attributes: tag.attributes,
							csv: tag.csv,
							unrecognized: tag.unrecognized,
						},
						stale,
					);
				} else {
					// renderComponentInto 内部已 catch 并落地 mosaic-error，此处 catch 只作兜底。
					await renderComponentInto(
						plugin,
						host,
						context,
						{
							name: tag.name,
							attributes: tag.attributes,
							body: tag.body,
							unrecognized: tag.unrecognized,
						},
						stale,
					);
				}
			} catch (e) {
				if (stale()) return;
				renderTagError(host, context, e);
			}
		}
	};
}

// 整体报错也带定位上下文：原文与行号是同步阶段就取好的，此刻即便 section 已被回收
// 也拿得到。unmount → empty → 渲染，顺序不能换：unmountRoot 的同步语义保证错误框
// 是 host 里唯一的内容。
function renderTagError(host: HTMLElement, context: BlockContext, e: unknown): void {
	unmountRoot(host);
	host.empty();
	const message = `Mosaic: ${String((e as Error)?.message ?? e)}`;
	renderInto(
		host,
		<BlockErrorBox
			message={message}
			onCopy={() =>
				copyToClipboard(formatBlockReport({ context, status: "error", error: message }))
			}
		/>,
	);
}
