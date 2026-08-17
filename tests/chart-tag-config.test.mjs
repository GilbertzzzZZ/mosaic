import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { wilkinsonExtended, Band, Linear, Point } from "@antv/scale";
import {
	parseDatasetManifest,
	parseDatasetData,
} from "../src/parse/dataset-loader.mjs";
import {
	buildChartFromTag,
	buildChartFromInline,
	parseGranularityOptions,
	formatChartNumber,
	applyLabelStyle,
	labelTextStyle,
	applyHoverBandStyle,
	hoverBandStyle,
	applyHighlightMarkStyle,
	highlightMarkStyle,
	applyCrosshairStyle,
	crosshairStyle,
	applyTooltipStyle,
	tooltipStyle,
} from "../src/render/chart-tag-config.mjs";

// The config we hand to <Line/>, <Column/> or <DualAxes/> is NOT what the engine
// reads: @ant-design/plots merges it into the plot's own defaults, pushes most of
// the top level down into the mark children and then deletes every top-level key
// that is not in its VIEW_OPTIONS whitelist. A test that reads our config object
// only proves the shape we wrote — not that the key survived to the layer that
// reads it. `asEngineSees` runs the real adaptor so assertions can land on the
// spec the engine actually receives.
// The CJS build is used on purpose: the ESM build has directory imports Node
// refuses to resolve.
const require = createRequire(import.meta.url);
const { mergeWithArrayCoverage } = require("@ant-design/plots/lib/core/utils");
const PLOTS = {
	Line: require("@ant-design/plots/lib/core/plots/line").Line,
	Column: require("@ant-design/plots/lib/core/plots/column").Column,
	DualAxes: require("@ant-design/plots/lib/core/plots/dual-axes").DualAxes,
};
// G2 itself, as bundled inside plots — the copy whose shape registry and guide
// normalisation are the ones actually in play at runtime.
const G2 = (path) =>
	require(`@ant-design/plots/node_modules/@antv/g2/lib/${path}`);
const { addGuideToScale } = G2("runtime/transform.js");

function asEngineSees(built) {
	const Plot = PLOTS[built.chartType];
	assert.ok(Plot, `no plot class for ${built.chartType}`);
	// what Plot.mergeOption() does, minus the DOM
	const options = mergeWithArrayCoverage(
		{},
		{ type: "view", autoFit: true },
		Plot.getDefaultOptions(),
		built.config,
	);
	Plot.prototype.getSchemaAdaptor.call(null)({ chart: null, options });
	return options;
}

// The marks the engine ends up with: for a single-view chart plots creates one
// from its own defaults (`children: [{type: 'line'}]`) and pours our top-level
// options into it, so there is never a "no children" case.
const marksOf = (spec) => spec.children ?? [];

const manifest = parseDatasetManifest(
	JSON.stringify({
		schemaVersion: 1,
		id: "t-monthly",
		title: "Monthly test data",
		data: "./t.csv",
		grain: ["AnchorDate"],
		primaryKey: ["AnchorDate"],
		time: { field: "AnchorDate", sourceGranularity: "month" },
		fields: [
			{ name: "AnchorDate", type: "date", required: true },
			{
				name: "Total",
				label: "Total metric",
				type: "integer",
				required: true,
				rollup: "avg",
			},
			{ name: "Split", type: "integer", required: true, rollup: "sum" },
		],
	}),
);
const rows = parseDatasetData(
	manifest,
	"AnchorDate,Total,Split\n2026-03-01,30,3\n2026-02-01,20,2\n2026-01-01,10,1\n",
);

const base = { x: "period", from: "2026-01-01", to: "2026-03-01" };

test("line: long-format data, labels from manifest, footnote from meta", () => {
	const r = buildChartFromTag({
		manifest,
		rows,
		attributes: {
			...base,
			type: "line",
			series: "Total,Split",
			granularity: "month",
		},
	});
	assert.equal(r.chartType, "Line");
	assert.equal(r.config.data.length, 6); // 3 periods × 2 series
	assert.equal(r.config.xField, "period");
	// colorField, not seriesField: seriesField only splits series in v2, it does not colour them
	assert.equal(r.config.colorField, "series");
	assert.equal(r.config.data[0].series, "Total metric"); // manifest label applies
	assert.match(r.footnote, /Monthly test data/);
	assert.match(r.footnote, /3\/3 source rows/);
	assert.match(r.footnote, /data through 2026-03-01/);
	assert.equal(r.granularity, "month");
	assert.deepEqual(r.availableGranularities, ["month", "quarter"]);
});

test("quarter rollup honours per-field rollup (avg vs sum)", () => {
	const r = buildChartFromTag({
		manifest,
		rows,
		attributes: {
			...base,
			type: "line",
			series: "Total,Split",
			granularity: "quarter",
		},
	});
	const byLabel = new Map(r.config.data.map((d) => [d.series, d.value]));
	assert.equal(byLabel.get("Total metric"), 20); // avg(10,20,30)
	assert.equal(byLabel.get("Split"), 6); // sum(1,2,3)
});

test("grouped-bar maps to Column with grouped bars", () => {
	const r = buildChartFromTag({
		manifest,
		rows,
		attributes: {
			...base,
			type: "grouped-bar",
			series: "Total,Split",
			granularity: "month",
		},
	});
	assert.equal(r.chartType, "Column");
	assert.equal(r.config.group, true);
});

// bar 与 grouped-bar 是同一张图的两个名字。绑成一条断言而不是各测各的：
// grouped-bar 的行为是既有的、已验证的那份，bar 与它逐字相等就必然跟着正确，
// 日后 grouped-bar 怎么改，bar 都不会悄悄分家。
test("bar and grouped-bar are two names for one chart", () => {
	const csv = "period,Orders,Revenue\n2025-01,1180,42000\n2025-02,1260,45500";
	const attrs = { title: "t", x: "period", series: "Orders,Revenue" };
	const bar = buildChartFromInline({ attributes: { ...attrs, type: "bar" }, csv });
	const grouped = buildChartFromInline({ attributes: { ...attrs, type: "grouped-bar" }, csv });
	// 逐字比 JSON 而不是 deepEqual：配置里的 labelFormatter / tickMethod 是每次调用
	// 新建的闭包，引用永远不等，但那不是两张图的差别。JSON 覆盖全部数据与开关，
	// 键集合再补上被序列化丢掉的那几个函数字段。
	assert.equal(JSON.stringify(bar), JSON.stringify(grouped));
	assert.deepEqual(Object.keys(bar.config).sort(), Object.keys(grouped.config).sort());
	assert.equal(bar.config.group, true);
});

// 多系列的 bar 曾经既不 group 也不 stack：G2 把每个系列画在同一个位置上，
// 最高的那根盖住其余的，只在底部露出一线。n 个系列必须是 n 根并排的柱子。
test("bar draws one column per series instead of stacking them on one spot", () => {
	const r = buildChartFromTag({
		manifest,
		rows,
		attributes: { ...base, type: "bar", series: "Total,Split", granularity: "month" },
	});
	assert.equal(r.chartType, "Column");
	assert.equal(r.config.group, true);
	assert.equal(r.config.stack, undefined);
	// 两个系列各自成列，没有被合并掉
	assert.deepEqual([...new Set(r.config.data.map((d) => d.series))].sort(), [
		"Split",
		"Total metric",
	]);
});

// group 对单系列是空操作。柱宽（BAR_X_SCALE）和其余配置都不能因为这次合并而变。
test("a single-series bar is untouched by grouping", () => {
	const r = buildChartFromInline({
		attributes: { title: "t", x: "period", type: "bar", series: "Orders", unit: "cny" },
		csv: "period,Orders\n2025-01,1180\n2025-02,1260",
	});
	assert.equal(r.chartType, "Column");
	assert.deepEqual(r.config.scale.x, { paddingInner: 0.5, paddingOuter: 0.25 });
	assert.equal(r.config.stack, undefined);
	assert.equal(r.config.data.length, 2);
	assert.deepEqual([...new Set(r.config.data.map((d) => d.series))], ["Orders"]);
});

test("combo pins both implicit axes to one scale", () => {
	const r = buildChartFromTag({
		manifest,
		rows,
		attributes: {
			...base,
			type: "combo",
			bars: "Split",
			lines: "Total",
			granularity: "month",
		},
	});
	assert.equal(r.chartType, "DualAxes");
	assert.deepEqual(
		r.config.children.map((c) => c.type),
		["interval", "line", "point"],
	);
	const [barChild, lineChild] = r.config.children;
	assert.equal(barChild.scale.y.domainMin, 0);
	assert.equal(lineChild.scale.y.domainMin, 0);
	assert.equal(barChild.scale.y.domainMax, lineChild.scale.y.domainMax);
	assert.equal(barChild.yField, "barValue");
	assert.equal(lineChild.yField, "lineValue");
});

test("combo drops the right axis, combo-dual-axis keeps it", () => {
	// combo pins both sides to one domain, so the right axis was a tick-for-tick copy
	// of the left — the same numbers printed twice, and a standing invitation to read
	// the two series as living in different units.
	const single = buildChartFromTag({
		manifest,
		rows,
		attributes: { ...base, type: "combo", bars: "Split", lines: "Total", granularity: "month" },
	});
	const rightAxes = (built) =>
		built.config.children.filter((child) => child.axis?.y?.position === "right");
	assert.equal(rightAxes(single).length, 0);
	// the line and its points share one y scale, so both have to say the same thing:
	// G2 merges guides per scale and the last writer wins
	for (const child of single.config.children) {
		if (child.type === "interval") continue;
		assert.equal(child.axis.y, false, child.type);
	}
	// `false` is the engine's own off switch: G2's addGuideToScale normalises it to
	// scale.y.guide = null, and inferComponent drops every scale whose guide is null.
	// Running that step for real is the difference between "we wrote false" and "the
	// axis is gone" — feed it the mark plots actually hands over.
	const guideOf = (mark) => addGuideToScale([], mark, {})[1].scale.y.guide;
	for (const mark of marksOf(asEngineSees(single))) {
		if (mark.type === "interval") {
			assert.notEqual(guideOf(mark), null); // the left axis stays
			continue;
		}
		assert.equal(guideOf(mark), null, `${mark.type}: still guides an axis`);
	}

	const dual = buildChartFromTag({
		manifest,
		rows,
		attributes: {
			...base,
			type: "combo-dual-axis",
			bars: "Split",
			lines: "Total",
			granularity: "month",
		},
	});
	assert.equal(rightAxes(dual).length, 2); // the line and its points
	for (const mark of marksOf(asEngineSees(dual))) {
		assert.notEqual(addGuideToScale([], mark, {})[1].scale.y.guide, null, mark.type);
	}
});

test("combo-dual-axis keeps axes independent, each side reading its own unit", () => {
	const r = buildChartFromTag({
		manifest,
		rows,
		attributes: {
			...base,
			type: "combo-dual-axis",
			lines: "Total",
			bars: "Split",
			leftUnit: "cny",
			rightUnit: "%",
			granularity: "month",
		},
	});
	const [barChild, lineChild] = r.config.children;
	assert.equal(barChild.scale.y.domainMax, 3 * 1.08); // Split max=3 + headroom
	assert.equal(lineChild.scale.y.domainMax, 30 * 1.08); // Total max=30 + headroom
	// the unit no longer prints as an axis title, but it still has to reach the right
	// side's tick labels: left formats as money, right as a percentage
	assert.equal(barChild.axis.y.labelFormatter(12), "¥ 12");
	assert.equal(lineChild.axis.y.labelFormatter(12), "12%");
	assert.equal(lineChild.axis.y.position, "right"); // the second axis has to be moved off the left edge
	assert.notEqual(barChild.scale.y.key, lineChild.scale.y.key); // separate scale groups keep the two axes apart
});

