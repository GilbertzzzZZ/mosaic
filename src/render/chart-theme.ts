// 跟随 Obsidian 明暗主题选择 G2 内置主题。classic 与 classicDark 的
// colorBackground 都是 transparent，页面底色直接透上来，无需再覆盖背景——
// 而且 ClassicDark 的 view 是浅合并，只改其中一个 fill 会冲掉其余几个。
// 主题切换由 mosaic:theme-change 事件驱动 ChartFigure 内重建，本模块被重新求值。

function isDarkTheme(): boolean {
	return document.body.classList.contains("theme-dark");
}

// 数值标签常压在彩色柱体上，纯色文字对比不足（dark 主题尤甚）。按主题给
// 标签加「亮字 + 背景色描边」的 halo：描边制造一圈近背景色光晕，数字压在
// 任何颜色上都可读。
function labelHaloStyle(dark: boolean): Record<string, unknown> {
	return dark
		? { fill: "#E6E6E6", stroke: "#1F1F1F", lineWidth: 2 }
		: { fill: "#595959", stroke: "#FFFFFF", lineWidth: 2 };
}

function haloLabel(
	label: Record<string, any>,
	style: Record<string, unknown>,
): Record<string, unknown> {
	return { ...label, style: { ...label.style, ...style } };
}

function withLabelHalo(config: Record<string, any>, dark: boolean): void {
	const style = labelHaloStyle(dark);
	// 单视图图表的标签在 config.label；DualAxes 逐 child 各带一份。
	if (config.label) config.label = haloLabel(config.label, style);
	if (Array.isArray(config.children)) {
		for (const child of config.children) {
			if (child?.label) child.label = haloLabel(child.label, style);
		}
	}
}

export function withTheme<T extends { config: Record<string, unknown> }>(built: T): T {
	const dark = isDarkTheme();
	built.config.theme = { type: dark ? "classicDark" : "classic" };
	withLabelHalo(built.config as Record<string, any>, dark);
	return built;
}
