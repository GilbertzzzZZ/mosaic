import { queryDataset } from "./dataset-query.mjs";
import {
	DATASET_GRANULARITIES,
	isDatasetGranularity,
} from "./dataset-granularity.mjs";

const CHART_COLORS = [
	"#2563eb",
	"#dc2626",
	"#16a34a",
	"#d97706",
	"#7c3aed",
	"#0891b2",
];
const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const LABELS_OFF = new Set([
	"0",
	"false",
	"hide",
	"hidden",
	"no",
	"none",
	"off",
]);
const CHART_TYPES = new Set([
	"line",
	"bar",
	"grouped-bar",
	"stacked-bar",
	"combo",
	"combo-dual-axis",
]);
const CHART_NUMBER_FORMAT = new Intl.NumberFormat("en-US", {
	maximumFractionDigits: 2,
});
const LINE_POINT = { size: 3, shape: "circle", style: { lineWidth: 0 } };
// 图例标记统一为圆点（默认时折线是短线、柱状是方块，混图不统一）。
const LEGEND = { marker: { symbol: "square" } };

export function formatChartNumber(value) {
	if (value == null || !Number.isFinite(value)) return "";
	return CHART_NUMBER_FORMAT.format(value);
}

const CURRENCY_PREFIXES = new Map([
	["元", "¥"],
	["¥", "¥"],
	["cny", "¥"],
	["rmb", "¥"],
	["人民币", "¥"],
	["$", "$"],
	["usd", "$"],
	["美元", "$"],
	["美金", "$"],
]);

// unit="%" 时数值带后缀，货币单位带前缀符号；其余单位仍只画在轴标题上。
function valueFormatterFor(unit) {
	const u = String(unit ?? "").trim();
	if (u === "%") {
		return (value) => {
			const s = formatChartNumber(value);
			return s === "" ? s : `${s}%`;
		};
	}
	const prefix = CURRENCY_PREFIXES.get(u.toLowerCase());
	if (prefix) {
		return (value) => {
			const s = formatChartNumber(value);
			return s === "" ? s : `${prefix} ${s}`;
		};
	}
	return formatChartNumber;
}

// Y 轴上限加 8% 头部空间，避免最大值点贴顶、数值标签被挤压。
const Y_HEADROOM = 1.08;

function headroomMax(values) {
	const finite = values.filter((v) => Number.isFinite(v));
	if (finite.length === 0) return undefined;
	const max = Math.max(...finite);
	return max > 0 ? max * Y_HEADROOM : undefined;
}

function splitList(value) {
	return String(value ?? "")
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
}

export function parseGranularityOptions(attributes) {
	const raw = splitList(attributes.granularityOptions).map((g) =>
		g.toLowerCase(),
	);
	if (raw.length === 0) return [...DATASET_GRANULARITIES];
	for (const g of raw) {
		if (!isDatasetGranularity(g))
			throw new Error(`Unknown granularity "${g}" in granularityOptions.`);
	}
	return raw;
}

function labelsEnabled(attributes) {
	const v = String(attributes.labels ?? "")
		.trim()
		.toLowerCase();
	return !LABELS_OFF.has(v);
}

function labelFor(attributes, key) {
	return attributes[`${key}Label`] || key;
}

function colorsFor(attributes, keys, offset = 0) {
	return keys.map((key, i) => {
		const v = String(attributes[`${key}Color`] ?? "").trim();
		return HEX_COLOR.test(v)
			? v
			: CHART_COLORS[(offset + i) % CHART_COLORS.length];
	});
}

function toLong(rows, xKey, keys, attributes, valueField = "value") {
	const out = [];
	for (const row of rows) {
		for (const key of keys) {
			out.push({
				period: String(row[xKey]),
				series: labelFor(attributes, key),
				[valueField]: row[key] == null ? null : Number(row[key]),
			});
		}
	}
	return out;
}

