// React 18 起用 createRoot()/root.unmount() 取代 legacy 的 ReactDOM.render()/
// unmountComponentAtNode()。本插件的 render 发生在 render/ 层、unmount 发生在
// entry/ 层，两层拿不到同一个局部变量，因此把 host → root 存成一份 WeakMap：
//   - key 是 host 元素本身，host 被 GC 时映射自动回收，无需手动清理；
//   - unmount 后立刻删除映射：标准 React 语义下卸载过的 root 不可再 render，
//     preact 的 root 只是容器上的一层闭包、并无此限制；删映射是为了不去依赖
//     这处运行时差异，下一次渲染一律拿新 root；
//   - 同一 host 复用已有 root：标准 React 语义要求一个容器只对应一个 root。
//     当前宿主每次重入都会 el.empty() 并新建 host，所以这条分支实际走不到，
//     保留它是为了与标准 React 语义一致，而不是为了当前运行时的正确性。
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

const ROOTS = new WeakMap<HTMLElement, Root>();

/** 把 React 树渲染进 host；同一 host 的多次调用复用同一个 root。 */
export function renderInto(host: HTMLElement, node: ReactNode): void {
	let root = ROOTS.get(host);
	if (!root) {
		root = createRoot(host);
		ROOTS.set(host, root);
	}
	root.render(node);
}

/** 卸载 host 上的 React 树；从未渲染过则是无副作用的 no-op。 */
export function unmountRoot(host: HTMLElement): void {
	const root = ROOTS.get(host);
	if (!root) return;
	ROOTS.delete(host);
	root.unmount();
}
