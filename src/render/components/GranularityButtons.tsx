import React from "react";

interface GranularityButtonsProps {
	options: string[];
	active?: string;
	onSelect?: (granularity: string) => void;
}

// ChartFigure 与 DataTableView 共用的粒度切换按钮；单选项时不渲染。
// 不自带容器：调用方把它和自己的按钮放进同一个 .mosaic-control-group，图表右上角
// 因此只有一组按钮，而不是「粒度一组、导出一组」两个挨着的小块。
export const GranularityButtons = ({ options, active, onSelect }: GranularityButtonsProps) => {
	if (options.length <= 1) return null;
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
