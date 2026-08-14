// chartview 代码块源文本解析：`---` frontmatter 属性区（flat key: value）+ 可选内联 CSV。
// 属性契约与 <Chart /> 标签一字不差；这里只负责切分与取值，不做语义校验。

export function parseChartBlock(source) {
	const lines = String(source ?? "").split("\n");
	let i = 0;
	while (i < lines.length && lines[i].trim() === "") i += 1;
	if ((lines[i] ?? "").trim() !== "---") {
		throw new Error(
			'chartview block must start with a "---" attribute section (see docs/chart.md).',
		);
	}
	let end = -1;
	for (let j = i + 1; j < lines.length; j += 1) {
		if (lines[j].trim() === "---") {
			end = j;
			break;
		}
	}
	if (end === -1) {
		throw new Error('chartview attribute section is missing its closing "---".');
	}
	const attributes = parseAttributeLines(lines.slice(i + 1, end));
	const body = lines
		.slice(end + 1)
		.join("\n")
		.trim();
	return { attributes, csv: body.length > 0 ? body : null };
}

function parseAttributeLines(attrLines) {
	const attributes = {};
	for (const raw of attrLines) {
		const line = raw.trim();
		if (line === "" || line.startsWith("#")) continue;
		if (/^\s/.test(raw)) {
			throw new Error(
				`Attribute lines must not be indented (flat key: value only): "${line}"`,
			);
		}
		const m = /^([^\s:]+)\s*:\s*(.*)$/.exec(line);
		if (!m) {
			throw new Error(`Invalid attribute line (expected key: value): "${line}"`);
		}
		let value = m[2].trim();
		if (value === "") {
			throw new Error(
				`Attribute "${m[1]}" has no value (nested values are not supported).`,
			);
		}
		const q = value[0];
		if ((q === '"' || q === "'") && value.length >= 2 && value.endsWith(q)) {
			value = value.slice(1, -1);
		}
		attributes[m[1]] = value;
	}
	return attributes;
}
