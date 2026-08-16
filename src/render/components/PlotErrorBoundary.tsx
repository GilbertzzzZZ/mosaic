import React from "react";

interface State {
	message: string | null;
}

interface Props {
	children?: React.ReactNode;
	// 错误框的呈现交给调用方：崩溃发生在这里，但「这块图是哪个文件的第几行」只有
	// 上面握着（BlockContext）。边界不去认识那份上下文，只把消息交回去。
	fallback?: (message: string) => React.ReactNode;
}

// AntV 渲染异常的最后防线：把崩溃收敛为组件内的错误框，
// 不让异常冒泡到 Obsidian 的渲染管线。
export class PlotErrorBoundary extends React.Component<Props, State> {
	state: State = { message: null };

	static getDerivedStateFromError(error: Error): State {
		return { message: String(error?.message ?? error) };
	}

	render() {
		if (this.state.message !== null) {
			const message = `Mosaic: ${this.state.message}`;
			return this.props.fallback
				? this.props.fallback(message)
				: <div className="mosaic-error">{message}</div>;
		}
		return this.props.children;
	}
}
