import React from "react";

interface GranularityButtonsProps {
	options: string[];
	active?: string;
	onSelect?: (granularity: string) => void;
}

// ChartFigure 与 DataTableView 共用的粒度切换按钮组；单选项时不渲染。
export const GranularityButtons = ({ options, active, onSelect }: GranularityButtonsProps) => {
	if (options.length <= 1) return null;
	return (
		<div className="mosaic-granularity-group">
			{options.map((option) => (
				<button
					key={option}
					type="button"
					className={
						"mosaic-granularity-btn" + (option === active ? " is-active" : "")
					}
					onClick={() => onSelect?.(option)}
				>
					{option}
				</button>
			))}
		</div>
	);
};
