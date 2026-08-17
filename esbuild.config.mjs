import esbuild from 'esbuild';
import process from 'process';
import { builtinModules } from 'node:module';
import { fileURLToPath } from 'node:url';

// Bundles src/main.tsx into main.js; Obsidian API and Node builtins stay external.
const banner = `/*
Mosaic bundle — built by esbuild, not meant for direct editing.
Source: https://github.com/GilbertzzzZZ/obsidian-mosaic
*/
`;

const prod = process.argv[2] === 'production';

const context = await esbuild.context({
	banner: {
		js: banner,
	},
	entryPoints: ['src/main.tsx'],
	bundle: true,
	external: ['obsidian', 'electron', ...builtinModules],
	format: 'cjs',
	target: 'es2017',
	logLevel: 'info',
	sourcemap: prod ? false : 'inline',
	treeShaking: true,
	// G2 的 fetch 数据源要靠 d3-dsv 解析 CSV，而 d3-dsv 是用 new Function 拼行转换器
	// 的。Mosaic 走不到那条路（数据在进 G2 之前已经是内存数组），换成抛错替身，
	// 动态代码求值就不会出现在发布产物里。理由见 scripts/stub-d3-dsv.mjs。
	alias: {
		'@antv/vendor/d3-dsv': fileURLToPath(new URL('./scripts/stub-d3-dsv.mjs', import.meta.url)),
	},
	outfile: 'main.js',
	minify: prod,
});

if (prod) {
	await context.rebuild();
	process.exit(0);
} else {
	await context.watch();
}
