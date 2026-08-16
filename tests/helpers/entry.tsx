// tests/helpers/entry.tsx
// 打包入口：把测试要驱动的那几件东西集中导出，esbuild 编译一次，node 直接 import。
// 组件与两个入口处理器都是 .tsx，node 自己跑不了——这个文件就是它们进测试进程的门。
import React from "react";
// 替身里的 TFile（obsidian-stub.mjs）。dataset 模式的加载器用 `instanceof TFile`
// 判文件，测试要造 vault 就得拿到打包产物里的那一个类，不能自己 new 一个同名的。
import { TFile } from "obsidian";
import { createChartTagProcessor } from "../../src/entry/chart-tag-processor";
import { createChartBlockProcessor } from "../../src/entry/chart-block-processor";
import { renderInto, unmountRoot } from "../../src/render/react-root";
import { renderComponentInto } from "../../src/render/render-component";
import { ChartFigure } from "../../src/render/components/ChartFigure";
import { renders } from "@ant-design/plots";

export {
	React,
	TFile,
	createChartTagProcessor,
	createChartBlockProcessor,
	renderInto,
	unmountRoot,
	renderComponentInto,
	ChartFigure,
	renders,
};
