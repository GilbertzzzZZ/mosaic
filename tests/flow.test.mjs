import assert from "node:assert/strict";
import test from "node:test";

import {
	computeFlowLevels,
	extractFlowDiagram,
	layoutFlowDiagram,
	normalizeFlowDiagram,
	wrapFlowText,
} from "../src/parse/blocks/flow.mjs";

test("extractFlowDiagram parses graph JSON form (nodes + edges)", () => {
	const content = JSON.stringify({
		nodes: [
			{ id: "a", label: "Start", type: "start" },
			{ id: "b", label: "End", type: "end" },
		],
		edges: [{ from: "a", to: "b", label: "go" }],
	});

	assert.deepEqual(extractFlowDiagram(content), {
		nodes: [
			{ id: "a", label: "Start", type: "start", note: "", next: "" },
			{ id: "b", label: "End", type: "end", note: "", next: "" },
		],
		edges: [{ from: "a", to: "b", label: "go" }],
	});
});

test("extractFlowDiagram accepts links as an alias for edges", () => {
	const content = JSON.stringify({
		nodes: [{ id: 1 }, { id: 2 }],
		links: [{ from: 1, to: 2 }],
	});

	const result = extractFlowDiagram(content);
	assert.deepEqual(result.nodes.map((node) => node.id), ["1", "2"]);
	assert.deepEqual(result.edges, [{ from: "1", to: "2", label: "" }]);
});

test("extractFlowDiagram edges accept source/target and title aliases", () => {
	const content = JSON.stringify({
		nodes: [{ id: "x" }, { id: "y" }],
		edges: [{ source: "x", target: "y", title: "hop" }],
	});

	const result = extractFlowDiagram(content);
	assert.deepEqual(result.edges, [{ from: "x", to: "y", label: "hop" }]);
});

test("extractFlowDiagram row form derives implicit edges from next (doubled: extractFlowDiagram pre-derives them, normalizeFlowDiagram derives them again from the same next field, upstream does not dedupe)", () => {
	const content = [
		"```csv",
		"id,label,type,next",
		"a,Start,start,b",
		"b,Check,decision,c",
		"c,End,end,",
		"```",
	].join("\n");

	const result = extractFlowDiagram(content);
	assert.deepEqual(
		result.nodes.map((node) => node.id),
		["a", "b", "c"],
	);
	assert.deepEqual(result.edges, [
		{ from: "a", to: "b", label: "" },
		{ from: "b", to: "c", label: "" },
		{ from: "a", to: "b", label: "" },
		{ from: "b", to: "c", label: "" },
	]);
});

test("normalizeFlowDiagram keeps explicit edges and appends implicit next edges (no dedupe)", () => {
	const result = normalizeFlowDiagram(
		[{ id: "a", next: "b" }, { id: "b" }],
		[{ from: "a", to: "b", label: "explicit" }],
	);

	assert.deepEqual(result.edges, [
		{ from: "a", to: "b", label: "explicit" },
		{ from: "a", to: "b", label: "" },
	]);
});

test("normalizeFlowDiagram silently drops edges pointing at unknown ids", () => {
	const result = normalizeFlowDiagram(
		[{ id: "a" }, { id: "b" }],
		[{ from: "a", to: "b" }, { from: "a", to: "ghost" }],
	);

	assert.deepEqual(result.edges, [{ from: "a", to: "b", label: "" }]);
});

test("normalizeFlowDiagram drops nodes whose id is empty after trim", () => {
	const result = normalizeFlowDiagram([{ id: "" }, { id: "   " }, { id: "real" }], []);

	assert.deepEqual(
		result.nodes.map((node) => node.id),
		["real"],
	);
});

test("normalizeFlowDiagram normalizes the full flow type table", () => {
	const cases = [
		["start", "start"],
		["end", "end"],
		["decision", "decision"],
		["gate", "gate"],
		["risk", "risk"],
		["action", "action"],
		["warning", "risk"],
		["blocked", "risk"],
		["error", "risk"],
		["question", "decision"],
		["branch", "decision"],
		["condition", "decision"],
		["weird", "action"],
		[undefined, "action"],
	];
	const rawNodes = cases.map(([type], index) => ({ id: `n${index}`, type }));

	const result = normalizeFlowDiagram(rawNodes, []);
	assert.deepEqual(
		result.nodes.map((node) => node.type),
		cases.map(([, expected]) => expected),
	);
});

test("computeFlowLevels gives every node in a cycle its own fallback layer", () => {
	const nodes = [{ id: "a" }, { id: "b" }, { id: "c" }];
	const edges = [
		{ from: "a", to: "b" },
		{ from: "b", to: "c" },
		{ from: "c", to: "a" },
	];

	const levels = computeFlowLevels(nodes, edges);
	assert.deepEqual(Object.fromEntries(levels), { a: 1, b: 2, c: 3 });
});

test("layoutFlowDiagram positions a 3-node linear chain with exact coordinates", () => {
	const model = {
		nodes: [
			{ id: "a", label: "A", type: "start", note: "" },
			{ id: "b", label: "B", type: "action", note: "" },
			{ id: "c", label: "C", type: "end", note: "" },
		],
		edges: [
			{ from: "a", to: "b", label: "" },
			{ from: "b", to: "c", label: "next" },
		],
	};

	const layout = layoutFlowDiagram(model);

	assert.equal(layout.width, 760);
	assert.equal(layout.height, 396);
	assert.deepEqual(layout.nodes, [
		{ id: "a", label: "A", type: "start", note: "", x: 280, y: 28, width: 200, height: 64, lines: ["A"] },
		{ id: "b", label: "B", type: "action", note: "", x: 280, y: 166, width: 200, height: 64, lines: ["B"] },
		{ id: "c", label: "C", type: "end", note: "", x: 280, y: 304, width: 200, height: 64, lines: ["C"] },
	]);
	assert.deepEqual(layout.edges, [
		{ fromX: 380, fromY: 92, toX: 380, toY: 166, midY: 129, label: "" },
		{ fromX: 380, fromY: 230, toX: 380, toY: 304, midY: 267, label: "next" },
	]);
});

test("layoutFlowDiagram on an empty model returns pure data without throwing", () => {
	const layout = layoutFlowDiagram({ nodes: [], edges: [] });
	assert.deepEqual(layout, { width: 760, height: 120, nodes: [], edges: [] });
});

test("extractFlowDiagram on empty content returns empty nodes/edges without throwing", () => {
	assert.deepEqual(extractFlowDiagram(""), { nodes: [], edges: [] });
});

test("extractFlowDiagram does not treat a JSON-shaped ```csv fence as graph form", () => {
	const content = ["```csv", '{"nodes":[{"id":"a"}]}', "```"].join("\n");
	assert.deepEqual(extractFlowDiagram(content), { nodes: [], edges: [] });
});

test("wrapFlowText keeps short ASCII text on one line", () => {
	assert.deepEqual(wrapFlowText("Hello"), ["Hello"]);
});

test("wrapFlowText wraps mixed ASCII/CJK text at the visual-width boundary", () => {
	const text = `${"A".repeat(20)}测试圈子内容`;
	assert.deepEqual(wrapFlowText(text), [`${"A".repeat(20)}测试`, "圈子内容"]);
});

test("wrapFlowText truncates beyond maxLines with an ellipsis", () => {
	const text = "字".repeat(45);
	assert.deepEqual(wrapFlowText(text), ["字".repeat(14), "字".repeat(14), `${"字".repeat(11)}...`]);
});