// Task 8: the unit used to be the y axis title, drawn outside the left axis. A y axis
// title costs a flat 28px of horizontal room — rotated 90°, so what the layout charges
// is the text's height and it never varies with the unit's length — and a dual axis pays
// it twice. The unit now travels on the built chart and is drawn in the figure header.
const UNIT_CASES = [
	["line", { type: "line", series: "Total,Split", unit: "cny" }],
	["bar", { type: "bar", series: "Total", unit: "cny" }],
	["grouped-bar", { type: "grouped-bar", series: "Total,Split", unit: "cny" }],
	["stacked-bar", { type: "stacked-bar", series: "Total,Split", unit: "cny" }],
	["combo", { type: "combo", bars: "Split", lines: "Total", unit: "cny" }],
	[
		"combo-dual-axis",
		{ type: "combo-dual-axis", bars: "Split", lines: "Total", leftUnit: "cny", rightUnit: "%" },
	],
];
const withUnits = (attrs) =>
	buildChartFromTag({ manifest, rows, attributes: { ...base, ...attrs, granularity: "month" } });

test("no chart type leaves a y axis title behind for the unit", () => {
	// deleting the key is enough: Line, Column and DualAxes all default to
	// axis.y.title === false, so the engine ends up with an explicit false rather than
	// an absent key. Asserting on the merged spec is the point — a config that simply
	// never wrote `title` would prove nothing about what the layout is charged for.
	for (const [name, attrs] of UNIT_CASES) {
		const spec = asEngineSees(withUnits(attrs));
		assert.ok(!spec.axis?.y?.title, `${name}: a view-level y axis title survived`);
		for (const mark of marksOf(spec)) {
			const y = mark.axis?.y;
			// y === false is the axis switched off wholesale (combo's right-hand side);
			// undefined is a mark that carries no axis at all (the line's points).
			assert.ok(
				y === false || y === undefined || y.title === false,
				`${name}/${mark.type}: axis.y.title is ${JSON.stringify(y && y.title)}`,
			);
		}
	}
});

test("the unit rides on the built chart, one field per axis", () => {
	// the contract the figure header reads: a single-axis chart fills `unit` only, a dual
	// axis fills `leftUnit`/`rightUnit` only. Never both, never an empty string — an
	// absent unit has to be undefined so the header can test the field itself.
	for (const [name, attrs] of UNIT_CASES) {
		const built = withUnits(attrs);
		if (name === "combo-dual-axis") {
			assert.equal(built.unit, undefined, name);
			assert.equal(built.leftUnit, "cny", name);
			assert.equal(built.rightUnit, "%", name);
		} else {
			assert.equal(built.unit, "cny", name);
			assert.equal(built.leftUnit, undefined, name);
			assert.equal(built.rightUnit, undefined, name);
		}
		// no unit= at all: every field stays undefined rather than becoming ""
		const bare = withUnits({ ...attrs, unit: undefined, leftUnit: undefined, rightUnit: undefined });
		assert.deepEqual(
			[bare.unit, bare.leftUnit, bare.rightUnit],
			[undefined, undefined, undefined],
			name,
		);
	}
	// a dual axis given only unit= keeps the existing fallback: it is the left side's
	// unit, the same value its left tick labels are formatted with
	const fallback = withUnits({
		type: "combo-dual-axis",
		bars: "Split",
		lines: "Total",
		unit: "cny",
	});
	assert.equal(fallback.leftUnit, "cny");
	assert.equal(fallback.unit, undefined);
	assert.equal(fallback.rightUnit, undefined);
	// inline data goes through the same builder, so it carries the unit too
	const inline = buildChartFromInline({
		attributes: { x: "month", type: "bar", series: "a", unit: " cny " },
		csv: INLINE_CSV,
	});
	assert.equal(inline.unit, "cny"); // trimmed: the header prints it verbatim
});

test("color overrides and defaults", () => {
	const r = buildChartFromTag({
		manifest,
		rows,
		attributes: {
			...base,
			type: "line",
			series: "Total,Split",
			TotalColor: "#112233",
			granularity: "month",
		},
	});
	assert.deepEqual(r.config.scale.color.range, ["#112233", "#dc2626"]); // overrides the 1st; the 2nd falls back to the default palette's 2nd color
});

test("combo default palette does not collide between bars and lines", () => {
	const r = buildChartFromTag({
		manifest,
		rows,
		attributes: {
			...base,
			type: "combo",
			bars: "Split",
			lines: "Total",
			granularity: "month",
		},
	});
	// one shared colour scale for the whole view: the range follows the draw order
	assert.deepEqual(
		r.config.children.map((c) => c.type),
		["interval", "line", "point"],
	);
	assert.deepEqual(r.config.scale.color.range, ["#2563eb", "#dc2626"]);
});

test("dual axis children carry their own data and the line points repeat it", () => {
	const r = buildChartFromTag({
		manifest,
		rows,
		attributes: {
			...base,
			type: "combo",
			bars: "Split",
			lines: "Total",
			granularity: "month",
		},
	});
	assert.equal(r.config.data, undefined); // view-level data is not handed down to children
	const [barChild, lineChild, pointChild] = r.config.children;
	assert.equal(barChild.data.length, 3);
	assert.equal(lineChild.data.length, 3);
	assert.equal(pointChild.data, lineChild.data); // points do not inherit the line's data
	assert.deepEqual(pointChild.scale.y, lineChild.scale.y);
	assert.equal(pointChild.tooltip, false);
});

test("labels attribute toggles value labels", () => {
	const on = buildChartFromTag({
		manifest,
		rows,
		attributes: {
			...base,
			type: "line",
			series: "Total",
			labels: "all",
			granularity: "month",
		},
	});
	const off = buildChartFromTag({
		manifest,
		rows,
		attributes: {
			...base,
			type: "line",
			series: "Total",
			labels: "off",
			granularity: "month",
		},
	});
	assert.notEqual(on.config.label, undefined);
	assert.equal(off.config.label, undefined);
});

test("type defaults: multi-series line, single-series bar", () => {
	const multi = buildChartFromTag({
		manifest,
		rows,
		attributes: { ...base, series: "Total,Split", granularity: "month" },
	});
	const single = buildChartFromTag({
		manifest,
		rows,
		attributes: { ...base, series: "Total", granularity: "month" },
	});
	assert.equal(multi.chartType, "Line");
	assert.equal(single.chartType, "Column");
});

test("granularity matching is case-insensitive", () => {
	const r = buildChartFromTag({
		manifest,
		rows,
		attributes: {
			...base,
			type: "line",
			series: "Total",
			granularity: "Month",
			granularityOptions: "Month,Quarter",
		},
	});
	assert.equal(r.granularity, "month");
	assert.deepEqual(
		parseGranularityOptions({ granularityOptions: "Month,Quarter" }),
		["month", "quarter"],
	);
});

test("parseGranularityOptions parses and validates", () => {
	assert.deepEqual(
		parseGranularityOptions({ granularityOptions: "month,quarter" }),
		["month", "quarter"],
	);
	assert.deepEqual(parseGranularityOptions({}), [
		"day",
		"week",
		"month",
		"quarter",
	]);
	assert.throws(
		() => parseGranularityOptions({ granularityOptions: "month,decade" }),
		/decade/,
	);
});

test("formatChartNumber rounds and groups", () => {
	assert.equal(formatChartNumber(578.6666666666666), "578.67");
	assert.equal(formatChartNumber(15951.1), "15,951.1");
	assert.equal(formatChartNumber(52106), "52,106");
	assert.equal(formatChartNumber(null), "");
});

test("configs carry value formatters on the axis, the labels and the tooltip", () => {
	const line = buildChartFromTag({
		manifest,
		rows,
		attributes: {
			...base,
			type: "line",
			series: "Total",
			granularity: "month",
		},
	});
	assert.equal(typeof line.config.axis.y.labelFormatter, "function");
	assert.equal(typeof line.config.label.formatter, "function");
	assert.equal(typeof line.config.tooltip.items[0], "function");
	const combo = buildChartFromTag({
		manifest,
		rows,
		attributes: {
			...base,
			type: "combo",
			bars: "Split",
			lines: "Total",
			granularity: "month",
		},
	});
	const [barChild, lineChild] = combo.config.children;
	assert.equal(typeof barChild.axis.y.labelFormatter, "function");
	assert.equal(typeof barChild.label.formatter, "function");
	// combo has no right axis to format any more, but its numbers still need one
	assert.equal(lineChild.axis.y, false);
	assert.equal(typeof lineChild.label.formatter, "function");
	const dual = buildChartFromTag({
		manifest,
		rows,
		attributes: {
			...base,
			type: "combo-dual-axis",
			bars: "Split",
			lines: "Total",
			granularity: "month",
		},
	});
	assert.equal(typeof dual.config.children[1].axis.y.labelFormatter, "function");
});

test("value labels read the field they belong to", () => {
	const combo = buildChartFromTag({
		manifest,
		rows,
		attributes: {
			...base,
			type: "combo",
			bars: "Split",
			lines: "Total",
			granularity: "month",
		},
	});
	const [barChild, lineChild] = combo.config.children;
	assert.equal(barChild.label.text, "barValue");
	assert.equal(lineChild.label.text, "lineValue");
	assert.notEqual(barChild.label, lineChild.label); // each mark needs its own label object
});

test("line charts render points", () => {
	const r = buildChartFromTag({
		manifest,
		rows,
		attributes: {
			...base,
			type: "line",
			series: "Total",
			granularity: "month",
		},
	});
	assert.deepEqual(r.config.point, {
		shapeField: "circle",
		style: { r: 3, lineWidth: 0 },
	});
});

test("combo respects tag writing order (lines first)", () => {
	const r = buildChartFromTag({
		manifest,
		rows,
		attributes: {
			...base,
			type: "combo",
			lines: "Total",
			bars: "Split",
			granularity: "month",
		},
	});
	assert.deepEqual(
		r.config.children.map((c) => c.type),
		["line", "point", "interval"],
	);
	assert.deepEqual(r.config.scale.color.range, ["#2563eb", "#dc2626"]);
	const [lineChild, pointChild, barChild] = r.config.children;
	assert.equal(lineChild.scale.y.domainMax, barChild.scale.y.domainMax);
	assert.equal(pointChild.shapeField, "circle");
	assert.deepEqual(pointChild.style, { r: 3, lineWidth: 0 });
});

// The legend option is written at the top level but the engine reads it off the
// mark: plots deletes every top-level key outside VIEW_OPTIONS, and G2 turns a
// mark's `legend.color` into the colour scale's guide. So the mark is the layer
// that has to still hold it.
const legendOf = (built) => {
	const marks = marksOf(asEngineSees(built)).filter((mark) => mark.legend?.color);
	assert.ok(marks.length > 0, "the legend never reached a mark");
	return marks[0].legend.color;
};

// Both markers are registered shapes rather than built-ins: the bar needs a 3:1
// box a single itemMarkerSize could not serve, and the square is rounded to match
// the host's controls. Neither name can be a built-in symbol.
test("bar series get a rounded square marker, line series get a bar", () => {
	// the comment this replaces claimed the engine defaults to a dash for lines and a
	// square for columns. True of the engine, false here: our line charts hand the
	// legend a shape scale through the data points' shapeField, so the real default
	// is a dot for lines and a square for columns — and all four dots on a combo.
	const line = legendOf(
		buildChartFromTag({
			manifest,
			rows,
			attributes: { ...base, type: "line", series: "Total,Split", granularity: "month" },
		}),
	);
	// the series names, not the raw column keys: the manifest relabels Total
	assert.equal(line.itemMarker("Total metric"), "legendBar");
	assert.equal(line.itemMarker("Split"), "legendBar");

	const bar = legendOf(
		buildChartFromTag({
			manifest,
			rows,
			attributes: { ...base, type: "grouped-bar", series: "Total,Split", granularity: "month" },
		}),
	);
	assert.equal(bar.itemMarker("Total metric"), "legendSquare");
	assert.equal(bar.itemMarker("Split"), "legendSquare");

	// a combo has to carry both at once — this is the case a single itemMarkerSize
	// could never serve, which is why the bar is a registered shape and not `hyphen`
	const combo = legendOf(
		buildChartFromTag({
			manifest,
			rows,
			attributes: { ...base, type: "combo", bars: "Split", lines: "Total", granularity: "month" },
		}),
	);
	assert.equal(combo.itemMarker("Split"), "legendSquare");
	assert.equal(combo.itemMarker("Total metric"), "legendBar");
});

