// src/dataset/chart-block-processor.tsx
// chartview 代码块入口：frontmatter 属性 + 可选内联 CSV，语义与 <Chart /> 标签一致。
import React from "react";
import { MarkdownPostProcessorContext, MarkdownRenderChild, apiVersion } from "obsidian";
import MosaicPlugin from "../main";
import { parseChartBlock } from "../parse/chart-block.mjs";
import { formatBlockReport } from "../render/block-report.mjs";
import { renderInto, unmountRoot } from "../render/react-root";
import { renderChartInto } from "../render/render-chart";
import {
	BlockContext,
	BlockErrorBox,
	copyToClipboard,
} from "../render/components/blocks/BlockShell";

// 代码块入口的 source **永远不含围栏**，且末尾换行被剥掉。要还原完整原文只能走
// getSectionInfo 按行切——这正是 Obsidian 自己的做法。
// 非预览渲染上下文（嵌入 ![[note]]、hover 弹窗、导出 PDF、Canvas 卡片）宿主给的是
// 空桩实现，恒返回 null；这条路照常出图却拿不到围栏，降级为把围栏拼回，并在复制
// 文本里标注 reconstructed。
function blockContext(
	plugin: MosaicPlugin,
	ctx: MarkdownPostProcessorContext,
	el: HTMLElement,
	source: string,
): BlockContext {
	const info = ctx.getSectionInfo(el);
	if (info) {
		return {
			sourcePath: ctx.sourcePath,
			lineStart: info.lineStart,
			lineEnd: info.lineEnd,
			syntax: "code block",
			raw: info.text
				.split("\n")
				.slice(info.lineStart, info.lineEnd + 1)
				.join("\n"),
			rawIsReconstructed: false,
			pluginVersion: plugin.manifest.version,
			appVersion: apiVersion,
		};
	}
	return {
		sourcePath: ctx.sourcePath,
		// 行号无从得知：-1 让报告只写文件名、不写一个假的行范围。
		lineStart: -1,
		lineEnd: -1,
		syntax: "code block",
		raw: "```chartview\n" + source.replace(/\n$/, "") + "\n```",
		rawIsReconstructed: true,
		pluginVersion: plugin.manifest.version,
		appVersion: apiVersion,
	};
}

export function createChartBlockProcessor(plugin: MosaicPlugin) {
	return async (
		source: string,
		el: HTMLElement,
		ctx: MarkdownPostProcessorContext,
	) => {
		// 插件正在卸载：不再建 host / root / 轮询，代码块留给原生渲染。
		if (plugin.isUnloading) return;
		const host = el.createDiv({ cls: "mosaic-tag-host" });
		// ⚠️ 时序：必须在 try **之前**、createDiv 之后立刻取。renderChartInto 的第一件
		// 事是 `await whenHostReady()`，而它明确不设超时（虚拟化的 section 可能很久后
		// 才挂载）。等回来之后再在 catch 里取 section info，section 可能早已被编辑
		// 重解析并回收 → 返回 null，错误框就只剩一句没有出处的报错。
		const context = blockContext(plugin, ctx, el, source);
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
			const attributes = parsed.attributes as Record<string, string>;
			await renderChartInto(
				plugin,
				host,
				attributes.dataset ? { ...context, dataset: attributes.dataset } : context,
				{ attributes, csv: parsed.csv },
				() => unloaded,
			);
		} catch (e) {
			if (unloaded) return;
			unmountRoot(host);
			host.empty();
			const message = `Mosaic: ${String((e as Error)?.message ?? e)}`;
			renderInto(
				host,
				<BlockErrorBox
					message={message}
					onCopy={() =>
						copyToClipboard(
							formatBlockReport({ context, status: "error", error: message }),
						)
					}
				/>,
			);
		}
	};
}
