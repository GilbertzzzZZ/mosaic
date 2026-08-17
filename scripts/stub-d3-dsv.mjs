// 构建期替身：把 @antv/vendor/d3-dsv 换出 bundle（见 esbuild.config.mjs 的 alias）。
//
// bundle 里唯一引用它的是 G2 的 data/fetch.ts —— `data: { type: 'fetch', value: 'x.csv' }`
// 这个数据源，它 fetch(url) 之后用 d3-dsv 把 CSV 解析回来。Mosaic 从不走那条路：
// 数据先由 src/parse/delimited-data.mjs 解析成行数组，再作为内存数组交给 G2。
//
// 换掉它是为了 d3-dsv 的 objectConverter —— 那个函数用 new Function 动态拼出行转换器，
// 社区目录的自动审核会把整个插件报成 Dynamic Code Execution（"prevents full static
// analysis of plugin behavior"）。Mosaic 自己的源码里一个 eval / new Function 都没有，
// 不必替一条走不到的上游路径背这条。
//
// 导出名必须与真身逐个对上，少一个 esbuild 在解析 import 时就直接失败。真被调用到
// 说明有人接上了 fetch 数据源——那是预期之外的路径，抛错比静默返回空数据安全。
const unsupported = () => {
	throw new Error("Mosaic does not use G2's fetch data source.");
};

export const autoType = unsupported;
export const csvFormat = unsupported;
export const csvFormatBody = unsupported;
export const csvFormatRow = unsupported;
export const csvFormatRows = unsupported;
export const csvFormatValue = unsupported;
export const csvParse = unsupported;
export const csvParseRows = unsupported;
export const dsvFormat = unsupported;
export const tsvFormat = unsupported;
export const tsvFormatBody = unsupported;
export const tsvFormatRow = unsupported;
export const tsvFormatRows = unsupported;
export const tsvFormatValue = unsupported;
export const tsvParse = unsupported;
export const tsvParseRows = unsupported;
