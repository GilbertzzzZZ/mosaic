// tests/helpers/plots-stub.mjs
// 打包测试用的 `@ant-design/plots` 替身。真身要一张 canvas 才画得出东西，而这一批
// 测试要看的是**外围件**：按钮在不在、切换后图表有没有重建、复制出来的文本对不对。
// 替身把每次收到的配置记一笔，切换来回时「有没有拿到一份全新的配置」因此可验证——
// 那正是 plots 会就地改写传入配置、同一个对象渲染两遍数值标签永久消失的那个坑。
import React from "react";

export const renders = [];

export function register() {}

function makePlot(name) {
	return function Plot(props) {
		renders.push({ type: name, config: props });
		// 引擎渲染崩溃的开关：真身在坏配置上会抛，错误边界是那条路的最后防线。
		if (props.explode) throw new Error("canvas exploded");
		React.useEffect(() => {
			props.onReady?.({
				downloadImage: () => {},
				chart: { forceFit: () => {}, getContainer: () => null },
			});
		}, []);
		return React.createElement("div", {
			className: "stub-plot",
			"data-plot": name,
			"data-render-seq": String(renders.length),
		});
	};
}

export const Line = makePlot("Line");
export const Column = makePlot("Column");
export const Bar = makePlot("Bar");
export const Area = makePlot("Area");
export const DualAxes = makePlot("DualAxes");
