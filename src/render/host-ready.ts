// Obsidian 打开文件时会在 section 元素尚未挂载（宽度 0，或短暂挂在约
// 330px 的测量容器里）时就调用处理器；此时出图会让 AntV 在错误的画布几何
// 上做标签防碰撞，大量标签被误藏，且被摘离缓存的 section 会把坏画布一直
// 保留。等宿主 attach 且有宽度再渲染；过渡宽度由 ChartFigure 的宽度监听
// 重建兜底。
// 不设超时：虚拟化的 section 可能很久后才挂载，超时会留下永久空段落
// （实测 30s 超时正是空段落来源）。等待只由 stale()（重入/卸载）终止；
// ResizeObserver 观察不到 detached→attached 的时刻，用低频轮询兜底。
const HOST_READY_POLL_MS = 250;

export function whenHostReady(
	host: HTMLElement,
	stale: () => boolean,
): Promise<boolean> {
	if (host.isConnected && host.clientWidth > 0) return Promise.resolve(true);
	return new Promise((resolve) => {
		let settled = false;
		const finish = (ok: boolean) => {
			if (settled) return;
			settled = true;
			observer.disconnect();
			window.clearInterval(timer);
			resolve(ok);
		};
		const check = () => {
			if (stale()) return finish(false);
			if (host.isConnected && host.clientWidth > 0) finish(true);
		};
		const observer = new ResizeObserver(check);
		observer.observe(host);
		const timer = window.setInterval(check, HOST_READY_POLL_MS);
	});
}