test("the legend bar is a fill shape with a 3:1 aspect, so 12 renders as 12x4", () => {
	// the engine normalises the marker's long edge to itemMarkerSize
	// (@antv/component scaleToPixel + Item.scaleSize), so a path whose natural box is
	// 3:1 comes out S wide by S/3 high whatever the theme's own itemMarkerSize is.
	// It must be a fill shape: useMarker forces lineWidth to 0 for those, and a
	// non-zero line width is exactly what shrinks the marker
	// (rendered = bbox x (1 - lineWidth*sqrt2/16) x itemMarkerSize/16).
	const { Symbols } = G2("utils/marker.js");
	const symbol = Symbols.get("legendBar");
	assert.ok(symbol, "the shape was never registered");
	assert.deepEqual(symbol.style, ["fill"]); // useMarker reads .style directly
	const [, ...points] = symbol(0, 0, 24).filter((seg) => seg[0] !== "Z");
	const xs = points.map((p) => p[1]);
	const ys = points.map((p) => p[2]);
	const width = Math.max(...xs) - Math.min(...xs);
	const height = Math.max(...ys) - Math.min(...ys);
	assert.equal(width / height, 3);
});

test("the legend sits top centre with a 12px marker and a 4px gap to the label", () => {
	// position and alignment are two separate keys, and alignment lives one level
	// down in `layout` (there is no `align`): the engine looks the preset up by
	// position, and top resolves to ['row', 'flex-start', 'center'] — flex-start
	// being exactly the "stuck to the left" this replaces.
	for (const [name, attrs] of CHART_SHAPES) {
		const legend = legendOf(
			buildChartFromTag({
				manifest,
				rows,
				attributes: { ...base, ...attrs, granularity: "month" },
			}),
		);
		assert.equal(legend.position, "top", name);
		assert.deepEqual(legend.layout, { justifyContent: "center" }, name);
		assert.equal(legend.itemMarkerSize, 12, name);
		// itemSpacing is [marker-to-label, label-to-value, value-to-focus]; only the
		// first one was asked to move
		assert.deepEqual(legend.itemSpacing, [4, 8, 4], name);
		// this one must be stated, not inherited: inferItemMarkerLineWidth only
		// short-circuits on an explicit value, otherwise it hands line-ish shapes a
		// lineWidth of 4, which the reverse scaling turns into a 5.17px square and a
		// 9.42px gap. Today it stays 12x12 only by accident.
		assert.equal(legend.itemMarkerLineWidth, 0, name);
	}
});

test("percent unit suffixes formatted values", () => {
	const pct = buildChartFromTag({
		manifest,
		rows,
		attributes: {
			...base,
			type: "line",
			series: "Total",
			unit: "%",
			granularity: "month",
		},
	});
	assert.equal(pct.config.axis.y.labelFormatter(2.6), "2.6%");
	assert.equal(pct.config.label.formatter(2.6), "2.6%");
	assert.equal(pct.config.axis.y.labelFormatter(null), "");
	const plain = buildChartFromTag({
		manifest,
		rows,
		attributes: {
			...base,
			type: "line",
			series: "Total",
			unit: "people",
			granularity: "month",
		},
	});
	assert.equal(plain.config.axis.y.labelFormatter(1234.5), "1,234.5");
});

test("currency units prefix formatted values", () => {
	const yuan = buildChartFromTag({
		manifest,
		rows,
		attributes: {
			...base,
			type: "line",
			series: "Total",
			unit: "cny",
			granularity: "month",
		},
	});
	assert.equal(yuan.config.axis.y.labelFormatter(12), "¥ 12");
	assert.equal(yuan.config.label.formatter(null), "");
	const usd = buildChartFromTag({
		manifest,
		rows,
		attributes: {
			...base,
			type: "line",
			series: "Total",
			unit: "usd",
			granularity: "month",
		},
	});
	assert.equal(usd.config.axis.y.labelFormatter(1234.5), "$ 1,234.5");
});

test("the chain only hides — nothing moves a label off its data point", () => {
	// 链上刻意只有 overlapHide。另外两个会挪位置：exceedAdjust 把越界标签平移回
	// 绘图区（实测顶部数字会被从数据点上方压回边界内，看着像贴在折线上），
	// overlapDodgeY 把碰撞的标签上下推开。位置保持不动是当前的取舍。
	// 若要加回去，这条会红——那时得连同「位移可接受」的判断一起记进来。
	for (const [name, attrs] of [
		["line", { type: "line", series: "Total" }],
		["bar", { type: "bar", series: "Total" }],
		["combo", { type: "combo", bars: "Split", lines: "Total" }],
	]) {
		const built = buildChartFromTag({
			manifest,
			rows,
			attributes: { ...base, ...attrs, labels: "all", granularity: "month" },
		});
		for (const mark of [built.config, ...(built.config.children ?? [])].filter((m) => m.label)) {
			const at = `${name}/${mark.type}`;
			assert.deepEqual(mark.label.transform.map((t) => t.type), ["overlapHide"], at);
			// 隐藏必须带排序函数：不带的话牺牲谁由 CSV 行序决定，与重要性无关
			assert.equal(typeof mark.label.transform[0].priority, "function", at);
		}
	}
});

// 空单元格不能进柱状图的数据集。interval 的 y 通道拿到 null 会把柱子从 0 一路画到
// 轴底——真实事故：互斥系列（盈利/亏损每月只填一列）的图上，空着的那一半月份每个都
// 长出一根顶到轴底的满高红柱，看起来像每月都巨亏。
// 折线图相反，必须留着 null：那是断点语义，删掉记录线会直接连过去。
test("an empty cell never becomes a bar, but stays a break in a line", () => {
	const csv = [
		"month,profit,loss",
		"2024-07,49.7,",
		"2024-08,29.7,",
		"2025-01,,-26.9",
		"2026-07,,-16.6",
	].join("\n");
	const attrs = { title: "t", x: "month", series: "profit,loss", unit: "万元" };

	for (const type of ["bar", "grouped-bar", "stacked-bar"]) {
		const data = buildChartFromInline({ attributes: { ...attrs, type }, csv }).config.data;
		assert.equal(
			data.filter((d) => d.value === null).length,
			0,
			`${type} 把 null 交给了引擎，柱子会顶到轴底`,
		);
		// 真实数字一条不能少
		assert.deepEqual(
			data.map((d) => d.value).sort((a, b) => a - b),
			[-26.9, -16.6, 29.7, 49.7],
			`${type} 连真实数值一起剔掉了`,
		);
	}

	const line = buildChartFromInline({ attributes: { ...attrs, type: "line" }, csv }).config.data;
	assert.equal(line.length, 8, "折线图每个 period × 每个系列都要有记录");
	assert.equal(line.filter((d) => d.value === null).length, 4, "折线图的断点被删掉了");

	// combo：柱那一半剔除，线那一半保留
	const combo = buildChartFromInline({
		attributes: { ...attrs, type: "combo", bars: "profit", lines: "loss" },
		csv,
	}).config;
	const bars = (combo.children ?? []).find((c) => c.yField === "barValue");
	const lines = (combo.children ?? []).find((c) => c.yField === "lineValue");
	assert.equal(bars.data.filter((d) => d.barValue === null).length, 0, "combo 的柱留下了 null");
	assert.equal(lines.data.filter((d) => d.lineValue === null).length, 2, "combo 的线丢了断点");
});

