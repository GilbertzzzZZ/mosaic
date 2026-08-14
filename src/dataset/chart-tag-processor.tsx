// src/dataset/chart-tag-processor.tsx
import React from "react";
import ReactDOM from "react-dom";
import { MarkdownPostProcessorContext, MarkdownRenderChild } from "obsidian";
import { getTheme } from "@antv/g2";
import MosaicPlugin from "../main";
import { findChartTags, isOnlyChartTags } from "./chart-tag.mjs";
import { loadDatasetForNote } from "./obsidian-dataset";
import {
	buildChartFromTag,
	parseGranularityOptions,
} from "./chart-tag-config.mjs";
import { ChartFigure } from "../components/ChartFigure";

const RUN_KEY = "__mosaicTagRun";

type ChartTagRun = { hosts: HTMLElement[] };

// 跟随 Obsidian 主题选择 G2 主题；背景透明，与页面底色融合。
// 主题切换时 main.tsx 监听 css-change 强制重渲染，本函数会被重新求值。
function currentChartTheme(): Record<string, unknown> {
	const dark = document.body.classList.contains("theme-dark");
	const theme = { ...getTheme(dark ? "dark" : "default") };
	theme.background = "transparent";
	return theme;
}

function withTheme<T extends { config: Record<string, unknown> }>(built: T): T {
	built.config.theme = currentChartTheme();
	return built;
}

export function createChartTagProcessor(plugin: MosaicPlugin) {
	return async (el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
		const info = ctx.getSectionInfo(el);
		if (!info) return;
		const section = info.text
			.split("\n")
			.slice(info.lineStart, info.lineEnd + 1)
			.join("\n");
		if (!section.includes("<Chart")) return; // 快速路径
		const tags = findChartTags(section);
		if (tags.length === 0 || !isOnlyChartTags(section, tags)) return;

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
		const stale = () => (el as any)[RUN_KEY] !== run;

		const child = new MarkdownRenderChild(el);
		child.onunload = () => {
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
				const attributes = tag.attributes as Record<string, string>;
				if (!attributes.dataset) {
					throw new Error(
						"Chart tag without dataset= is not supported yet (inline data body is a future entry).",
					);
				}
				const { manifest, rows } = await loadDatasetForNote(
					plugin.app,
					ctx.sourcePath,
					attributes.dataset,
				);
				if (stale()) return;
				const build = (granularity: string) =>
					withTheme(buildChartFromTag({ manifest, rows, attributes, granularity }));
				const initial = withTheme(
					buildChartFromTag({
						manifest,
						rows,
						attributes,
						granularity: undefined,
					}),
				);
				const options = parseGranularityOptions(attributes).filter((g) =>
					initial.availableGranularities.includes(g),
				);
				ReactDOM.render(
					<ChartFigure
						title={attributes.title}
						note={attributes.note}
						options={options}
						initial={initial}
						build={build}
						showExportBtn={plugin.settings.showExportBtn}
					/>,
					host,
				);
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
