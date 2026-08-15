import React from "react";

interface State {
	message: string | null;
}

// AntV 渲染异常的最后防线：把崩溃收敛为组件内的错误框，
// 不让异常冒泡到 Obsidian 的渲染管线。
export class PlotErrorBoundary extends React.Component<
	{ children?: React.ReactNode },
	State
> {
	state: State = { message: null };

	static getDerivedStateFromError(error: Error): State {
		return { message: String(error?.message ?? error) };
	}

	render() {
		if (this.state.message !== null) {
			return <div className="mosaic-error">{`Mosaic: ${this.state.message}`}</div>;
		}
		return this.props.children;
	}
}