test("the cull spares the highlighted, the edges and the extremes, in that order", () => {
	// 分级是我们自己写的逻辑，不是选个引擎参数，所以要测它排出来的次序。
	// 引擎按 (datum, index, data) 调用这个回调，结果原样挂到标签节点上给 priority 读。
	const built = buildChartFromTag({
		manifest,
		rows,
		attributes: {
			...base,
			type: "line",
			series: "Total",
			labels: "all",
			granularity: "month",
			highlight: rows[2].month,
		},
	});
	const label = built.config.label;
	const rank = label.mosaicLabelRank;
	const field = label.mosaicLabelRankField;
	assert.equal(typeof rank, "function");
	assert.equal(typeof field, "string");

	// 造一份连续数据，最大最小都在中间，两头都不是极值
	const data = [
		{ period: "p0", value: 50 },
		{ period: "p1", value: 90 },
		{ period: "p2", value: 10 },
		{ period: "p3", value: 60 },
		{ period: "p4", value: 55 },
	];
	const r = (i) => rank(data[i], i, data);
	assert.equal(r(0), 1, "首期");
	assert.equal(r(4), 1, "末期");
	assert.equal(r(1), 2, "最大值");
	assert.equal(r(2), 2, "最小值");
	assert.equal(r(3), 3, "其余");

	// 首尾按周期名判，不按数组下标。多系列图（含堆叠柱）的数据是长格式，同一期
	// 占好几行，按下标判会把「第一个系列的第一期」当成唯一的首期，同期其余系列
	// 全被降级；末期同理。这里每期两行，故意让下标与周期错开。
	const long = [
		{ period: "p0", series: "a", value: 3 },
		{ period: "p0", series: "b", value: 4 },
		{ period: "p1", series: "a", value: 1 },
		{ period: "p1", series: "b", value: 2 },
		{ period: "p2", series: "a", value: 8 },
		{ period: "p2", series: "b", value: 5 },
	];
	assert.equal(rank(long[0], 0, long), 1, "首期第一行");
	assert.equal(rank(long[1], 1, long), 1, "首期第二行也是首期");
	assert.equal(rank(long[4], 4, long), 1, "末期第一行");
	assert.equal(rank(long[5], 5, long), 1, "末期第二行也是末期");
	assert.equal(rank(long[2], 2, long), 2, "中间那期的最小值");
	assert.equal(rank(long[3], 3, long), 3, "中间那期的普通值");
	// highlight 压过一切，连极值也让位——用户已明说这几期重要。
	// 周期名从真实数据里取：highlight= 会先被「必须在数据里存在」那道过滤筛一遍，
	// 编一个不存在的周期名进去，名单会是空的，这条断言就测了个寂寞。
	const real = built.config.data;
	const period = real[1].period;
	const marked = buildChartFromTag({
		manifest,
		rows,
		attributes: {
			...base,
			type: "line",
			series: "Total",
			labels: "all",
			granularity: "month",
			highlight: period,
		},
	}).config.label.mosaicLabelRank;
	// 中间一期，既非首尾；给它一份两头是极值的数据，确保它本来只配 RANK_PLAIN
	const plain = [
		{ period: "a", value: 0 },
		{ period, value: 5 },
		{ period: "c", value: 9 },
		{ period: "d", value: 6 },
	];
	assert.equal(rank(plain[1], 1, plain), 3, "没点名时它只是普通一期");
	assert.equal(marked(plain[1], 1, plain), 0, "点名后排到最前");

	// 分级算得对，还得看 priority 真的按它排——引擎读的是节点属性，替身按同一形状造
	const priority = built.config.label.transform.at(-1).priority;
	const node = (rankValue, value) => ({
		attributes: { mosaicLabelRank: rankValue, mosaicLabelRankField: "value", datum: { value }, text: `${value}` },
	});
	const sorted = (nodes) =>
		nodes.sort(priority).map((n) => `${n.attributes.mosaicLabelRank}:${n.attributes.datum.value}`);
	// 级别压过数值：被点名的小数排在普通的大数前面
	assert.deepEqual(sorted([node(3, 999), node(0, 1)]), ["0:1", "3:999"]);
	// 四级严格有序
	assert.deepEqual(sorted([node(3, 9), node(1, 9), node(2, 9), node(0, 9)]), [
		"0:9",
		"1:9",
		"2:9",
		"3:9",
	]);
	// 同级之间按绝对值从大到小，负数按绝对值算——亏损不该因为画在下方就先被牺牲
	assert.deepEqual(sorted([node(3, 5), node(3, -900), node(3, 40)]), [
		"3:-900",
		"3:40",
		"3:5",
	]);
	// 空单元格不是 0。互斥系列（盈利/亏损，每月只填一列）的图上，另一列整列是空格。
	// 若拿 `Number(x)` + `isFinite` 判「有没有数」，`Number(null)` 是 0 且通过检查，
	// 极值的下界会塌成 0，于是**每一个空格都满足 v === min**、被判成极值——优先级仅
	// 次于 highlight，把真正该保住的标签挤掉。`Number("")` 同样是 0。
	const sparse = [
		{ period: "s0", value: 50 },
		{ period: "s1", value: null }, // 空：CSV 空单元格解析成 null
		{ period: "s2", value: 30 }, // 真实最小值
		{ period: "s3", value: "" }, // 空：另一种空形态
		{ period: "s4", value: 60 },
	];
	assert.equal(rank(sparse[2], 2, sparse), 2, "30 是真实最小值，判极值");
	assert.equal(rank(sparse[1], 1, sparse), 4, "null 不是数值，判空值档");
	assert.equal(rank(sparse[3], 3, sparse), 4, "空串同理");
	// 有值的首尾按周期名判
	assert.equal(rank(sparse[0], 0, sparse), 1);
	assert.equal(rank(sparse[4], 4, sparse), 1);

	// 真正的坑不在极值那条，而在它**前面**两条：highlight 命中与首尾判定只看周期、
	// 不看值。空单元格只要落在那些月份就能拿到 rank 0/1，而 rank 0 在 overlapHide
	// 里永不被隐藏——它的标签是空串，看不见，却照样占位参与碰撞，把同期另一条系列
	// 的真实数字挤掉。互斥系列（每月只填一列）必然撞上：一半格子是空的。
	// 所以「没有数值」必须第一个判，排在 highlight 与首尾之前。
	// 这张图的 highlight 点名了 e0 与 e2，正是下面两个空格所在的周期。
	const exclusiveChart = buildChartFromInline({
		attributes: {
			title: "exclusive",
			type: "grouped-bar",
			x: "month",
			series: "profit,loss",
			highlight: "e0,e2",
		},
		csv: "month,profit,loss\ne0,,-1\ne1,42,\ne2,,-3",
	});
	const rankMarked = exclusiveChart.config.label.mosaicLabelRank;
	const exclusive = [
		{ period: "e0", value: null }, // 空 + 在 highlight 里 + 还是首期
		{ period: "e1", value: 42 },
		{ period: "e2", value: null }, // 空 + 在 highlight 里 + 还是末期
	];
	assert.equal(
		rankMarked(exclusive[0], 0, exclusive),
		4,
		"空值即使被 highlight 点名、又在首期，也不能压过真实数字",
	);
	assert.equal(
		rankMarked(exclusive[2], 2, exclusive),
		4,
		"末期的空值同理",
	);
	// 42 是这三行里唯一的真实值，既是 min 也是 max，所以判极值而不是普通——
	// 空值出局之后极值判定只在真实数字之间进行，这正是想要的。
	assert.equal(rankMarked(exclusive[1], 1, exclusive), 2, "中间那个真实值判极值");
	// 排序侧同样不能把空值当 0：它该排在所有真实数值之后，先被牺牲
	const emptyNode = {
		attributes: {
			mosaicLabelRank: 3,
			mosaicLabelRankField: "value",
			datum: { value: null },
			text: "",
		},
	};
	assert.deepEqual(
		[emptyNode, node(3, 5)].sort(priority).map((n) => n.attributes.datum.value),
		[5, null],
	);

	// 值取自 datum 而非文字。这两条只有在格式化把大小关系弄反时才分得出差别：
	// "1.2k" 按文字 parse 得到 1.2，会被排到 "50" 后面，而它其实是 1200。
	assert.deepEqual(
		sorted([
			{
				attributes: {
					mosaicLabelRank: 3,
					mosaicLabelRankField: "value",
					datum: { value: 1200 },
					text: "1.2k",
				},
			},
			node(3, 50),
		]),
		["3:1200", "3:50"],
	);
	// 没带 rank 的节点（理论上不该出现）按最低级处理，不能排到关键数据前面
	assert.deepEqual(
		[{ attributes: { text: "7", datum: { value: 7 } } }, node(0, 1)]
			.sort(priority)
			.map((n) => n.attributes.datum.value),
		[1, 7],
	);
});

test("a stacked bar centres its numbers inside each segment, and still culls", () => {
	// Every segment of a stacked bar is its own shape, and its bounding box is that
	// segment's rectangle rather than the whole column, so "inside" lands on the
	// segment's own centre. Two things travel with that: dy has to go to zero or the
	// text sits 4px off, and the sign-based callbacks have to go, because "inside" is
	// the same answer either way and a position of "bottom" would shove a negative
	// segment's number onto its lower edge.
	// 隐藏这一段和别的图型一样挂着：36 期的堆叠柱把每段数字都画出来，横向糊成一片
	// 谁也读不了——比隐藏一部分更糟。位置口径与要不要隐藏是两件事。
	const built = buildChartFromTag({
		manifest,
		rows,
		attributes: {
			...base,
			type: "stacked-bar",
			series: "Total,Split",
			labels: "all",
			granularity: "month",
		},
	});
	const label = built.config.label;
	assert.equal(label.position, "inside");
	assert.equal(label.textBaseline, "middle");
	assert.equal(label.textAlign, "center");
	assert.equal(label.dy, 0);
	// no callbacks left: a sign-driven answer here is the bug, not the feature
	for (const key of ["position", "textBaseline", "dy"]) {
		assert.notEqual(typeof label[key], "function", key);
	}
	assert.deepEqual(label.transform.map((t) => t.type), ["overlapHide"]);
	assert.equal(typeof label.transform[0].priority, "function");
	// "inside" has to be a real member of the placement table — "middle"/"center" are
	// not in it and throw rather than falling back
	const PLACEMENTS = [
		"area", "bottom", "bottomLeft", "bottomRight", "inside", "left", "outside",
		"right", "spider", "surround", "top", "topLeft", "topRight",
	];
	assert.ok(PLACEMENTS.includes(label.position));
	// and the placement has to survive down to the mark the engine draws
	const drawn = marksOf(asEngineSees(built)).find((mark) => mark.labels?.length);
	assert.equal(drawn.labels[0].position, "inside");
	assert.deepEqual(drawn.labels[0].transform.map((t) => t.type), ["overlapHide"]);

	// every other shape keeps the outside placement
	for (const [name, attrs] of CHART_SHAPES) {
		if (name === "stacked-bar") continue;
		const other = buildChartFromTag({
			manifest,
			rows,
			attributes: { ...base, ...attrs, labels: "all", granularity: "month" },
		});
		const marks = [other.config, ...(other.config.children ?? [])];
		for (const mark of marks.filter((m) => m.label)) {
			assert.equal(typeof mark.label.position, "function", `${name}/${mark.type}`);
			assert.equal(mark.label.position({ value: 1, barValue: 1, lineValue: 1 }), "top");
		}
	}
});

test("highlight= bolds the x axis labels it names, and leaves the rest alone", () => {
	// Axis label styles accept a per-tick callback: @antv/component's renderLabel
	// resolves every label* style through getCallbackStyle(style, [datum, i, data]),
	// and datum.label is the tick's own text.
	const built = buildChartFromInline({
		attributes: {
			x: "month",
			type: "bar",
			series: "a",
			highlight: "2025-01, 2025-03",
		},
		csv: INLINE_CSV,
	});
	const weight = built.config.axis.x.labelFontWeight;
	assert.equal(typeof weight, "function");
	assert.equal(weight({ label: "2025-01" }), "bold");
	assert.equal(weight({ label: "2025-03" }), "bold");
	assert.equal(weight({ label: "2025-02" }), "normal");
	assert.equal(weight({}), "normal"); // a tick with no label must not crash
	// keyword, not a number: G only honours normal/bold/bolder/lighter, and a numeric
	// weight depends on the reader's font shipping that face
	assert.ok(isBold(weight({ label: "2025-01" })));
	// and it has to reach the mark the engine reads the guide off
	const drawn = marksOf(asEngineSees(built)).find((mark) => mark.axis?.x);
	assert.equal(drawn.axis.x.labelFontWeight({ label: "2025-01" }), "bold");
	assert.equal(drawn.axis.x.labelFontWeight({ label: "2025-02" }), "normal");

	// no highlight= means no axis.x at all, so the theme's own weight stands
	const plain = buildChartFromInline({
		attributes: { x: "month", type: "bar", series: "a" },
		csv: INLINE_CSV,
	});
	assert.equal(plain.config.axis.x, undefined);
});

test("highlight= reaches both sides of a combo, which share one x scale", () => {
	// G2 merges guides per scale and the last writer wins, so an x axis configured on
	// only one child would be silently overwritten by the other
	const built = buildChartFromTag({
		manifest,
		rows,
		attributes: {
			...base,
			type: "combo",
			bars: "Split",
			lines: "Total",
			highlight: "2026-02",
			granularity: "month",
		},
	});
	// the value to write in highlight= is the period as the chart labels it, which at
	// month grain is "2026-02" (and "2026-Q1" at quarter grain, where a month can
	// never match — that is the right answer, not a bug)
	const periods = built.config.children[0].data.map((d) => d.period);
	assert.ok(periods.includes("2026-02"), `periods were ${periods}`);
	for (const child of built.config.children) {
		assert.equal(typeof child.axis.x.labelFontWeight, "function", child.type);
		assert.equal(child.axis.x.labelFontWeight({ label: "2026-02" }), "bold", child.type);
		assert.equal(child.axis.x.labelFontWeight({ label: "2026-01" }), "normal", child.type);
	}
	// turning the right axis off must not take the x axis with it
	assert.equal(built.config.children[1].axis.y, false);
});

