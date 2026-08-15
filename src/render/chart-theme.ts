// 跟随 Obsidian 主题选择 G2 主题；背景透明，与页面底色融合。
// 主题切换由 mosaic:theme-change 事件驱动 ChartFigure 内重建，本模块被重新求值。
import { getTheme } from "@antv/g2";

function currentChartTheme(): Record<string, unknown> {
	const dark = document.body.classList.contains("theme-dark");
	const theme = { ...getTheme(dark ? "dark" : "default") };
	theme.background = "transparent";
	return theme;
}

// 数值标签常压在彩色柱体上，纯色文字对比不足（dark 主题尤甚）。按主题给
// 标签加「亮字 + 背景色描边」的 halo：描边制造一圈近背景色光晕，数字压在
// 任何颜色上都可读。
function labelHaloStyle(dark: boolean): Record<string, unknown> {
	return dark
		? { fill: "#E6E6E6", stroke: "#1F1F1F", lineWidth: 2 }
		: { fill: "#595959", stroke: "#FFFFFF", lineWidth: 2 };
}

function withLabelHalo(config: Record<string, any>, dark: boolean): void {
	const style = labelHaloStyle(dark);
	if (config.label) {
		config.label = { ...config.label, style: { ...config.label.style, ...style } };
	}
	if (Array.isArray(config.geometryOptions)) {
		for (const geometry of config.geometryOptions) {
			if (geometry?.label) {
				geometry.label = {
					...geometry.label,
					style: { ...geometry.label.style, ...style },
				};
			}
		}
	}
}

export function withTheme<T extends { config: Record<string, unknown> }>(built: T): T {
	const dark = document.body.classList.contains("theme-dark");
	built.config.theme = currentChartTheme();
	withLabelHalo(built.config as Record<string, any>, dark);
	return built;
}
