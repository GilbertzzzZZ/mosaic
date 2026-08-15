import React, { useEffect, useRef } from "react";
import { setIcon } from "obsidian";
import * as Plots from "@ant-design/plots";
import { PlotErrorBoundary } from "./PlotErrorBoundary";

export interface ConfigProps {
	onReady?: (instance: unknown) => void;
	[key: string]: unknown;
}

export interface ChartProps {
	type: string;
	config: ConfigProps;
	showExportBtn?: boolean;
}

// AntV 图表实例：出图组件只依赖导出 PNG 这一个能力。
interface PlotInstance {
	downloadImage?: (name: string) => void;
}

const PLOT_COMPONENTS = Plots as unknown as Record<
	string,
	React.ComponentType<ConfigProps>
>;

export const Chart = ({ type, config, showExportBtn = false }: ChartProps) => {
	const PlotComponent = PLOT_COMPONENTS[type];
	const plotRef = useRef<PlotInstance | null>(null);
	const buttonRef = useRef<HTMLButtonElement | null>(null);
	const { onReady } = config ?? {};

	// 图标用 Obsidian 内置 lucide 库注入，不自带 svg 资源。
	useEffect(() => {
		if (buttonRef.current) setIcon(buttonRef.current, "image-down");
	}, []);

	return (
		<PlotErrorBoundary>
			{showExportBtn && (
				<button
					type="button"
					ref={buttonRef}
					className="mosaic-export-button"
					aria-label="Export to PNG"
					onClick={() => plotRef.current?.downloadImage?.(`${type}.png`)}
				/>
			)}
			<PlotComponent
				{...config}
				onReady={(instance: unknown) => {
					onReady?.(instance);
					plotRef.current = instance as PlotInstance;
				}}
			/>
		</PlotErrorBoundary>
	);
};