test("the tooltip is compact and its text is themed to match the chart's numbers", () => {
	// the engine's dark theme paints the tooltip's text #A6A6A6 while the numbers on
	// the chart are pure white with a halo; "same brightness" is closing that gap.
	// Structure lives in the config, colour comes from withTheme() — the split the
	// mosaic:theme-change rebuild depends on.
	for (const [name, attrs] of CHART_SHAPES) {
		const built = buildChartFromTag({
			manifest,
			rows,
			attributes: { ...base, ...attrs, granularity: "month" },
		});
		const container = built.config.interaction.tooltip.css[".g2-tooltip"];
		assert.equal(container["font-size"], "14px", name);
		assert.equal(container["min-width"], "0", name); // was 120px: the floor on width
		assert.equal(container["max-width"], "240px", name); // was 360px
		assert.equal(container.padding, "8px 10px", name); // was 12px all round
		// the row height was 2em == 28px at our font size
		const item = built.config.interaction.tooltip.css[".g2-tooltip-list-item"];
		assert.equal(item["line-height"], "1.5em", name);
		// paint-order is the whole point of doing the stroke in CSS: without it the
		// stroke is centred on the glyph outline and eats half its stem, which is the
		// same problem the two-layer canvas labels exist to dodge
		assert.equal(container["-webkit-text-stroke-width"], "2px", name);
		assert.equal(container["paint-order"], "stroke fill", name);
		assert.equal(container["border-style"], "solid", name);
		assert.equal(container["border-width"], "1px", name);
		// no colour is decided here
		for (const key of ["color", "border-color", "-webkit-text-stroke-color"]) {
			assert.equal(container[key], undefined, `${name}: ${key} belongs to the theme`);
		}

		for (const dark of [false, true]) {
			const applied = applyTooltipStyle(built.config, tooltipStyle(dark));
			const [text, halo] = dark ? ["#FFFFFF", "#1F1F1F"] : ["#000000", "#FFFFFF"];
			assert.equal(applied[".g2-tooltip"].color, text, name);
			assert.equal(applied[".g2-tooltip"]["-webkit-text-stroke-color"], halo, name);
			assert.ok(applied[".g2-tooltip"]["border-color"], name);
			// the dark theme repaints three more specific selectors #A6A6A6, so the
			// container colour alone would lose to them
			for (const selector of [
				".g2-tooltip-title",
				".g2-tooltip-list-item-name-label",
				".g2-tooltip-list-item-value",
			]) {
				assert.equal(applied[selector].color, text, `${name} ${selector}`);
			}
			// and the layout keys must survive the merge
			assert.equal(applied[".g2-tooltip"]["max-width"], "240px", name);
			assert.equal(applied[".g2-tooltip-list-item-value"]["margin-left"], "12px", name);
		}
		// the whole sheet has to reach the interaction the engine runs. plots strips
		// `interaction` off the top level (not in VIEW_OPTIONS) and merges it into every
		// mark; G2's bubbleOptions() then folds the marks' copies back onto the view,
		// so the mark is where it has to be found.
		const carriers = marksOf(asEngineSees(built)).filter((mark) => mark.interaction);
		assert.ok(carriers.length > 0, `${name}: the interaction reached no mark`);
		assert.equal(
			carriers[0].interaction.tooltip.css[".g2-tooltip"]["max-width"],
			"240px",
			`${name}: as the engine sees it`,
		);
	}
});

test("the tooltip text lands on the same colour as the value labels", () => {
	for (const dark of [false, true]) {
		const [, glyph] = labelTextStyle(dark);
		assert.equal(tooltipStyle(dark)[".g2-tooltip"].color, glyph.fill, dark ? "dark" : "light");
	}
});

test("every mark that carries a value label receives the theme label style", () => {
	const style = { fill: "#ff00ff" };
	const other = { fill: "#00ff00" };
	// combo/combo-dual-axis draw the bars and the line as separate marks, so a walk
	// that only reaches the first one leaves half the labels on the engine default
	const cases = [
		["line", { type: "line", series: "Total,Split" }, 1],
		["bar", { type: "bar", series: "Total" }, 1],
		["grouped-bar", { type: "grouped-bar", series: "Total,Split" }, 1],
		["stacked-bar", { type: "stacked-bar", series: "Total,Split" }, 1],
		["combo", { type: "combo", bars: "Split", lines: "Total" }, 2],
		["combo-dual-axis", { type: "combo-dual-axis", bars: "Split", lines: "Total" }, 2],
	];
	for (const [name, attrs, expected] of cases) {
		const built = buildChartFromTag({
			manifest,
			rows,
			attributes: { ...base, ...attrs, labels: "all", granularity: "month" },
		});
		const touched = applyLabelStyle(built.config, [style, other]);
		assert.equal(touched.length, expected, `${name}: labelled marks reached`);
		const marks = [built.config, ...(built.config.children ?? [])];
		const labelled = marks.filter((mark) => mark.label);
		assert.equal(labelled.length, expected, `${name}: labelled marks present`);
		for (const mark of labelled) {
			const where = `${name}/${mark.type ?? "view"}`;
			// one label per layer, each reading the same field through its own style
			assert.equal(mark.label.length, 2, where);
			assert.deepEqual(mark.label[0].style, style, where);
			assert.deepEqual(mark.label[1].style, other, where);
			assert.equal(mark.label[0].text, mark.label[1].text, where);
		}
	}
});

function isBold(weight) {
	if (typeof weight === "number") return weight >= 600;
	return weight === "bold" || weight === "bolder";
}

test("value labels stack a halo layer under a bold pure black or white glyph", () => {
	// v5 strokes text after filling it, so a single layer caps the halo below the
	// stem width (~2px bold) — past that the stroke colour replaces the glyph. Two
	// layers dodge it: the halo is a separate, wider-stroked copy underneath.
	for (const dark of [false, true]) {
		const name = dark ? "dark" : "light";
		const layers = labelTextStyle(dark);
		assert.equal(layers.length, 2, `${name}: needs a halo layer and a glyph layer`);
		const [halo, glyph] = layers;
		const [text, backdrop] = dark ? ["#FFFFFF", "#1F1F1F"] : ["#000000", "#FFFFFF"];
		assert.equal(glyph.fill, text, name); // the glyph stays a pure extreme
		assert.equal(halo.fill, backdrop, name);
		assert.equal(halo.stroke, backdrop, name); // stroke + fill == a solid dilated backing
		// the glyph layer must not paint a stroke over itself, but has to match the halo's
		// width so both layers keep the same render bounds and exceedAdjust cannot split them
		assert.equal(glyph.stroke, "transparent", name);
		assert.equal(glyph.lineWidth, halo.lineWidth, `${name}: layers would drift apart`);
		// the halo now has to be wider than a single layer could ever manage
		assert.ok(halo.lineWidth > 2, `${name}: ${halo.lineWidth} is within single-layer reach`);
		for (const layer of layers) {
			assert.equal(layer.fillOpacity, 1, name); // the engine default of 0.65 washes it out
			assert.ok(isBold(layer.fontWeight), `${name}: ${layer.fontWeight} is not bold`);
			assert.equal(layer.background, undefined, name); // a plate reads as a box on the bar
		}
	}
});

test("every value label is configured identically apart from the field it reads", () => {
	// combo splits the bars and the line into separate marks, and a single-view chart
	// keeps its label on the root; all three have to look like one component. Only the
	// field and its formatter may differ — a dual axis carries a unit per side.
	// stacked-bar is deliberately out: its numbers sit centred inside each segment,
	// which is a different placement contract and has its own test.
	// rank 回调与它读的字段名都随 field 而变，跟 text/formatter 同类，单独验
	const shapeOf = ({ text, formatter, mosaicLabelRank, mosaicLabelRankField, ...rest }) => rest;
	const seen = [];
	for (const [name, attrs] of [
		["line", { type: "line", series: "Total,Split" }],
		["bar", { type: "bar", series: "Total" }],
		["grouped-bar", { type: "grouped-bar", series: "Total,Split" }],
		["combo", { type: "combo", bars: "Split", lines: "Total" }],
		["combo-dual-axis", { type: "combo-dual-axis", bars: "Split", lines: "Total" }],
	]) {
		const built = buildChartFromTag({
			manifest,
			rows,
			attributes: { ...base, ...attrs, labels: "all", granularity: "month" },
		});
		for (const mark of applyLabelStyle(built.config, labelTextStyle(false))) {
			mark.label.forEach((layer, i) => {
				const at = `${name}/${mark.type ?? "view"}#${i}`;
				assert.equal(typeof layer.mosaicLabelRank, "function", at);
				assert.equal(layer.mosaicLabelRankField, layer.text, at);
				seen.push([at, shapeOf(layer)]);
			});
		}
	}
	assert.ok(seen.length >= 14, `only ${seen.length} label layers found`);
	// compare layer 0 against every other layer 0, and likewise for layer 1
	for (const which of ["#0", "#1"]) {
		const group = seen.filter(([name]) => name.endsWith(which));
		const [[firstName, first], ...rest] = group;
		for (const [name, shape] of rest) {
			assert.deepEqual(shape, first, `${name} drifted from ${firstName}`);
		}
	}
});

// Two configs may hold the same function (formatters, the tick method) — those are
// immutable here. Any shared object or array is a hazard: plots and G2 rewrite the
// config in place, so a shared node lets one render leak into the next.
function sharedRefs(a, b, path = "", out = []) {
	if (a === null || b === null) return out;
	if (typeof a !== "object" || typeof b !== "object") return out;
	if (a === b) {
		out.push(path || "(root)");
		return out;
	}
	for (const key of Object.keys(a)) {
		if (key in b) sharedRefs(a[key], b[key], path ? `${path}.${key}` : key, out);
	}
	return out;
}

// Functions are fresh closures per build, so compare structure with them stubbed out.
const snapshot = (config) =>
	JSON.stringify(config, (key, value) => (typeof value === "function" ? "[fn]" : value));

const CHART_SHAPES = [
	["line", { type: "line", series: "Total,Split" }],
	["bar", { type: "bar", series: "Total" }],
	["grouped-bar", { type: "grouped-bar", series: "Total,Split" }],
	["stacked-bar", { type: "stacked-bar", series: "Total,Split" }],
	["combo", { type: "combo", bars: "Split", lines: "Total" }],
	["combo-dual-axis", { type: "combo-dual-axis", bars: "Split", lines: "Total" }],
];

test("rebuilding hands back a config that shares nothing with the previous one", () => {
	for (const [name, attrs] of CHART_SHAPES) {
		// highlight= is in here on purpose: the stripe annotation is one more template
		// that has to be deep-copied per build
		const of = () =>
			buildChartFromTag({
				manifest,
				rows,
				attributes: {
					...base,
					...attrs,
					labels: "all",
					highlight: "2026-02",
					granularity: "month",
				},
			}).config;
		const first = of();
		const second = of();
		assert.equal(snapshot(second), snapshot(first), `${name}: builds diverged`);
		assert.deepEqual(
			sharedRefs(first, second),
			[],
			`${name}: the renderer would write through these into the next render`,
		);
	}
});

test("a build at another granularity in between leaves the next one untouched", () => {
	// month -> quarter -> month is the granularity toggle, and the third build has to
	// come back byte for byte identical to the first
	for (const [name, attrs] of CHART_SHAPES) {
		const of = (granularity) =>
			buildChartFromTag({
				manifest,
				rows,
				attributes: { ...base, ...attrs, labels: "all", highlight: "2026-02" },
				granularity,
			}).config;
		const month = of("month");
		const quarter = of("quarter");
		const again = of("month");
		assert.equal(snapshot(again), snapshot(month), `${name}: month drifted`);
		assert.deepEqual(sharedRefs(month, quarter), [], `${name}: month/quarter share state`);
		assert.deepEqual(sharedRefs(month, again), [], `${name}: the two month builds share state`);
	}
});

test("lines are drawn at the width the user picked, on every chart that has one", () => {
	// the v5 theme ships 1, half of v4's 2, which left the line a hairline; 3 is the
	// value the user settled on — one step heavier than it ever was before
	const cases = [
		["line", { type: "line", series: "Total" }],
		["combo", { type: "combo", bars: "Split", lines: "Total" }],
		["combo-dual-axis", { type: "combo-dual-axis", bars: "Split", lines: "Total" }],
	];
	for (const [name, attrs] of cases) {
		const built = buildChartFromTag({
			manifest,
			rows,
			attributes: { ...base, ...attrs, granularity: "month" },
		});
		const line = built.config.children
			? built.config.children.find((child) => child.type === "line")
			: built.config;
		assert.equal(line.style.lineWidth, 3, name);
		// and the width has to reach the mark the engine draws, not just our object
		const spec = asEngineSees(built);
		const drawn = marksOf(spec).find((mark) => mark.type === "line");
		assert.equal(drawn.style.lineWidth, 3, `${name}: as the engine sees it`);
		// the dots keep the radius they had before the upgrade; the style that thickens
		// the line must not leak into them
		const point = built.config.children
			? built.config.children.find((child) => child.type === "point")
			: built.config.point;
		assert.equal(point.style.r, 3, `${name}: point radius`);
		assert.equal(point.style.lineWidth, 0, `${name}: point outline`);
	}
});

