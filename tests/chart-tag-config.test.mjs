import test from "node:test";
import assert from "node:assert/strict";
import {
	parseDatasetManifest,
	parseDatasetData,
} from "../src/dataset/dataset-loader.mjs";
import {
	buildChartFromTag,
	buildChartFromInline,
	parseGranularityOptions,
	formatChartNumber,
} from "../src/dataset/chart-tag-config.mjs";

const manifest = parseDatasetManifest(
	JSON.stringify({
		schemaVersion: 1,
		id: "t-monthly",
		title: "测试月度数据",
		data: "./t.csv",
		grain: ["AnchorDate"],
		primaryKey: ["AnchorDate"],
		time: { field: "AnchorDate", sourceGranularity: "month" },
		fields: [
			{ name: "AnchorDate", type: "date", required: true },
			{
				name: "总量",
				label: "总量指标",
				type: "integer",
				required: true,
				rollup: "avg",
			},
			{ name: "拆分", type: "integer", required: true, rollup: "sum" },
		],
	}),
);
const rows = parseDatasetData(
	manifest,
	"AnchorDate,总量,拆分\n2026-03-01,30,3\n2026-02-01,20,2\n2026-01-01,10,1\n",
);

const base = { x: "period", from: "2026-01-01", to: "2026-03-01" };

test("line: long-format data, labels from manifest, footnote from meta", () => {
	const r = buildChartFromTag({
		manifest,
		rows,
		attributes: {
			...base,
			type: "line",
			series: "总量,拆分",
			granularity: "month",
		},
	});
	assert.equal(r.chartType, "Line");
	assert.equal(r.config.data.length, 6); // 3 期 × 2 系列
	assert.equal(r.config.xField, "period");
	assert.equal(r.config.seriesField, "series");
	assert.equal(r.config.data[0].series, "总量指标"); // manifest label 生效
	assert.match(r.footnote, /测试月度数据/);
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
			series: "总量,拆分",
			granularity: "quarter",
		},
	});
	const byLabel = new Map(r.config.data.map((d) => [d.series, d.value]));
	assert.equal(byLabel.get("总量指标"), 20); // avg(10,20,30)
	assert.equal(byLabel.get("拆分"), 6); // sum(1,2,3)
});

test("grouped-bar maps to Column with isGroup", () => {
	const r = buildChartFromTag({
		manifest,
		rows,
		attributes: {
			...base,
			type: "grouped-bar",
			series: "总量,拆分",
			granularity: "month",
		},
	});
	assert.equal(r.chartType, "Column");
	assert.equal(r.config.isGroup, true);
});

test("combo pins both implicit axes to one scale", () => {
	const r = buildChartFromTag({
		manifest,
		rows,
		attributes: {
			...base,
			type: "combo",
			bars: "拆分",
			lines: "总量",
			granularity: "month",
		},
	});
	assert.equal(r.chartType, "DualAxes");
	assert.deepEqual(r.config.yField, ["barValue", "lineValue"]);
	assert.equal(r.config.yAxis.barValue.max, r.config.yAxis.lineValue.max);
	assert.equal(r.config.geometryOptions[0].geometry, "column");
	assert.equal(r.config.geometryOptions[1].geometry, "line");
});

test("combo-dual-axis keeps axes independent with unit titles", () => {
	const r = buildChartFromTag({
		manifest,
		rows,
		attributes: {
			...base,
			type: "combo-dual-axis",
			lines: "总量",
			bars: "拆分",
			leftUnit: "人",
			rightUnit: "%",
			granularity: "month",
		},
	});
	assert.equal(r.config.yAxis.barValue.max, 3 * 1.08); // 拆分 max=3 + 头部空间
	assert.equal(r.config.yAxis.lineValue.max, 30 * 1.08); // 总量 max=30 + 头部空间
	assert.equal(r.config.yAxis.barValue.title.text, "人");
	assert.equal(r.config.yAxis.lineValue.title.text, "%");
});

