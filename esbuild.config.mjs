import esbuild from 'esbuild';
import process from 'process';
import { builtinModules } from 'node:module';

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
	outfile: 'main.js',
	minify: prod,
});

if (prod) {
	await context.rebuild();
	process.exit(0);
} else {
	await context.watch();
}
