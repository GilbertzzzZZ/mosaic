import test from "node:test";
import assert from "node:assert/strict";
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
} from "../src/render/chart-tag-config.mjs";

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

test("combo-dual-axis keeps axes independent with unit titles", () => {
	const r = buildChartFromTag({
		manifest,
		rows,
		attributes: {
			...base,
			type: "combo-dual-axis",
			lines: "Total",
			bars: "Split",
			leftUnit: "people",
			rightUnit: "%",
			granularity: "month",
		},
	});
	const [barChild, lineChild] = r.config.children;
	assert.equal(barChild.scale.y.domainMax, 3 * 1.08); // Split max=3 + headroom
	assert.equal(lineChild.scale.y.domainMax, 30 * 1.08); // Total max=30 + headroom
	assert.equal(barChild.axis.y.title, "people");
	assert.equal(lineChild.axis.y.title, "%");
	assert.equal(lineChild.axis.y.position, "right"); // the second axis has to be moved off the left edge
	assert.notEqual(barChild.scale.y.key, lineChild.scale.y.key); // separate scale groups keep the two axes apart
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
	assert.equal(typeof lineChild.axis.y.labelFormatter, "function");
	assert.equal(typeof lineChild.label.formatter, "function");
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

test("legend markers are squares", () => {
	const line = buildChartFromTag({
		manifest,
		rows,
		attributes: { ...base, type: "line", series: "Total", granularity: "month" },
	});
	assert.deepEqual(line.config.legend, { color: { itemMarker: "square" } });
	const combo = buildChartFromTag({
		manifest,
		rows,
		attributes: { ...base, type: "combo", bars: "Split", lines: "Total", granularity: "month" },
	});
	assert.deepEqual(combo.config.legend, { color: { itemMarker: "square" } });
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

test("labels get anti-overlap transforms", () => {
	const expected = [
		{ type: "exceedAdjust", bounds: "main" },
		{ type: "overlapHide" },
	];
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
	assert.deepEqual(line.config.label.transform, expected);
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
		assert.deepEqual(child.label.transform, expected);
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
	const shapeOf = ({ text, formatter, ...rest }) => rest;
	const seen = [];
	for (const [name, attrs] of [
		["line", { type: "line", series: "Total,Split" }],
		["bar", { type: "bar", series: "Total" }],
		["grouped-bar", { type: "grouped-bar", series: "Total,Split" }],
		["stacked-bar", { type: "stacked-bar", series: "Total,Split" }],
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
				seen.push([`${name}/${mark.type ?? "view"}#${i}`, shapeOf(layer)]);
			});
		}
	}
	assert.ok(seen.length >= 16, `only ${seen.length} label layers found`);
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
		const of = () =>
			buildChartFromTag({
				manifest,
				rows,
				attributes: { ...base, ...attrs, labels: "all", granularity: "month" },
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
				attributes: { ...base, ...attrs, labels: "all" },
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

test("lines are drawn at the pre-upgrade width across every chart that has one", () => {
	// the v5 theme halves the v4 default of 2, which left the line a hairline
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
		assert.equal(line.style.lineWidth, 2, name);
		// the dots keep the radius they had before the upgrade; the style that thickens
		// the line must not leak into them
		const point = built.config.children
			? built.config.children.find((child) => child.type === "point")
			: built.config.point;
		assert.equal(point.style.r, 3, `${name}: point radius`);
		assert.equal(point.style.lineWidth, 0, `${name}: point outline`);
	}
});

test("value labels sit above the mark instead of inside it", () => {
	const above = { textAlign: "center", textBaseline: "bottom", dy: -4 };
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
	for (const [key, value] of Object.entries(above)) {
		assert.equal(line.config.label[key], value);
	}
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
		for (const [key, value] of Object.entries(above)) {
			assert.equal(child.label[key], value);
		}
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
	// 3.2%–4.428% is its right axis: a 0.25 step, which a 1/2/5-only step set cannot reach
	assert.deepEqual(axis.tickMethod(3.2, 4.428, 5), [3.25, 3.5, 3.75, 4, 4.25]);
	assert.deepEqual(axis.tickMethod(5, 5, 5), [5]); // flat data still yields one tick
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
	assert.equal(line.config.scale.y.nice, false); // nice would round the headroom away
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
	assert.deepEqual(built.config.legend, { color: { itemMarker: "square" } });
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
