import React, { useMemo } from "react";
import { extractFlowDiagram, layoutFlowDiagram } from "../../../parse/blocks/flow.mjs";
import { useBlockToolbar } from "./BlockShell";

export interface FlowDiagramViewProps {
	attributes: Record<string, string>;
	body: string;
}

interface FlowNode {
	id: string;
	label: string;
	type: string;
	note?: string;
	x: number;
	y: number;
	width: number;
	height: number;
	lines: string[];
}

interface FlowEdge {
	fromX: number;
	fromY: number;
	toX: number;
	toY: number;
	midY: number;
	label?: string;
}

interface FlowLayout {
	width: number;
	height: number;
	nodes: FlowNode[];
	edges: FlowEdge[];
}

const LINE_HEIGHT = 15;

export const FlowDiagramView = ({ attributes, body }: FlowDiagramViewProps) => {
	const model = useMemo(() => extractFlowDiagram(body), [body]);
	const valid = Boolean(model && Array.isArray(model.nodes) && model.nodes.length > 0);
	const layout: FlowLayout | null = useMemo(
		() => (valid ? layoutFlowDiagram(model) : null),
		[valid, model],
	);
	// 静态 marker id 在同页多图时会重复，箭头样式会跨图串扰；
	// 这里按实例随机化，不影响单图视觉输出。
	const markerId = useMemo(
		() => `mosaic-flow-arrow-${Math.random().toString(36).slice(2)}`,
		[]
	);
	// FlowDiagram 的根是 <figure> 而不是 BlockShell 的 <section>，所以工具栏插槽自己
	// 渲染一份，class 与 BlockShell 那份一致（绝对定位在卡片右上角）。
	const toolbar = useBlockToolbar();

	// throw 位于全部 hooks 之后（rules-of-hooks）。
	if (!valid || !layout) {
		throw new Error("FlowDiagram requires nodes.");
	}

	return (
		<figure className="mosaic-block mosaic-flow-diagram" data-mosaic-block="flow-diagram">
			{toolbar && (
				<div className="mosaic-block-toolbar mosaic-control-group">{toolbar}</div>
			)}
			{attributes.title && (
				<figcaption className="mosaic-block-title">{attributes.title}</figcaption>
			)}
			<div className="mosaic-flow-scroll">
				<svg
					viewBox={`0 0 ${layout.width} ${layout.height}`}
					role="img"
					aria-label={attributes.title || "Flow diagram"}
				>
					<defs>
						<marker
							id={markerId}
							viewBox="0 0 10 10"
							refX={9}
							refY={5}
							markerWidth={6}
							markerHeight={6}
							orient="auto-start-reverse"
						>
							<path d="M 0 0 L 10 5 L 0 10 z" />
						</marker>
					</defs>
					{layout.edges.map((edge, index) => (
						<React.Fragment key={index}>
							<path
								className="mosaic-flow-edge"
								d={`M ${edge.fromX} ${edge.fromY} C ${edge.fromX} ${edge.midY}, ${edge.toX} ${edge.midY}, ${edge.toX} ${edge.toY}`}
								markerEnd={`url(#${markerId})`}
							/>
							{edge.label && (
								<text
									className="mosaic-flow-edge-label"
									x={(edge.fromX + edge.toX) / 2}
									y={edge.midY - 7}
									textAnchor="middle"
								>
									{edge.label}
								</text>
							)}
						</React.Fragment>
					))}
					{layout.nodes.map((node) => {
						const centerX = node.x + node.width / 2;
						const centerY = node.y + node.height / 2;
						const firstY = centerY - ((node.lines.length - 1) * LINE_HEIGHT) / 2 + 4;
						return (
							<g key={node.id} className={`mosaic-flow-node is-${node.type}`}>
								{node.note && <title>{node.note}</title>}
								<rect x={node.x} y={node.y} width={node.width} height={node.height} rx={8} />
								<text textAnchor="middle" x={centerX}>
									{node.lines.map((line, lineIndex) => (
										<tspan key={lineIndex} x={centerX} y={firstY + lineIndex * LINE_HEIGHT}>
											{line}
										</tspan>
									))}
								</text>
							</g>
						);
					})}
				</svg>
			</div>
			{attributes.note && <p className="mosaic-flow-note">{attributes.note}</p>}
		</figure>
	);
};