test("value labels sit outside the mark instead of inside it", () => {
	// placement now depends on the sign, so these are the values a positive datum
	// resolves to; the negative side has its own test
	const positive = { value: 1 };
	const resolve = (label) => ({
		textAlign: label.textAlign,
		textBaseline: label.textBaseline(positive),
		dy: label.dy(positive),
		position: label.position(positive),
	});
	const above = { textAlign: "center", textBaseline: "bottom", dy: -4, position: "top" };
	const line = buildChartFromTag({
		manifest,
		rows,
		attributes: {
			...base,
			type: "line",
			series: "Total",
			labels: "all",
			granularity: "month",
		},
	});
	assert.deepEqual(resolve(line.config.label), above);
	const combo = buildChartFromTag({
		manifest,
		rows,
		attributes: {
			...base,
			type: "combo",
			bars: "Split",
			lines: "Total",
			labels: "all",
			granularity: "month",
		},
	});
	for (const child of combo.config.children) {
		if (!child.label) continue; // the point mark carries no labels
		assert.deepEqual(resolve(child.label), above, child.type);
	}
});

test("interval charts halve the bar width, line charts leave x alone", () => {
	const padding = { paddingInner: 0.5, paddingOuter: 0.25 };
	for (const type of ["bar", "grouped-bar", "stacked-bar"]) {
		const r = buildChartFromTag({
			manifest,
			rows,
			attributes: { ...base, type, series: "Total,Split", granularity: "month" },
		});
		assert.deepEqual(r.config.scale.x, padding, type);
	}
	const line = buildChartFromTag({
		manifest,
		rows,
		attributes: { ...base, type: "line", series: "Total", granularity: "month" },
	});
	assert.equal(line.config.scale.x, undefined); // a point scale, no band to narrow
	const combo = buildChartFromTag({
		manifest,
		rows,
		attributes: {
			...base,
			type: "combo",
			bars: "Split",
			lines: "Total",
			granularity: "month",
		},
	});
	assert.deepEqual(combo.config.scale.x, padding);
});

test("y axes drop tick marks, draw solid grid lines and pick round ticks", () => {
	const line = buildChartFromTag({
		manifest,
		rows,
		attributes: { ...base, type: "line", series: "Total", granularity: "month" },
	});
	const axis = line.config.axis.y;
	assert.equal(axis.tick, false);
	assert.deepEqual(axis.gridLineDash, [0, 0]);
	assert.equal(axis.gridLineWidth, 1);
	assert.equal(axis.gridStrokeOpacity, 1);
	// $0–$69,660 is the sales demo's left axis: 4 ticks $20,000 apart, not 7 at $10,000
	assert.deepEqual(axis.tickMethod(0, 69660, 5), [0, 20000, 40000, 60000]);
	assert.deepEqual(axis.tickMethod(5, 5, 5), [5]); // flat data still yields one tick
	// the ticks come from the engine's own optimiser, not a hand-rolled step table:
	// the only thing wrapped around it is dropping ticks outside the domain, which is
	// what v4's Continuous.calculateTicks() did whenever nice was off
	for (const [min, max] of [[0, 69660], [3.2, 4.428], [0, 108], [-40, 260], [0.5, 0.92]]) {
		const engine = wilkinsonExtended(min, max, 5).filter((t) => t >= min && t <= max);
		assert.deepEqual(axis.tickMethod(min, max, 5), engine, `${min}..${max}`);
	}
	const combo = buildChartFromTag({
		manifest,
		rows,
		attributes: {
			...base,
			type: "combo-dual-axis",
			bars: "Split",
			lines: "Total",
			granularity: "month",
		},
	});
	for (const child of combo.config.children) {
		assert.equal(child.axis.y.tick, false);
		assert.deepEqual(child.axis.y.gridLineDash, [0, 0]);
		// only the left axis draws grid lines: two sets of ticks would double them up
		assert.equal(child.axis.y.grid, child.axis.y.position === "right" ? false : undefined);
	}
});

test("y axis gets headroom above the max value", () => {
	const line = buildChartFromTag({
		manifest,
		rows,
		attributes: {
			...base,
			type: "line",
			series: "Total,Split",
			granularity: "month",
		},
	});
	assert.equal(line.config.scale.y.domainMax, 30 * 1.08);
	// nice only rounds the domain up, so the headroom survives it and the axis top
	// lands on a labelled tick instead of a bare edge
	assert.equal(line.config.scale.y.nice, true);
	const combo = buildChartFromTag({
		manifest,
		rows,
		attributes: {
			...base,
			type: "combo",
			bars: "Split",
			lines: "Total",
			granularity: "month",
		},
	});
	assert.equal(combo.config.children[0].scale.y.domainMax, 30 * 1.08);
	assert.equal(combo.config.children[1].scale.y.domainMax, 30 * 1.08);
	const stacked = buildChartFromTag({
		manifest,
		rows,
		attributes: {
			...base,
			type: "stacked-bar",
			series: "Total,Split",
			granularity: "month",
		},
	});
	assert.equal(stacked.config.stack, true);
	assert.equal(stacked.config.scale.y.domainMax, 33 * 1.08); // max of the per-period stacked sum is 33
});

test("dual-axis percent suffix applies per side", () => {
	const r = buildChartFromTag({
		manifest,
		rows,
		attributes: {
			...base,
			type: "combo-dual-axis",
			bars: "Split",
			lines: "Total",
			leftUnit: "people",
			rightUnit: "%",
			granularity: "month",
		},
	});
	const [barChild, lineChild] = r.config.children;
	assert.equal(barChild.axis.y.labelFormatter(1000), "1,000");
	assert.equal(barChild.label.formatter(1000), "1,000");
	assert.equal(lineChild.axis.y.labelFormatter(2.6), "2.6%");
	assert.equal(lineChild.label.formatter(2.6), "2.6%");
});

test("value labels are set 2px above the rest of the chart's type", () => {
	for (const dark of [false, true]) {
		for (const layer of labelTextStyle(dark)) {
			// axis ticks, axis titles and the legend stay on the theme's 12px — only
			// the numbers the chart exists to convey get lifted
			assert.equal(layer.fontSize, 14, dark ? "dark" : "light");
		}
	}
});

test("a negative bar carries its number below the bar, not above the axis", () => {
	// a negative bar's bounding box has the zero line as its TOP edge, so leaving
	// position at "top" pins the label to the axis while the bar points the other way
	const built = buildChartFromInline({
		attributes: { x: "month", type: "bar", series: "profit", labels: "all" },
		csv: "month,profit\n2026-01,47.9\n2026-02,-47.9",
	});
	const label = Array.isArray(built.config.label) ? built.config.label[0] : built.config.label;
	const up = { value: 47.9 };
	const down = { value: -47.9 };
	assert.equal(label.position(up), "top");
	assert.equal(label.position(down), "bottom");
	assert.equal(label.textBaseline(up), "bottom");
	assert.equal(label.textBaseline(down), "top");
	// dy pushes the text away from the shape, so it has to flip sign with it
	assert.equal(label.dy(up), -4);
	assert.equal(label.dy(down), 4);
	assert.equal(label.textAlign, "center");
});

test("the sign is read from whichever value field the mark carries", () => {
	// single-view marks read `value`; a combo splits into barValue and lineValue
	const combo = buildChartFromTag({
		manifest,
		rows,
		attributes: { ...base, type: "combo", bars: "Split", lines: "Total", labels: "all", granularity: "month" },
	});
	for (const child of combo.config.children) {
		if (!child.label) continue;
		const label = Array.isArray(child.label) ? child.label[0] : child.label;
		const field = label.text;
		assert.equal(label.position({ [field]: -1 }), "bottom", `${child.type}/${field}`);
		assert.equal(label.position({ [field]: 1 }), "top", `${child.type}/${field}`);
	}
	// a missing or non-numeric value must not be read as negative
	const plain = buildChartFromInline({
		attributes: { x: "month", type: "bar", series: "profit", labels: "all" },
		csv: "month,profit\n2026-01,5",
	});
	const label = Array.isArray(plain.config.label) ? plain.config.label[0] : plain.config.label;
	assert.equal(label.position({}), "top");
	assert.equal(label.position({ value: null }), "top");
	assert.equal(label.position({ value: 0 }), "top"); // zero is not negative
});

test("a series named only in bars= or lines= still gets drawn", () => {
	// it is in the data and named in the tag; dropping it drew a chart that was
	// quietly missing a column, with nothing on the page to say so
	const csv = "month,appBuy,liveRoom,total\n2024-07,126.7,0.7,127.4\n2024-08,98.9,1,99.9";
	const seriesOf = (built) => [...new Set(built.config.data.map((d) => d.series))];
	const withLine = buildChartFromInline({
		attributes: { x: "month", type: "line", series: "appBuy,liveRoom", line: "total" },
		csv,
	});
	assert.deepEqual(seriesOf(withLine), ["appBuy", "liveRoom", "total"]);
	// the same holds on the fallback path, where the type was not recognised
	const fallback = buildChartFromInline({
		attributes: { x: "month", type: "grouped-bar-line", series: "appBuy,liveRoom", line: "total" },
		csv,
	});
	assert.deepEqual(seriesOf(fallback), ["appBuy", "liveRoom", "total"]);
	// naming a column twice must not draw it twice
	const dup = buildChartFromInline({
		attributes: { x: "month", type: "line", series: "appBuy,total", line: "total" },
		csv,
	});
	assert.deepEqual(seriesOf(dup), ["appBuy", "total"]);
	// combo reads the roles separately and is unaffected
	const combo = buildChartFromInline({
		attributes: { x: "month", type: "combo", bars: "appBuy,liveRoom", lines: "total" },
		csv,
	});
	const comboSeries = combo.config.children
		.filter((c) => c.data)
		.flatMap((c) => c.data.map((d) => d.series));
	assert.deepEqual([...new Set(comboSeries)].sort(), ["appBuy", "liveRoom", "total"]);
});

test("an unknown chart type still draws, and says so", () => {
	// a typo must not cost the whole chart: it falls back to the default shape and
	// reports what happened, so the reader knows the picture is not what was asked for
	const r = buildChartFromTag({
		manifest,
		rows,
		attributes: { ...base, type: "grouped-bar-line", series: "Total,Split", granularity: "month" },
	});
	assert.equal(r.chartType, "Line"); // the multi-series default
	assert.match(r.warning, /Unknown chart type "grouped-bar-line"/);
	assert.match(r.warning, /drawn as "line"/);
	// the message has to name the way out, not just the problem
	for (const t of ["line", "bar", "grouped-bar", "stacked-bar", "combo", "combo-dual-axis"]) {
		assert.ok(r.warning.includes(t), `${t} missing from the supported list`);
	}
});

test("a good type, or none at all, produces no notice", () => {
	for (const [name, attrs] of CHART_SHAPES) {
		const r = buildChartFromTag({
			manifest,
			rows,
			attributes: { ...base, ...attrs, granularity: "month" },
		});
		assert.equal(r.warning, undefined, name);
	}
	// omitting type is the documented default, not a mistake
	const bare = buildChartFromTag({
		manifest,
		rows,
		attributes: { ...base, series: "Total,Split", granularity: "month" },
	});
	assert.equal(bare.warning, undefined);
});

test("a type notice does not swallow the dataset's own warning", () => {
	const r = buildChartFromInline({
		attributes: { x: "month", series: "a,b", type: "sunburst" },
		csv: "month,a,b\n2025-01,1,2\n2025-02,3,4",
	});
	assert.match(r.warning, /Unknown chart type "sunburst"/);
	assert.equal(r.chartType, "Line");
});

