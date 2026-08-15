import { queryDataset } from "../parse/dataset-query.mjs";
import {
	DATASET_GRANULARITIES,
	isDatasetGranularity,
} from "../parse/dataset-granularity.mjs";
import { parseDelimitedRecords } from "../parse/delimited-data.mjs";

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
// 折线数据点：实心圆、半径 3、无描边。半径走 style.r——mark 上的 size 不是
// G2 v5 的配置项；shapeField 选实心圆，point mark 的默认形状是空心的。
const LINE_POINT = { shapeField: "circle", style: { r: 3, lineWidth: 0 } };
// 图例标记统一为方块（默认时折线是短线、柱状是方块，混图不统一）。
const LEGEND = { color: { itemMarker: "square" } };
// 数值标签防碰撞：先把越界标签平移回绘图区（首尾数据点贴着边缘，缺这步会被
// 下一步整个隐藏），再隐藏仍然重叠的。
const LABEL_TRANSFORM = [
	{ type: "exceedAdjust", bounds: "main" },
	{ type: "overlapHide" },
];

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

// 给了 domainMax 就必须关掉 nice：nice 会把域再往上取整到刻度边界，
// 8% 头部空间会被撑成一段不确定的留白，刻度也跟着变。
function yScale({ key, domainMin, domainMax }) {
	const scale = {};
	if (key !== undefined) {
		scale.key = key;
		// DualAxes 默认把每个 child 的 y 设成 independent，独立后 key 失效、
		// 每个 mark 各自成一套 scale；显式关掉才能按 key 分组共用。
		scale.independent = false;
	}
	if (domainMin !== undefined) scale.domainMin = domainMin;
	if (domainMax !== undefined) {
		scale.domainMax = domainMax;
		scale.nice = false;
	}
	return scale;
}

// 每个 mark 要拿到独立的 label 对象：plots 会就地把 yField 写进 label.text，
// 共用一个对象时后一个 mark 会沿用前一个的字段。
function valueLabel(field, formatter) {
	return { text: field, formatter, transform: LABEL_TRANSFORM };
}