test("color overrides and defaults", () => {
	const r = buildChartFromTag({
		manifest,
		rows,
		attributes: {
			...base,
			type: "line",
			series: "总量,拆分",
			总量Color: "#112233",
			granularity: "month",
		},
	});
	assert.deepEqual(r.config.color, ["#112233", "#dc2626"]); // 覆盖第 1 个，第 2 个取默认色板第 2 色
});

test("combo default palette does not collide between bars and lines", () => {
	const r = buildChartFromTag({
		manifest,
		rows,
		attributes: {
			...base,
			type: "combo",
			bars: "拆分",
			lines: "总量",
			granularity: "month",
		},
	});
	assert.deepEqual(r.config.geometryOptions[0].color, ["#2563eb"]);
	assert.deepEqual(r.config.geometryOptions[1].color, ["#dc2626"]);
});

test("labels attribute toggles value labels", () => {
	const on = buildChartFromTag({
		manifest,
		rows,
		attributes: {
			...base,
			type: "line",
			series: "总量",
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
			series: "总量",
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
		attributes: { ...base, series: "总量,拆分", granularity: "month" },
	});
	const single = buildChartFromTag({
		manifest,
		rows,
		attributes: { ...base, series: "总量", granularity: "month" },
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
			series: "总量",
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

test("configs carry meta value formatters", () => {
	const line = buildChartFromTag({
		manifest,
		rows,
		attributes: {
			...base,
			type: "line",
			series: "总量",
			granularity: "month",
		},
	});
	assert.equal(typeof line.config.meta.value.formatter, "function");
	const combo = buildChartFromTag({
		manifest,
		rows,
		attributes: {
			...base,
			type: "combo",
			bars: "拆分",
			lines: "总量",
			granularity: "month",
		},
	});
	assert.equal(typeof combo.config.meta.barValue.formatter, "function");
	assert.equal(typeof combo.config.meta.lineValue.formatter, "function");
});

test("line charts render points", () => {
	const r = buildChartFromTag({
		manifest,
		rows,
		attributes: {
			...base,
			type: "line",
			series: "总量",
			granularity: "month",
		},
	});
	assert.deepEqual(r.config.point, {
		size: 3,
		shape: "circle",
		style: { lineWidth: 0 },
	});
});

test("combo respects tag writing order (lines first)", () => {
	const r = buildChartFromTag({
		manifest,
		rows,
		attributes: {
			...base,
			type: "combo",
			lines: "总量",
			bars: "拆分",
			granularity: "month",
		},
	});
	assert.deepEqual(r.config.yField, ["lineValue", "barValue"]);
	assert.equal(r.config.geometryOptions[0].geometry, "line");
	assert.deepEqual(r.config.geometryOptions[0].color, ["#2563eb"]);
	assert.deepEqual(r.config.geometryOptions[1].color, ["#dc2626"]);
	assert.equal(r.config.yAxis.lineValue.max, r.config.yAxis.barValue.max);
	assert.deepEqual(r.config.geometryOptions[0].point, {
		size: 3,
		shape: "circle",
		style: { lineWidth: 0 },
	});
});

test("legend markers are squares", () => {
	const line = buildChartFromTag({
		manifest,
		rows,
		attributes: { ...base, type: "line", series: "总量", granularity: "month" },
	});
	assert.deepEqual(line.config.legend, { marker: { symbol: "square" } });
	const combo = buildChartFromTag({
		manifest,
		rows,
		attributes: { ...base, type: "combo", bars: "拆分", lines: "总量", granularity: "month" },
	});
	assert.deepEqual(combo.config.legend, { marker: { symbol: "square" } });
});

test("percent unit suffixes formatted values", () => {
	const pct = buildChartFromTag({
		manifest,
		rows,
		attributes: {
			...base,
			type: "line",
			series: "总量",
			unit: "%",
			granularity: "month",
		},
	});
	assert.equal(pct.config.meta.value.formatter(2.6), "2.6%");
	assert.equal(pct.config.meta.value.formatter(null), "");
	const plain = buildChartFromTag({
		manifest,
		rows,
		attributes: {
			...base,
			type: "line",
			series: "总量",
			unit: "人",
			granularity: "month",
		},
	});
	assert.equal(plain.config.meta.value.formatter(1234.5), "1,234.5");
});

test("currency units prefix formatted values", () => {
	const yuan = buildChartFromTag({
		manifest,
		rows,
		attributes: {
			...base,
			type: "line",
			series: "总量",
			unit: "元",
			granularity: "month",
		},
	});
	assert.equal(yuan.config.meta.value.formatter(12), "¥ 12");
	assert.equal(yuan.config.meta.value.formatter(null), "");
	const usd = buildChartFromTag({
		manifest,
		rows,
		attributes: {
			...base,
			type: "line",
			series: "总量",
			unit: "美金",
			granularity: "month",
		},
	});
	assert.equal(usd.config.meta.value.formatter(1234.5), "$ 1,234.5");
});

test("combo labels get anti-overlap layout", () => {
	const r = buildChartFromTag({
		manifest,
		rows,
		attributes: {
			...base,
			type: "combo",
			bars: "拆分",
			lines: "总量",
			labels: "all",
			granularity: "month",
		},
	});
	for (const geo of r.config.geometryOptions) {
		assert.deepEqual(geo.label.layout, [
			{ type: "limit-in-plot" },
			{ type: "hide-overlap" },
			{ type: "limit-in-plot", cfg: { action: "hide" } },
		]);
	}
});

test("y axis gets headroom above the max value", () => {
	const line = buildChartFromTag({
		manifest,
		rows,
		attributes: {
			...base,
			type: "line",
			series: "总量,拆分",
			granularity: "month",
		},
	});
	assert.equal(line.config.yAxis.max, 30 * 1.08);
	const combo = buildChartFromTag({
		manifest,
		rows,
		attributes: {
			...base,
			type: "combo",
			bars: "拆分",
			lines: "总量",
			granularity: "month",
		},
	});
	assert.equal(combo.config.yAxis.barValue.max, 30 * 1.08);
	assert.equal(combo.config.yAxis.lineValue.max, 30 * 1.08);
	const stacked = buildChartFromTag({
		manifest,
		rows,
		attributes: {
			...base,
			type: "stacked-bar",
			series: "总量,拆分",
			granularity: "month",
		},
	});
	assert.equal(stacked.config.yAxis.max, 33 * 1.08); // 每期堆叠和的最大值 33
});

test("dual-axis percent suffix applies per side", () => {
	const r = buildChartFromTag({
		manifest,
		rows,
		attributes: {
			...base,
			type: "combo-dual-axis",
			bars: "拆分",
			lines: "总量",
			leftUnit: "人",
			rightUnit: "%",
			granularity: "month",
		},
	});
	assert.equal(r.config.meta.barValue.formatter(1000), "1,000");
	assert.equal(r.config.meta.lineValue.formatter(2.6), "2.6%");
});

const INLINE_CSV = "month,a,b\n2025-01,120,80\n2025-02,140,\n2025-03,160,95";

test("inline: builds a line chart from csv with defaults", () => {
	const built = buildChartFromInline({
		attributes: { title: "t", x: "month", series: "a,b" },
		csv: INLINE_CSV,
	});
	assert.equal(built.chartType, "Line"); // 多系列缺省 line
	assert.equal(built.footnote, undefined);
	assert.equal(built.granularity, "source");
	assert.deepEqual(built.availableGranularities, []);
	assert.equal(built.config.xField, "period");
	// 空单元格 → null 断点
	const feb = built.config.data.find(
		(d) => d.period === "2025-02" && d.series === "b",
	);
	assert.equal(feb.value, null);
	assert.deepEqual(built.config.legend, { marker: { symbol: "square" } });
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
	assert.equal(built.config.meta.value.formatter(12.5), "12.5%");
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