test("the tooltip reads at the same size as the value labels", () => {
	// the tooltip is a DOM element, and its 12px default is written as an inline
	// style, so a rule in styles.css could not win without !important — the engine's
	// css option merges into that same inline sheet instead
	for (const [name, attrs] of CHART_SHAPES) {
		const built = buildChartFromTag({
			manifest,
			rows,
			attributes: { ...base, ...attrs, granularity: "month" },
		});
		const css = built.config.interaction?.tooltip?.css;
		assert.equal(css[".g2-tooltip"]["font-size"], "14px", name);
		for (const layer of labelTextStyle(false)) {
			assert.equal(`${layer.fontSize}px`, css[".g2-tooltip"]["font-size"], name);
		}
	}
});

test("no chart carries a view-level labelTransform, because it can never run", () => {
	// It used to, and it never ran once: plots pushes a top-level labelTransform
	// into every mark and drops it from the top (it is not in VIEW_OPTIONS), while
	// G2 reads the key only off the view node. The old test asserted the key was on
	// the config object — the shape was right and the effect was zero.
	// It was also a time bomb: value labels are drawn as two exactly coincident
	// layers (halo + glyph) and overlapHide is first-come-first-served, so the glyph
	// layer — always second — would have been hidden on every label, leaving only
	// backdrop-coloured halos. The numbers would have vanished the day it worked.
	for (const [name, attrs] of CHART_SHAPES) {
		const built = buildChartFromTag({
			manifest,
			rows,
			attributes: { ...base, ...attrs, labels: "all", granularity: "month" },
		});
		assert.equal(built.config.labelTransform, undefined, `${name}: config`);
		const spec = asEngineSees(built);
		// and nothing downstream reinstates one
		assert.equal(spec.labelTransform, undefined, `${name}: view level`);
		for (const mark of marksOf(spec)) {
			assert.equal(mark.labelTransform, undefined, `${name}/${mark.type}: mark level`);
		}
	}
});

test("the transforms we do write survive down to the mark that reads them", () => {
	// label.transform is the group-level chain and G2 reads it off the mark, so this
	// is the layer that has to still hold it after plots has rewritten the config.
	const built = buildChartFromTag({
		manifest,
		rows,
		attributes: {
			...base,
			type: "combo",
			bars: "Split",
			lines: "Total",
			labels: "all",
			granularity: "month",
		},
	});
	const spec = asEngineSees(built);
	const labelled = marksOf(spec).filter((mark) => mark.labels?.length);
	assert.equal(labelled.length, 2, "bar and line both keep their labels");
	for (const mark of labelled) {
		// Task 0 那个坑正是「配置下发到了错误的层级，而测试只看配置对象上有没有这个
		// 键」。这里断言链条确实活到了引擎真正读它的那一层。
		assert.deepEqual(
			mark.labels[0].transform.map((t) => t.type),
			["overlapHide"],
			mark.type,
		);
		// 分级回调也必须一路活到这里，否则 priority 读不到 rank，四级形同虚设
		assert.equal(typeof mark.labels[0].mosaicLabelRank, "function", mark.type);
	}
});

test("every chart rounds its axis top onto a labelled tick", () => {
	// both Column and DualAxes ship nice: true in their own defaults, so every path
	// has to state its choice rather than inherit one
	for (const [name, attrs] of CHART_SHAPES) {
		const built = buildChartFromTag({
			manifest,
			rows,
			attributes: { ...base, ...attrs, granularity: "month" },
		});
		const scales = built.config.children
			? built.config.children.filter((child) => child.scale?.y).map((c) => c.scale.y)
			: [built.config.scale.y];
		assert.ok(scales.length > 0, `${name}: no y scale found`);
		for (const scale of scales) assert.equal(scale.nice, true, name);
	}
});

test("headroom plus unrounded ticks would leave a dual axis nearly bare", () => {
	// this is why the dual axis rounds too. Its domain has no zero floor, so the 8%
	// headroom lands the top on an unround number, the optimiser answers with a
	// coarser step, and the two ticks that fall outside the domain get dropped.
	const raw = [42000, 64500 * 1.08]; // the demo dataset's revenue axis
	const bare = wilkinsonExtended(...raw, 5).filter((t) => t >= raw[0] && t <= raw[1]);
	assert.equal(bare.length, 2, "the premise of this test no longer holds");
	const rounded = new Linear({ domain: raw, tickCount: 5, nice: true, tickMethod: wilkinsonExtended });
	const [lo, hi] = rounded.getOptions().domain;
	assert.equal(wilkinsonExtended(lo, hi, 5).filter((t) => t >= lo && t <= hi).length, 4);
});

test("every chart with bars carries a hover band shell the theme can paint", () => {
	// the engine's own band is a hardcoded #CCD6EC @0.3 that reads blue-grey on light
	// and far too bright on dark; ours has to be reachable from withTheme()
	const banded = ["bar", "grouped-bar", "stacked-bar", "combo", "combo-dual-axis"];
	for (const [name, attrs] of CHART_SHAPES) {
		const built = buildChartFromTag({
			manifest,
			rows,
			attributes: { ...base, ...attrs, granularity: "month" },
		});
		if (!banded.includes(name)) {
			assert.equal(built.config.state, undefined, `${name}: no bars, no band`);
			continue;
		}
		const painted = applyHoverBandStyle(built.config, hoverBandStyle(false));
		assert.equal(painted.length, 1, `${name}: the shell sits on the view`);
		const { active } = built.config.state;
		assert.equal(active.backgroundFill, "#000000", name);
		assert.equal(active.backgroundFillOpacity, 0.05, name);
		// the band has to appear on entering the column, not only on hitting the bar
		assert.equal(built.config.interaction.elementHighlight.region, true, name);
		assert.equal(built.config.interaction.elementHighlight.background, true, name);
	}
});

test("the combo turns the crosshair off and switches its hover band on", () => {
	// DualAxes ships no interaction field at all, so the combo never had a band;
	// and a single line mark flips the whole view into seriesTooltip, because the
	// check is a .some() — which is why the band read as a bare vertical rule
	for (const name of ["combo", "combo-dual-axis"]) {
		const [, attrs] = CHART_SHAPES.find(([shape]) => shape === name);
		const built = buildChartFromTag({
			manifest,
			rows,
			attributes: { ...base, ...attrs, granularity: "month" },
		});
		const { interaction } = built.config;
		assert.equal(interaction.tooltip.crosshairs, false, name);
		assert.equal(interaction.tooltip.shared, true, name);
		assert.deepEqual(interaction.elementHighlight, { background: true, region: true }, name);
	}
});

