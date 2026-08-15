import React, { useRef } from "react";
import * as Plots from "@ant-design/plots";
import ErrorBoundary from "@ant-design/plots/es/errorBoundary";

export interface ChartProps {
  type: string;
  config: ConfigProps;
  showExportBtn?: boolean;
}

export interface ConfigProps {
  onReady?: (instance: unknown) => void;
  [key: string]: unknown;
}

// AntV 图表实例：出图组件只依赖导出 PNG 这一个能力。
interface PlotInstance {
  downloadImage?: (name: string) => void;
}

export const Chart = ({ type, config, showExportBtn = false }: ChartProps) => {
  const Component = (Plots as unknown as Record<string, React.ComponentType<ConfigProps>>)[type];
  const ref = useRef<PlotInstance | null>(null);
  const { onReady } = config ?? {};

  return (
    <ErrorBoundary>
      {showExportBtn &&
        <div className="mosaic-export-button" aria-label="Export to PNG" onClick={() => {
          ref.current?.downloadImage?.(`${type}.png`);
        }}>
          <svg className="code-glyph" viewBox="0 0 1024 1024" width="16" height="16">
            <path fill="currentColor" stroke="currentColor" d="M896 166.4H128c-25.6 0-42.666667 17.066667-42.666667 42.666667v597.333333c0 25.6 17.066667 42.666667 42.666667 42.666667h768c25.6 0 42.666667-17.066667 42.666667-42.666667v-597.333333c0-25.6-21.333333-42.666667-42.666667-42.666667z m-42.666667 85.333333v418.133334l-136.533333-136.533334c-21.333333-12.8-51.2-12.8-64 4.266667L554.666667 635.733333l-183.466667-179.2c-17.066667-17.066667-46.933333-17.066667-59.733333 0L170.666667 597.333333V251.733333h682.666666z m-243.2 443.733334l76.8-76.8 136.533334 140.8h-145.066667l-68.266667-64zM170.666667 716.8l170.666666-170.666667 217.6 217.6H170.666667v-46.933333z"></path>
            <path fill="currentColor" stroke="currentColor" d="M716.8 396.8m-64 0a64 64 0 1 0 128 0 64 64 0 1 0-128 0Z"></path>
          </svg>
        </div>
      }
      <Component
        {...config}
        onReady={(instance: unknown) => {
          onReady?.(instance);
          ref.current = instance;
        }}
      />
    </ErrorBoundary>
  );
}