function buildFootnote(meta) {
	return (
		`${meta.datasetTitle} · ${meta.from} → ${meta.to} · ${meta.granularity}` +
		` · ${meta.sourceRows}/${meta.totalRows} source rows · data through ${meta.dataThrough}`
	);
}

function buildWarning(meta) {
	const parts = [];
	if (meta.partialPeriodCount > 0)
		parts.push(`边界周期不完整：${meta.partialPeriods.join("、")}`);
	if (meta.omittedBoundaryPeriodCount > 0)
		parts.push(
			`不完整边界周期已省略：${meta.omittedBoundaryPeriods.join("、")}`,
		);
	if (meta.missingPeriodCount > 0)
		parts.push(`区间内缺失 ${meta.missingPeriodCount} 个源周期`);
	return parts.length ? parts.join("；") : undefined;
}

export function buildChartFromTag({
	manifest,
	rows,
	attributes,
	granularity,
}) {
	const granularityOptions = parseGranularityOptions(attributes);
	const requested = String(granularity ?? attributes.granularity ?? "auto")
		.trim()
		.toLowerCase();
	if (requested !== "auto" && !granularityOptions.includes(requested)) {
		throw new Error(
			`Granularity "${requested}" is not in granularityOptions (${granularityOptions.join(",")}).`,
		);
	}
	const result = queryDataset({
		manifest,
		rows,
		component: "Chart",
		attributes,
		granularity: requested,
		granularityOptions,
	});
	const attrs = result.attributes;
	const xKey = attrs.x;
	const bars = splitList(attrs.bars ?? attrs.bar);
	const lines = splitList(attrs.lines ?? attrs.line);
	const explicit = splitList(attrs.series ?? attrs.y);
	let seriesKeys = explicit.length ? explicit : [...bars, ...lines];
	if (seriesKeys.length === 0) {
		seriesKeys = Object.keys(result.rows[0] ?? {}).filter((k) => k !== xKey);
	}
	const rawType = String(attrs.type ?? "")
		.trim()
		.toLowerCase();
	const type = CHART_TYPES.has(rawType)
		? rawType
		: seriesKeys.length > 1
			? "line"
			: "bar";
	const label = labelsEnabled(attrs) ? {} : undefined;
	const common = {
		footnote: buildFootnote(result.meta),
		warning: buildWarning(result.meta),
		granularity: result.meta.granularity,
		availableGranularities: result.meta.availableGranularities,
	};

	if (type === "combo" || type === "combo-dual-axis") {
		let barKeys = bars,
			lineKeys = lines;
		if (barKeys.length === 0 && lineKeys.length === 0) {
			[barKeys, lineKeys] = [seriesKeys.slice(0, 1), seriesKeys.slice(1)]; // 上游默认：首个为 bar，其余为 line
		}
		if (barKeys.length === 0 || lineKeys.length === 0) {
			throw new Error(
				`Chart type "${type}" needs both bar and line series (use bars= and lines=).`,
			);
		}
		const barLong = toLong(result.rows, xKey, barKeys, attrs, "barValue");
		const lineLong = toLong(result.rows, xKey, lineKeys, attrs, "lineValue");
		const dual = type === "combo-dual-axis";
		const leftUnit = String(attrs.leftUnit ?? attrs.unit ?? "");
		const rightUnit = String(attrs.rightUnit ?? "");
		const comboMeta = dual
			? {
					barValue: { formatter: valueFormatterFor(leftUnit) },
					lineValue: { formatter: valueFormatterFor(rightUnit) },
				}
			: {
					barValue: { formatter: valueFormatterFor(attrs.unit) },
					lineValue: { formatter: valueFormatterFor(attrs.unit) },
				};
		let yAxis;
		if (dual) {
			yAxis = {
				barValue: {
					max: headroomMax(barLong.map((d) => d.barValue)),
					...(leftUnit ? { title: { text: leftUnit } } : {}),
				},
				lineValue: {
					max: headroomMax(lineLong.map((d) => d.lineValue)),
					...(rightUnit ? { title: { text: rightUnit } } : {}),
				},
			};
		} else {
			const max = headroomMax([
				...barLong.map((d) => d.barValue),
				...lineLong.map((d) => d.lineValue),
			]);
			yAxis = { barValue: { min: 0, max }, lineValue: { min: 0, max } };
		}
		// DualAxes 的 adaptor 不带任何默认 label layout（Line/Column 单图有），
		// 显式补上防碰撞：放得下就显示，放不下就隐藏，与单图语义一致。
		const comboLabel = label
			? {
					...label,
					layout: [
						{ type: "hide-overlap" },
						{ type: "limit-in-plot", cfg: { action: "hide" } },
					],
				}
			: undefined;
		const barGeometry = {
			geometry: "column",
			isGroup: barKeys.length > 1,
			seriesField: "series",
			label: comboLabel,
		};
		const lineGeometry = {
			geometry: "line",
			seriesField: "series",
			point: LINE_POINT,
			label: comboLabel,
		};
		// combo（单轴）图例顺序跟随标签书写顺序；combo-dual-axis 固定 bars=左轴。
		const attrKeys = Object.keys(attributes);
		const linesFirst =
			!dual &&
			(() => {
				const lineIdx = attrKeys.findIndex(
					(k) => k === "lines" || k === "line",
				);
				const barIdx = attrKeys.findIndex((k) => k === "bars" || k === "bar");
				return lineIdx !== -1 && barIdx !== -1 && lineIdx < barIdx;
			})();
		if (linesFirst) {
			lineGeometry.color = colorsFor(attrs, lineKeys);
			barGeometry.color = colorsFor(attrs, barKeys, lineKeys.length);
			return {
				...common,
				chartType: "DualAxes",
				config: {
					data: [lineLong, barLong],
					xField: "period",
					yField: ["lineValue", "barValue"],
					yAxis,
					meta: comboMeta,
					legend: LEGEND,
					geometryOptions: [lineGeometry, barGeometry],
				},
			};
		}
		barGeometry.color = colorsFor(attrs, barKeys);
		lineGeometry.color = colorsFor(attrs, lineKeys, barKeys.length);
		return {
			...common,
			chartType: "DualAxes",
			config: {
				data: [barLong, lineLong],
				xField: "period",
				yField: ["barValue", "lineValue"],
				yAxis,
				meta: comboMeta,
				legend: LEGEND,
				geometryOptions: [barGeometry, lineGeometry],
			},
		};
	}

	const data = toLong(result.rows, xKey, seriesKeys, attrs);
	const unit = String(attrs.unit ?? "");
	// stacked-bar 的视觉上限是每期堆叠和，其余按单值最大。
	const yMax =
		type === "stacked-bar"
			? headroomMax(
					[
						...data
							.reduce((m, d) => {
								if (Number.isFinite(d.value))
									m.set(d.period, (m.get(d.period) ?? 0) + d.value);
								return m;
							}, new Map())
							.values(),
					],
				)
			: headroomMax(data.map((d) => d.value));
	const config = {
		data,
		xField: "period",
		yField: "value",
		seriesField: "series",
		color: colorsFor(attrs, seriesKeys),
		label,
		yAxis: { max: yMax, ...(unit ? { title: { text: unit } } : {}) },
		meta: { value: { formatter: valueFormatterFor(unit) } },
		legend: LEGEND,
	};
	if (type === "line")
		return {
			...common,
			chartType: "Line",
			config: { ...config, point: LINE_POINT },
		};
	if (type === "grouped-bar")
		return {
			...common,
			chartType: "Column",
			config: { ...config, isGroup: true },
		};
	if (type === "stacked-bar")
		return {
			...common,
			chartType: "Column",
			config: { ...config, isStack: true },
		};
	return { ...common, chartType: "Column", config }; // "bar"
}