test("the hover band picks a different colour per theme", () => {
	const light = hoverBandStyle(false);
	const dark = hoverBandStyle(true);
	assert.equal(light.backgroundFill, "#000000");
	assert.equal(dark.backgroundFill, "#FFFFFF");
	assert.notEqual(light.backgroundFill, dark.backgroundFill);
	for (const style of [light, dark]) {
		// a pure black or white keeps the engine default's blue cast out of it
		assert.match(style.backgroundFill, /^#(000000|FFFFFF)$/);
		// below 0.03 the band disappears on low-contrast panels; above 0.07 it reads
		// as a plate rather than a wash
		assert.ok(style.backgroundFillOpacity >= 0.03, `${style.backgroundFillOpacity} vanishes`);
		assert.ok(style.backgroundFillOpacity <= 0.07, `${style.backgroundFillOpacity} is a plate`);
	}
});

test("only the line chart carries a crosshair, at the same weight as its line", () => {
	for (const [name, attrs] of CHART_SHAPES) {
		const built = buildChartFromTag({
			manifest,
			rows,
			attributes: { ...base, ...attrs, granularity: "month" },
		});
		const tooltip = built.config.interaction?.tooltip;
		if (name !== "line") {
			// interval marks never declare crosshairs and combo turns them off, so a
			// crosshair width there would be config that can never take effect
			assert.equal(tooltip?.crosshairsLineWidth, undefined, `${name}: inert config`);
			continue;
		}
		// one step lighter than the data line (3): it is a guide, it should not read
		// as heavy as the data
		assert.equal(tooltip.crosshairsLineWidth, 2, name);
		assert.ok(tooltip.crosshairsLineWidth < built.config.style.lineWidth, name);
		// a thicker rule is a wider hit target, and unlike the marker the crosshair
		// Line does not opt out of pointer events on its own
		assert.equal(tooltip.crosshairsPointerEvents, "none", name);
		// subObject(style, 'crosshairs') mangles crosshairsXxx into an xXxx key
		for (const key of Object.keys(tooltip)) {
			assert.doesNotMatch(key, /^crosshairs[XY]/, `${key} would be shredded`);
		}
		const painted = applyCrosshairStyle(built.config, crosshairStyle(true));
		assert.equal(painted.crosshairsStroke, "#FFFFFF", name);
	}
});

test("the crosshair picks a different colour per theme", () => {
	// the engine default of #1b1e23 @0.5 is all but invisible over a dark page
	assert.equal(crosshairStyle(false).crosshairsStroke, "#000000");
	assert.equal(crosshairStyle(true).crosshairsStroke, "#FFFFFF");
});

// Everything below is about the second half of highlight=: the mark drawn in the plot
// area. Bolding alone tested too weak in the hand, so a named period also gets a mark
// behind the data — and which mark depends on the x scale:
//   band scale (every chart with bars) -> a rangeX stripe filling the whole slot
//   point scale (the line chart)       -> a lineX rule standing on the point
// Both are declared as top-level annotations; these assertions land on the spec the
// engine receives, because the whole point is that the mark reaches G2 with nothing of
// the data mapping attached.
const RULE_TYPES = { line: "lineX" };
const markerTypeFor = (name) => RULE_TYPES[name] ?? "rangeX";
const markersOf = (built) =>
	marksOf(asEngineSees(built)).filter((m) => m.type === "rangeX" || m.type === "lineX");
const withHighlight = (attrs, highlight) =>
	buildChartFromTag({
		manifest,
		rows,
		attributes: { ...base, ...attrs, labels: "all", highlight, granularity: "month" },
	});

test("highlight= marks each named period once, under the data", () => {
	for (const [name, attrs] of CHART_SHAPES) {
		const built = withHighlight(attrs, "2026-01, 2026-03");
		// one adaptor pass only: asEngineSees rewrites the config in place, so a second
		// call would hand back different objects and break the identity check below
		const spec = asEngineSees(built);
		const markers = marksOf(spec).filter((m) => m.type === "rangeX" || m.type === "lineX");
		// one mark for the whole view, not one per data mark: the combo has three
		// children and still gets a single marker layer
		assert.equal(markers.length, 1, `${name}: expected exactly one marker mark`);
		const [marker] = markers;
		assert.equal(marker.type, markerTypeFor(name), `${name}: wrong mark for this x scale`);
		assert.deepEqual(
			marker.data,
			[{ period: "2026-01" }, { period: "2026-03" }],
			`${name}: marker data`,
		);
		if (marker.type === "rangeX") {
			// x1 is not optional for rangeX: AbstractRange destructures value.x AND
			// value.x1, and MaybeDefaultX only fills x1 in for array-shaped data. Same
			// field on both channels is what makes the stripe exactly one column wide,
			// because range.ts adds scale.getBandWidth() to the x1 end.
			assert.deepEqual(marker.encode, { x: "period", x1: "period" }, `${name}: encode`);
		} else {
			// lineX declares only an x channel, so there is no second one to fill
			assert.deepEqual(marker.encode, { x: "period" }, `${name}: encode`);
		}
		// height comes for free either way: rangeX is AbstractRange({extendY: true}) and
		// lineX draws [x, 1] -> [x, 0]. Neither ever touches the y scale.
		assert.equal(marker.encode.y, undefined, `${name}: marker must not claim a y value`);
		// and it has to be under the data. G2 gives every mark its own main layer and
		// stamps style.zIndex = mark.zIndex ?? 0 on it (runtime/plot.js updateLayers),
		// so a negative zIndex is the only thing keeping the marker off the bars —
		// annotations are always appended to the end of children.
		assert.ok(marker.zIndex < 0, `${name}: marker zIndex was ${marker.zIndex}`);
		for (const mark of marksOf(spec)) {
			if (mark === marker) continue;
			assert.ok(
				(mark.zIndex ?? 0) > marker.zIndex,
				`${name}: ${mark.type} would be painted below the marker`,
			);
		}
	}
});

test("no highlight= means no marker mark at all", () => {
	for (const [name, attrs] of CHART_SHAPES) {
		const built = buildChartFromTag({
			manifest,
			rows,
			attributes: { ...base, ...attrs, labels: "all", granularity: "month" },
		});
		assert.equal(built.config.annotations, undefined, `${name}: nothing to annotate`);
		assert.equal(markersOf(built).length, 0, `${name}: drew a marker nobody asked for`);
	}
});

test("a period the data does not have never reaches the x scale", () => {
	// the marker shares the x scale with the data marks, so an unmatched period would
	// add a category to the scale and open an empty column in the chart
	const built = withHighlight({ type: "bar", series: "Total" }, "2026-02, 2029-12");
	const [marker] = markersOf(built);
	assert.deepEqual(marker.data, [{ period: "2026-02" }]);
	// the bold list is filtered by the same rule, so the two never disagree
	assert.equal(built.config.axis.x.labelFontWeight({ label: "2026-02" }), "bold");
	assert.equal(built.config.axis.x.labelFontWeight({ label: "2029-12" }), "normal");

	const none = withHighlight({ type: "bar", series: "Total" }, "2029-12");
	assert.equal(none.config.annotations, undefined, "no match, nothing to draw");
	assert.equal(none.config.axis.x, undefined, "no match, nothing to bold");
});

test("the marker stays out of the legend, the tooltip and the hover band", () => {
	// it is decoration: it must not colour a series, print a number, open a tooltip or
	// respond to the pointer. Checked for both mark types — lineX is a different mark
	// from rangeX and inherits none of rangeX's conclusions.
	const seen = new Set();
	for (const [name, attrs] of CHART_SHAPES) {
		const [marker] = markersOf(withHighlight(attrs, "2026-02"));
		seen.add(marker.type);
		// no colour channel means no entry in the colour scale the legend is built from
		assert.equal(marker.encode.color, undefined, `${name}: marker claims a colour`);
		assert.equal(marker.colorField, undefined, `${name}: marker claims a colour field`);
		// plots stamps tooltip: false on every annotation; without it the shared
		// tooltip would list the marker alongside the real series
		assert.equal(marker.tooltip, false, `${name}: marker is tooltipped`);
		// no value labels, and no hover-band shell to be painted by the theme
		assert.ok(!marker.labels?.length, `${name}: marker carries labels`);
		assert.equal(marker.state, undefined, `${name}: marker carries hover state`);
	}
	assert.deepEqual([...seen].sort(), ["lineX", "rangeX"], "both mark types were covered");
	// and the pointer can never land on either: elementHighlight in region mode only
	// ever considers these mark types, which is the list the engine itself ships
	const { VALID_FIND_BY_X_MARKS } = G2("interaction/utils.js");
	for (const type of ["rangeX", "lineX"]) {
		assert.ok(!VALID_FIND_BY_X_MARKS.includes(type), `${type} in ${VALID_FIND_BY_X_MARKS}`);
	}
});

test("the line chart gets a rule on the point, and its x scale is left alone", () => {
	// A line chart's x is a point scale, whose paddingInner is pinned to 1, so its band
	// width is exactly zero — a rangeX stripe there would collapse to nothing. That is
	// why the line chart gets a rule instead, and why its x scale needs no surgery.
	const domain = ["2026-01", "2026-02", "2026-03"];
	const point = new Point({ domain, range: [0, 1] });
	assert.equal(point.getBandWidth(), 0, "a stripe here would be zero pixels wide");
	assert.ok(
		new Band({ domain, range: [0, 1], paddingInner: 0.5, paddingOuter: 0.25 }).getBandWidth() > 0,
	);

	const built = withHighlight({ type: "line", series: "Total" }, "2026-02");
	const [marker] = markersOf(built);
	assert.equal(marker.type, "lineX");
	// the rule stands exactly on the data point. Both offsets are a multiple of the
	// band width, and the band width is zero here: lineX offsets by
	// bandOffset(0) * getBandWidth(), the line mark by getBandWidth() / 2.
	const at = point.map("2026-02");
	assert.equal(at + 0 * point.getBandWidth(), at, "lineX offset");
	assert.equal(at + point.getBandWidth() / 2, at, "line mark offset");
	// so nothing about the line chart's x has to move
	assert.equal(built.config.scale.x, undefined);
});

test("inline csv gets the same marker, keyed off its own x column", () => {
	// the inline path builds rows itself instead of going through queryDataset, so the
	// period the marker matches on comes from a different place than in a dataset chart
	const built = buildChartFromInline({
		attributes: { x: "month", type: "bar", series: "a", highlight: "2025-01, 2025-04" },
		csv: INLINE_CSV,
	});
	const spec = asEngineSees(built);
	const [marker] = marksOf(spec).filter((m) => m.type === "rangeX");
	assert.ok(marker, "inline chart drew no marker");
	// 2025-04 is not in the csv, so it is dropped rather than opening an empty column
	assert.deepEqual(marker.data, [{ period: "2025-01" }]);
	// and the value it matches on is the one the chart actually plots: a single-view
	// chart keeps its data on the view, the marker carries its own
	assert.ok(spec.data.some((d) => d.period === "2025-01"), "period must match the plotted key");

	// a line chart from inline data takes the rule, same split as the dataset path
	const line = buildChartFromInline({
		attributes: { x: "month", type: "line", series: "a", highlight: "2025-01" },
		csv: INLINE_CSV,
	});
	assert.equal(markersOf(line)[0].type, "lineX");
	assert.equal(line.config.scale.x, undefined);
});

test("the marker picks a different colour per theme, and it reaches the drawn mark", () => {
	const light = highlightMarkStyle(false);
	const dark = highlightMarkStyle(true);
	assert.equal(light.rangeX.fill, "#000000");
	assert.equal(dark.rangeX.fill, "#FFFFFF");
	assert.equal(light.lineX.stroke, "#000000");
	assert.equal(dark.lineX.stroke, "#FFFFFF");

	// the stripe is twice the hover band: that one is a wash you see only while the
	// pointer is there, this one is always on the chart and only-bold read as too faint
	assert.equal(light.rangeX.fillOpacity, 2 * hoverBandStyle(false).backgroundFillOpacity);
	// the rule is twice the stripe again: the same ink spread over a whole column reads
	// as nothing once it is squeezed into a two pixel line
	assert.equal(light.lineX.strokeOpacity, 2 * light.rangeX.fillOpacity);
	// still under the weight of the data, whose lines are 3px of saturated colour
	assert.ok(light.lineX.lineWidth < 3, "the rule must not match the data line");
	// and it must not be mistaken for the hover crosshair, which is also a 2px pure
	// black or white vertical line: the dash is what separates a standing annotation
	// from a pointer-driven readout, and the crosshair stays the louder of the two
	const crosshair = buildChartFromTag({
		manifest,
		rows,
		attributes: { ...base, type: "line", series: "Total", granularity: "month" },
	}).config.interaction.tooltip;
	assert.equal(light.lineX.lineWidth, crosshair.crosshairsLineWidth);
	assert.ok(light.lineX.strokeOpacity < crosshair.crosshairsStrokeOpacity);
	assert.ok(light.lineX.lineDash?.length > 0, "the rule has to be dashed");
	assert.equal(crosshair.crosshairsLineDash, undefined, "the crosshair is solid");
	// nothing else in the chart is dashed either: the grid was explicitly made solid
	assert.deepEqual(
		buildChartFromTag({
			manifest,
			rows,
			attributes: { ...base, type: "bar", series: "Total", granularity: "month" },
		}).config.axis.y.gridLineDash,
		[0, 0],
	);

	for (const [name, attrs] of CHART_SHAPES) {
		const built = withHighlight(attrs, "2026-02");
		// the config only ships an empty shell, exactly like the hover band: colour is
		// withTheme()'s job, which is what the mosaic:theme-change rebuild re-runs
		assert.deepEqual(built.config.annotations[0].style, {}, `${name}: colour leaked into build`);
		const painted = applyHighlightMarkStyle(built.config, dark);
		assert.equal(painted.length, 1, `${name}: one marker to paint`);
		const [drawn] = markersOf(built);
		assert.deepEqual(drawn.style, dark[drawn.type], name);
	}
	// nothing to paint is not an error — most charts carry no marker
	assert.deepEqual(applyHighlightMarkStyle({ children: [] }, dark), []);
});

const INLINE_CSV = "month,a,b\n2025-01,120,80\n2025-02,140,\n2025-03,160,95";

test("inline: builds a line chart from csv with defaults", () => {
	const built = buildChartFromInline({
		attributes: { title: "t", x: "month", series: "a,b" },
		csv: INLINE_CSV,
	});
	assert.equal(built.chartType, "Line"); // multi-series defaults to line
	assert.equal(built.footnote, undefined);
	assert.equal(built.granularity, "source");
	assert.deepEqual(built.availableGranularities, []);
	assert.equal(built.config.xField, "period");
	// empty cell → null breakpoint
	const feb = built.config.data.find(
		(d) => d.period === "2025-02" && d.series === "b",
	);
	assert.equal(feb.value, null);
	assert.equal(built.config.legend.color.position, "top");
});

test("inline: x defaults to the first csv column", () => {
	const built = buildChartFromInline({
		attributes: { series: "a" },
		csv: INLINE_CSV,
	});
	assert.equal(built.chartType, "Column");
	assert.ok(built.config.data.every((d) => typeof d.period === "string"));
});

test("inline: series defaults to all non-x columns", () => {
	const built = buildChartFromInline({ attributes: {}, csv: INLINE_CSV });
	const seriesNames = new Set(built.config.data.map((d) => d.series));
	assert.deepEqual([...seriesNames].sort(), ["a", "b"]);
});

test("inline: combo with bars and lines", () => {
	const built = buildChartFromInline({
		attributes: { type: "combo", x: "month", bars: "a", lines: "b" },
		csv: INLINE_CSV,
	});
	assert.equal(built.chartType, "DualAxes");
});

test("inline: percent unit formatter applies", () => {
	const built = buildChartFromInline({
		attributes: { x: "month", series: "a", unit: "%" },
		csv: INLINE_CSV,
	});
	assert.equal(built.config.axis.y.labelFormatter(12.5), "12.5%");
	assert.equal(built.config.label.formatter(12.5), "12.5%");
});

test("inline: rejects dataset-only attributes", () => {
	for (const key of ["dataset", "from", "to", "granularity", "granularityOptions"]) {
		assert.throws(
			() => buildChartFromInline({ attributes: { [key]: "x" }, csv: INLINE_CSV }),
			new RegExp(key),
		);
	}
});

test("inline: rejects non-numeric series values with row number", () => {
	assert.throws(
		() =>
			buildChartFromInline({
				attributes: { x: "month", series: "a" },
				csv: "month,a\n2025-01,abc",
			}),
		/row 2.*"a".*not a number/i,
	);
});

test("inline: rejects unknown declared columns", () => {
	assert.throws(
		() => buildChartFromInline({ attributes: { x: "month", series: "nope" }, csv: INLINE_CSV }),
		/no "nope" column/,
	);
});

test("inline: rejects csv without a data row", () => {
	assert.throws(() => buildChartFromInline({ attributes: {}, csv: "month,a" }), /header row and at least one data row/);
});

test("inline: rejects duplicate header columns", () => {
	assert.throws(() => buildChartFromInline({ attributes: {}, csv: "m,a,a\n1,2,3" }), /duplicate/i);
});
