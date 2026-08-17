import React from "react";

interface GranularityButtonsProps {
	options: string[];
	active?: string;
	onSelect?: (granularity: string) => void;
}

// ChartFigure 与 DataTableView 共用的粒度切换按钮。
// 一个候选也要画：那一个按钮说明「这份数据只支持这一档」，而不是把控件整个抹掉、
// 让读者以为图表压根没有粒度这回事。空数组才不渲染——内联模式没有 manifest，
// 也就没有源粒度与 rollup 可言，调用方直接传空。
// 不自带容器：调用方把它和自己的按钮放进同一个 .mosaic-control-group，图表右上角
// 因此只有一组按钮，而不是「粒度一组、导出一组」两个挨着的小块。
export const GranularityButtons = ({ options, active, onSelect }: GranularityButtonsProps) => {
	if (options.length === 0) return null;
	return (
		<>
			{options.map((option) => (
				<button
					key={option}
					type="button"
					aria-pressed={option === active}
					// mod-cta is Obsidian's own selected-button class, the one
					// ButtonComponent.setCta() applies.
					className={
						"mosaic-granularity-btn" + (option === active ? " mod-cta" : "")
					}
					onClick={() => onSelect?.(option)}
				>
					{option}
				</button>
			))}
		</>
	);
};