// v5 的 scale 没有 formatter：轴刻度走 axis.labelFormatter，数值标签走
// label.formatter，tooltip 走 items 回调。回调不返回 name 时沿用系列名。
function valueTooltip(field, formatter) {
	return { items: [(datum) => ({ value: formatter(datum[field]) })] };
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

export function buildFootnote(meta) {
	return (
		`${meta.datasetTitle} · ${meta.from} → ${meta.to} · ${meta.granularity}` +
		` · ${meta.sourceRows}/${meta.totalRows} source rows · data through ${meta.dataThrough}`
	);
}

function buildWarning(meta) {
	const parts = [];
	if (meta.partialPeriodCount > 0)
		parts.push(`Partial boundary periods: ${meta.partialPeriods.join(", ")}`);
	if (meta.omittedBoundaryPeriodCount > 0)
		parts.push(
			`Incomplete boundary periods omitted: ${meta.omittedBoundaryPeriods.join(", ")}`,
		);
	if (meta.missingPeriodCount > 0)
		parts.push(`${meta.missingPeriodCount} source periods missing within the range`);
	return parts.length ? parts.join("; ") : undefined;
}

function buildChartFromRows({ rows, attrs, attributes, xKey, common }) {
	const bars = splitList(attrs.bars ?? attrs.bar);
	const lines = splitList(attrs.lines ?? attrs.line);
	const explicit = splitList(attrs.series ?? attrs.y);
	let seriesKeys = explicit.length ? explicit : [...bars, ...lines];
	if (seriesKeys.length === 0) {
		seriesKeys = Object.keys(rows[0] ?? {}).filter((k) => k !== xKey);
	}
	const rawType = String(attrs.type ?? "")
		.trim()
		.toLowerCase();
	const type = CHART_TYPES.has(rawType)
		? rawType
		: seriesKeys.length > 1
			? "line"
			: "bar";
	const showLabels = labelsEnabled(attrs);

	if (type === "combo" || type === "combo-dual-axis") {
		let barKeys = bars,
			lineKeys = lines;
		if (barKeys.length === 0 && lineKeys.length === 0) {
			[barKeys, lineKeys] = [seriesKeys.slice(0, 1), seriesKeys.slice(1)]; // 早期内部实现 默认：首个为 bar，其余为 line
		}
		if (barKeys.length === 0 || lineKeys.length === 0) {
			throw new Error(
				`Chart type "${type}" needs both bar and line series (use bars= and lines=).`,
			);
		}
		const barLong = toLong(rows, xKey, barKeys, attrs, "barValue");
		const lineLong = toLong(rows, xKey, lineKeys, attrs, "lineValue");
		const dual = type === "combo-dual-axis";
		const leftUnit = String(attrs.leftUnit ?? attrs.unit ?? "");
		const rightUnit = String(attrs.rightUnit ?? "");
		const barFormatter = valueFormatterFor(dual ? leftUnit : attrs.unit);
		const lineFormatter = valueFormatterFor(dual ? rightUnit : attrs.unit);
		let barY, lineY;
		if (dual) {
			barY = yScale({
				key: "barY",
				domainMax: headroomMax(barLong.map((d) => d.barValue)),
			});
			lineY = yScale({
				key: "lineY",
				domainMax: headroomMax(lineLong.map((d) => d.lineValue)),
			});
		} else {
			// combo 两侧共用同一段值域，左右轴刻度因此互为镜像。
			const domainMax = headroomMax([
				...barLong.map((d) => d.barValue),
				...lineLong.map((d) => d.lineValue),
			]);
			barY = yScale({ key: "barY", domainMin: 0, domainMax });
			lineY = yScale({ key: "lineY", domainMin: 0, domainMax });
		}
		const barAxis = {
			y: {
				labelFormatter: barFormatter,
				...(dual && leftUnit ? { title: leftUnit } : {}),
			},
		};
		const lineAxis = {
			y: {
				position: "right",
				labelFormatter: lineFormatter,
				...(dual && rightUnit ? { title: rightUnit } : {}),
			},
		};
		const barChild = {
			type: "interval",
			data: barLong,
			yField: "barValue",
			colorField: "series",
			group: barKeys.length > 1,
			scale: { y: barY },
			axis: barAxis,
			label: showLabels ? valueLabel("barValue", barFormatter) : undefined,
			tooltip: valueTooltip("barValue", barFormatter),
		};
		const lineChild = {
			type: "line",
			data: lineLong,
			yField: "lineValue",
			colorField: "series",
			scale: { y: lineY },
			axis: lineAxis,
			label: showLabels ? valueLabel("lineValue", lineFormatter) : undefined,
			tooltip: valueTooltip("lineValue", lineFormatter),
		};
		// 数据点写成折线的兄弟 mark，而不是折线的 point 简写：简写生成的 mark
		// 不继承 data / scale，且总被追加到 children 末尾（会盖在柱子上）。
		// 它和折线共用同一段 y scale，因此必须给出同一份 axis——G2 按 scale 分组
		// 合并 guide，两份不一致时后写的会覆盖先写的。
		const pointChild = {
			...LINE_POINT,
			type: "point",
			data: lineLong,
			yField: "lineValue",
			colorField: "series",
			scale: { y: lineY },
			axis: lineAxis,
			tooltip: false,
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
		// 一张图只有一套 color scale，两个 mark 各给一份 range 会互相覆盖：
		// 配色按 children 的绘制顺序拼成一份，挂在顶层下发给全部 children。
		const range = linesFirst
			? [...colorsFor(attrs, lineKeys), ...colorsFor(attrs, barKeys, lineKeys.length)]
			: [...colorsFor(attrs, barKeys), ...colorsFor(attrs, lineKeys, barKeys.length)];
		return {
			...common,
			chartType: "DualAxes",
			config: {
				xField: "period",
				scale: { color: { range } },
				legend: LEGEND,
				children: linesFirst
					? [lineChild, pointChild, barChild]
					: [barChild, lineChild, pointChild],
			},
		};
	}

	const data = toLong(rows, xKey, seriesKeys, attrs);
	const unit = String(attrs.unit ?? "");
	const formatter = valueFormatterFor(unit);
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
		// colorField 而非 seriesField：v5 的 seriesField 只拆分系列不着色，也不出
		// 图例；分组 / 堆叠取不到 series 通道时会回落到 color 通道，够用。
		colorField: "series",
		scale: { color: { range: colorsFor(attrs, seriesKeys) }, y: yScale({ domainMax: yMax }) },
		label: showLabels ? valueLabel("value", formatter) : undefined,
		axis: { y: { labelFormatter: formatter, ...(unit ? { title: unit } : {}) } },
		tooltip: valueTooltip("value", formatter),
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
			config: { ...config, group: true },
		};
	if (type === "stacked-bar")
		return {
			...common,
			chartType: "Column",
			config: { ...config, stack: true },
		};
	return { ...common, chartType: "Column", config }; // "bar"
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
	const common = {
		footnote: buildFootnote(result.meta),
		warning: buildWarning(result.meta),
		granularity: result.meta.granularity,
		availableGranularities: result.meta.availableGranularities,
	};
	return buildChartFromRows({
		rows: result.rows,
		attrs: result.attributes,
		attributes,
		xKey: result.attributes.x,
		common,
	});
}

// 内联数据（代码块 CSV body / 成对标签 payload）出图：无 dataset 查询语义，
// 数据按书写顺序原样呈现；格式化/配色/头部空间/图例与 dataset 模式一致。
const DATASET_ONLY_ATTRS = ["dataset", "from", "to", "granularity", "granularityOptions"];

export function buildChartFromInline({ attributes = {}, csv }) {
	for (const key of DATASET_ONLY_ATTRS) {
		if (String(attributes[key] ?? "").trim() !== "") {
			throw new Error(
				`Inline data does not support the "${key}" attribute (dataset charts only).`,
			);
		}
	}
	const records = parseDelimitedRecords(csv);
	if (records.length < 2) {
		throw new Error("Inline CSV needs a header row and at least one data row.");
	}
	const [header, ...dataRecords] = records;
	const columns = header.map((h) => String(h).trim());
	if (new Set(columns).size !== columns.length) {
		throw new Error("Inline CSV header has duplicate column names.");
	}
	const xKey = String(attributes.x ?? columns[0]).trim();
	const declared = [
		attributes.series,
		attributes.y,
		attributes.bars,
		attributes.bar,
		attributes.lines,
		attributes.line,
	].flatMap(splitList);
	for (const name of [xKey, ...declared]) {
		if (!columns.includes(name)) {
			throw new Error(`Inline CSV has no "${name}" column.`);
		}
	}
	const rows = dataRecords.map((record, index) => {
		const row = {};
		columns.forEach((name, i) => {
			const cell = String(record[i] ?? "").trim();
			if (name === xKey) {
				row[name] = cell;
				return;
			}
			if (cell === "") {
				row[name] = null;
				return;
			}
			const n = Number(cell);
			if (!Number.isFinite(n)) {
				throw new Error(
					`Inline CSV row ${index + 2}: "${name}" value "${cell}" is not a number.`,
				);
			}
			row[name] = n;
		});
		return row;
	});
	return buildChartFromRows({
		rows,
		attrs: attributes,
		attributes,
		xKey,
		common: {
			footnote: undefined,
			warning: undefined,
			granularity: "source",
			availableGranularities: [],
		},
	});
}
