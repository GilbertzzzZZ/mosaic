import {
	applyCrosshairStyle,
	applyHighlightBandStyle,
	applyHoverBandStyle,
	applyLabelStyle,
	applyTooltipStyle,
	crosshairStyle,
	highlightBandStyle,
	hoverBandStyle,
	labelTextStyle,
	tooltipStyle,
} from "./chart-tag-config.mjs";

// 跟随 Obsidian 明暗主题选择 G2 内置主题。classic 与 classicDark 的
// colorBackground 都是 transparent，页面底色直接透上来，无需再覆盖背景——
// 而且 ClassicDark 的 view 是浅合并，只改其中一个 fill 会冲掉其余几个。
// 主题切换由 mosaic:theme-change 事件驱动 ChartFigure 内重建，本模块被重新求值。

function isDarkTheme(): boolean {
	return document.body.classList.contains("theme-dark");
}

// 网格线颜色：主题默认拿前景色加低透明度画，暗色下偏亮，压过了数据本身。
// 这里按主题写死一条固定的极淡灰，线宽 / 实线 / 不透明度在 chart-tag-config
// 的 y 轴默认值里给。
function gridStroke(dark: boolean): string {
	return dark ? "#262626" : "#D9D9D9";
}

// y 轴挂在单视图的 config.axis 上，DualAxes 则逐 child 各带一份；折线和它的
// 数据点共用一段 y scale，两份 axis 内容必须保持一致。
function withGridStroke(config: Record<string, any>, dark: boolean): void {
	const stroke = gridStroke(dark);
	const paint = (node: Record<string, any> | undefined) => {
		if (!node?.axis?.y) return;
		node.axis = { ...node.axis, y: { ...node.axis.y, gridStroke: stroke } };
	};
	paint(config);
	if (Array.isArray(config.children)) {
		for (const child of config.children) paint(child);
	}
}

export function withTheme<T extends { config: Record<string, unknown> }>(built: T): T {
	const dark = isDarkTheme();
	built.config.theme = { type: dark ? "classicDark" : "classic" };
	applyLabelStyle(built.config, labelTextStyle(dark));
	applyHoverBandStyle(built.config, hoverBandStyle(dark));
	applyHighlightBandStyle(built.config, highlightBandStyle(dark));
	applyCrosshairStyle(built.config, crosshairStyle(dark));
	applyTooltipStyle(built.config, tooltipStyle(dark));
	withGridStroke(built.config as Record<string, any>, dark);
	return built;
}
