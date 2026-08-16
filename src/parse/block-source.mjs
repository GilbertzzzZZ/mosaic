// 代码块源文本解析（六类内容块共用）：`---` frontmatter 属性区（flat key: value）
// + 可选内联 body。属性契约与同名标签一字不差；这里只负责切分与取值，不做语义校验。
//
// body 而不是 csv：六类共用之后，同一个字段在 Chart / DataTable 里装的是 CSV，在
// Timeline / MetricGrid / DecisionBox 里装的是 csv fence，在 FlowDiagram 里装的是
// JSON。留着 csv 这个名字会让下一个人以为这里只能放 CSV，也会让两个入口交给渲染层
// 的结构同物异名。
//
// 容错口径与标签入口一致（尽力解析 + 底部提示）：认不出的属性行不再让整块作废，而是
// 收集进 unrecognized 交给渲染层挂提示。
// ⚠️ 但 `---` 的开头与闭合**不放宽**：那是代码块的结构边界，不是字段内容。缺了闭合
// `---`，后面的 body 与属性区分不开，尽力解析只会得到一个面目全非的结果。

/**
 * @param {string} source 代码块正文（宿主给的 source 永远不含围栏）
 * @returns {{ attributes: Record<string, string>, body: string | null, unrecognized: string[] }}
 */
export function parseBlockSource(source) {
	const lines = String(source ?? "").split("\n");
	let i = 0;
	while (i < lines.length && lines[i].trim() === "") i += 1;
	if ((lines[i] ?? "").trim() !== "---") {
		throw new Error('Block must start with a "---" attribute section.');
	}
	let end = -1;
	for (let j = i + 1; j < lines.length; j += 1) {
		if (lines[j].trim() === "---") {
			end = j;
			break;
		}
	}
	if (end === -1) {
		throw new Error('The "---" attribute section is missing its closing "---".');
	}
	const { attributes, unrecognized } = parseAttributeLines(lines.slice(i + 1, end));
	// 一条属性都没认出来、却有认不出的行：这压根不是一个属性区，整块退回。判据与标签
	// 入口同一个道理——尽力解析的前提是「这确实是一个属性区，只是有几条写歪了」。
	if (unrecognized.length > 0 && Object.keys(attributes).length === 0) {
		throw new Error(
			`No attribute could be read from the "---" section (expected flat key: value lines): ${unrecognized.join(", ")}`,
		);
	}
	const body = lines
		.slice(end + 1)
		.join("\n")
		.trim();
	return { attributes, body: body.length > 0 ? body : null, unrecognized };
}

// 三种写歪的行（有缩进 / 不是 key: value 形态 / 值为空）此前逐条 throw，整块报错。
// 现在收集进 unrecognized，与标签入口的同名字段同义：认不出的原文片段，渲染层照常
// 出图并在底部点名它们。
/**
 * @param {string[]} attrLines
 * @returns {{ attributes: Record<string, string>, unrecognized: string[] }}
 */
function parseAttributeLines(attrLines) {
	/** @type {Record<string, string>} */
	const attributes = {};
	/** @type {string[]} */
	const unrecognized = [];
	for (const raw of attrLines) {
		const line = raw.trim();
		if (line === "" || line.startsWith("#")) continue;
		// 缩进行：嵌套结构不受支持，整行原样收进提示（trim 后的那一份，提示里不带排版）
		if (/^\s/.test(raw)) {
			unrecognized.push(line);
			continue;
		}
		const m = /^([^\s:]+)\s*:\s*(.*)$/.exec(line);
		if (!m) {
			unrecognized.push(line);
			continue;
		}
		let value = m[2].trim();
		// 值为空：多半是写了个嵌套的父键（`labels:`），下一行才是内容
		if (value === "") {
			unrecognized.push(line);
			continue;
		}
		const q = value[0];
		if ((q === '"' || q === "'") && value.length >= 2 && value.endsWith(q)) {
			value = value.slice(1, -1);
		}
		attributes[m[1]] = value;
	}
	return { attributes, unrecognized };
}
