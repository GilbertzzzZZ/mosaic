// Ported from git-leaf (https://github.com/MangoFuture1210/git-leaf)
// src/content/mdx-lite.mjs (extractFlowDiagram/normalizeFlowDiagram/computeFlowLevels/
// layoutFlowDiagram/wrapFlowText), Apache-2.0. See NOTICE. Local changes: layoutFlowDiagram
// takes a single {nodes,edges} model and returns pure layout data (x/y/lines per node,
// geometry per edge) instead of building SVG strings — the host renders the markup.
// parseJsonValue is private to mdx-lite.mjs upstream; reimplemented here on top of
// payload.mjs's extractDataBlock. renderFlowEdge/renderFlowNode SVG builders are not ported.

import { extractDataBlock, extractRows, listAttribute, normalizeFlowType } from "./payload.mjs";

const NODE_W = 200;
const NODE_H = 64;
const X_GAP = 34;
const Y_GAP = 74;
const MARGIN = 28;

function parseJsonValue(content) {
	const dataBlock = extractDataBlock(content);
	if (dataBlock && dataBlock.format !== "json") return null;
	const body = (dataBlock ? dataBlock.body : content).trim();
	if (!body || (!body.startsWith("{") && !body.startsWith("["))) return null;
	return JSON.parse(body);
}

export function extractFlowDiagram(content) {
	const parsed = parseJsonValue(content);
	if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && Array.isArray(parsed.nodes)) {
		return normalizeFlowDiagram(parsed.nodes, parsed.edges || parsed.links || []);
	}

	const rows = extractRows(content);
	const nodes = rows.map((row, index) => ({
		id: String(row.id ?? row.key ?? index + 1),
		label: String(row.label ?? row.title ?? row.name ?? row.id ?? index + 1),
		type: normalizeFlowType(row.type ?? row.kind ?? row.status),
		note: row.note ?? row.description ?? "",
		next: row.next ?? row.to ?? "",
	}));
	const edges = nodes.flatMap((node) =>
		listAttribute(node.next).map((target) => ({ from: node.id, to: target, label: "" })),
	);
	return normalizeFlowDiagram(nodes, edges);
}

export function normalizeFlowDiagram(rawNodes, rawEdges) {
	const nodes = rawNodes
		.map((node, index) => {
			const id = String(node.id ?? node.key ?? index + 1).trim();
			return {
				id,
				label: String(node.label ?? node.title ?? node.name ?? id).trim(),
				type: normalizeFlowType(node.type ?? node.kind ?? node.status),
				note: String(node.note ?? node.description ?? "").trim(),
				next: node.next ?? node.to ?? "",
			};
		})
		.filter((node) => node.id);
	const ids = new Set(nodes.map((node) => node.id));
	const edges = [
		...rawEdges.map((edge) => ({
			from: String(edge.from ?? edge.source ?? "").trim(),
			to: String(edge.to ?? edge.target ?? "").trim(),
			label: String(edge.label ?? edge.title ?? "").trim(),
		})),
		...nodes.flatMap((node) =>
			listAttribute(node.next).map((target) => ({ from: node.id, to: target, label: "" })),
		),
	].filter((edge) => ids.has(edge.from) && ids.has(edge.to));

	return { nodes, edges };
}

export function computeFlowLevels(nodes, edges) {
	const ids = nodes.map((node) => node.id);
	const levels = new Map(ids.map((id) => [id, 0]));
	const indegree = new Map(ids.map((id) => [id, 0]));
	const outgoing = new Map(ids.map((id) => [id, []]));

	for (const edge of edges) {
		if (!outgoing.has(edge.from) || !indegree.has(edge.to)) continue;
		outgoing.get(edge.from).push(edge.to);
		indegree.set(edge.to, indegree.get(edge.to) + 1);
	}

	const queue = ids.filter((id) => indegree.get(id) === 0);
	const seen = new Set();
	while (queue.length > 0) {
		const id = queue.shift();
		seen.add(id);
		for (const target of outgoing.get(id) || []) {
			levels.set(target, Math.max(levels.get(target), levels.get(id) + 1));
			indegree.set(target, indegree.get(target) - 1);
			if (indegree.get(target) === 0) queue.push(target);
		}
	}

	let fallbackLevel = Math.max(...levels.values(), 0);
	for (const id of ids) {
		if (!seen.has(id)) {
			fallbackLevel += 1;
			levels.set(id, fallbackLevel);
		}
	}
	return levels;
}

export function wrapFlowText(value, maxWidth = 14, maxLines = 3) {
	const text = String(value ?? "").trim();
	const lines = [];
	let line = "";
	let width = 0;

	for (const char of Array.from(text)) {
		const charWidth = char.charCodeAt(0) > 127 ? 1 : 0.56;
		if (line && width + charWidth > maxWidth) {
			lines.push(line);
			line = "";
			width = 0;
		}
		line += char;
		width += charWidth;
	}
	if (line) lines.push(line);

	if (lines.length > maxLines) {
		const kept = lines.slice(0, maxLines);
		kept[maxLines - 1] = `${kept[maxLines - 1].slice(0, Math.max(1, maxWidth - 3))}...`;
		return kept;
	}
	return lines;
}

export function layoutFlowDiagram(model) {
	const nodes = model?.nodes ?? [];
	const edges = model?.edges ?? [];
	const levels = computeFlowLevels(nodes, edges);
	const maxLevel = Math.max(...nodes.map((node) => levels.get(node.id) ?? 0), 0);
	const groups = Array.from({ length: maxLevel + 1 }, () => []);
	for (const node of nodes) {
		groups[levels.get(node.id) ?? 0].push(node);
	}

	const maxCols = Math.max(...groups.map((group) => group.length), 1);
	const width = Math.max(760, MARGIN * 2 + maxCols * NODE_W + (maxCols - 1) * X_GAP);
	const height = MARGIN * 2 + groups.length * NODE_H + Math.max(0, groups.length - 1) * Y_GAP;
	const positions = new Map();

	groups.forEach((group, level) => {
		const rowW = group.length * NODE_W + Math.max(0, group.length - 1) * X_GAP;
		let x = (width - rowW) / 2;
		const y = MARGIN + level * (NODE_H + Y_GAP);
		for (const node of group) {
			positions.set(node.id, { x, y, width: NODE_W, height: NODE_H });
			x += NODE_W + X_GAP;
		}
	});

	const outNodes = nodes.map((node) => {
		const position = positions.get(node.id);
		return {
			id: node.id,
			label: node.label,
			type: node.type,
			note: node.note,
			x: position.x,
			y: position.y,
			width: position.width,
			height: position.height,
			lines: wrapFlowText(node.label),
		};
	});

	const outEdges = edges
		.map((edge) => {
			const from = positions.get(edge.from);
			const to = positions.get(edge.to);
			if (!from || !to) return null;
			const fromX = from.x + from.width / 2;
			const fromY = from.y + from.height;
			const toX = to.x + to.width / 2;
			const toY = to.y;
			const midY = fromY + (toY - fromY) / 2;
			return { fromX, fromY, toX, toY, midY, label: edge.label };
		})
		.filter((edge) => edge !== null);

	return { width, height, nodes: outNodes, edges: outEdges };
}
