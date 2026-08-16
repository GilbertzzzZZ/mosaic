// tests/helpers/bundle.mjs
// 把 tests/helpers/entry.tsx 连同它牵出来的 src/ 一起打成一个 ESM 文件，写进 os 临时
// 目录再 import 回来。宿主 API 与图表引擎换成替身（见同目录两个 *-stub.mjs）。
// target 与 esbuild.config.mjs 保持一致（es2017）：语法上限是全局约束，测试链路
// 也走同一档，超标语法在这里同样会暴露。
import esbuild from "esbuild";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

let cached;

export async function loadComponents() {
	if (cached) return cached;
	const here = new URL(".", import.meta.url).pathname;
	const result = await esbuild.build({
		entryPoints: [join(here, "entry.tsx")],
		bundle: true,
		format: "esm",
		target: "es2017",
		write: false,
		logLevel: "silent",
		alias: {
			obsidian: join(here, "obsidian-stub.mjs"),
			"@ant-design/plots": join(here, "plots-stub.mjs"),
		},
	});
	const dir = mkdtempSync(join(tmpdir(), "mosaic-test-"));
	const file = join(dir, "components.mjs");
	writeFileSync(file, result.outputFiles[0].text);
	cached = await import(pathToFileURL(file).href);
	return cached;
}
