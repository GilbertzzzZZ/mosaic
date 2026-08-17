import React, { useState } from "react";
import { DataTableView } from "./blocks/DataTableView";
import { BlockContext, BlockErrorBox, BlockFrame } from "./blocks/BlockShell";
import { GranularityButtons } from "./GranularityButtons";
import { buildFootnote } from "../chart-tag-config.mjs";

// queryDataset 交回来的三段。字段按消费方（本组件、render-component、buildFootnote）
// 实际读到的那些声明，与 DataTableView 的 TableLayout 同一套路：写成 required，
// .mjs 侧改字段名时 tsc 才会在这里报 TS2322，而不是静默滑过去。
export interface DataTableQueryMeta {
	granularity: string;
	availableGranularities: string[];
	datasetTitle: string;
	from: string;
	to: string;
	dataThrough: string;
	sourceRows: number;
	totalRows: number;
}

export interface DataTableQueryResult {
	rows: Record<string, string | number>[];
	// 只声明消费方真正读的两个：columns 是逗号拼接的字段名（dataset-query 那侧
	// outputFields.join(",")），与手写的 columns= 属性同形，所以能直接并进属性表。
	attributes: { columns: string; columnLabels: Record<string, string> };
	meta: DataTableQueryMeta;
}

interface DataTableFigureProps {
	attributes: Record<string, string>;
	body: string;
	options: string[];
	initial: DataTableQueryResult;
	build: (granularity: string) => DataTableQueryResult;
	// 外框由这里渲染而不是由调用方包在外面：粒度状态在本组件，而粒度按钮必须和三个
	// 图标按钮同处头部的那一个 .mosaic-control-group（一组按钮，不是两组挨着的小块），
	// 所以持有状态的这一层就得是持有头部的那一层。
	context: BlockContext;
	notice?: string;
	// 粒度重建失败时，让报错框也能复制定位上下文——与其余五处报错同一套。
	onCopyError?: (message: string) => void;
}

// 粒度切换是受控组件：DataTableView 自身不管理粒度状态，这里以 build() 闭包
// 重新 queryDataset（数据已在内存，零 IO）后就地重渲染（镜像 ChartFigure 的
// initial+build 模式，但没有主题/宽度重建：DataTable 是纯 DOM，不受那两者影响）。
// 该分支是可达的：例如 columns= 里列了个没有 rollup 的字段，在源粒度下（每桶
// 恰好 1 行）能透传成功，切到更粗的粒度后 aggregateField 会报
// `Field "X" needs a rollup before it can be shown in … view.`——与 ChartFigure
// 同款处理：保留上一次成功渲染的表格，把错误文案就地显示在图内，下一次切换
// 成功时清空。
export function DataTableFigure({
	attributes,
	body,
	options,
	initial,
	build,
	context,
	notice,
	onCopyError,
}: DataTableFigureProps) {
	const [result, setResult] = useState(initial);
	const [error, setError] = useState<string | undefined>(undefined);
	const onGranularity = (granularity: string) => {
		try {
			const next = build(granularity);
			setResult(next);
			setError(undefined);
		} catch (e) {
			setError(`Mosaic: ${String((e as Error)?.message ?? e)}`);
		}
	};
	return (
		<BlockFrame
			block="data-table"
			context={context}
			title={attributes.title}
			notice={notice}
			controls={
				<GranularityButtons
					options={options}
					active={result.meta.granularity}
					onSelect={onGranularity}
				/>
			}
		>
			<DataTableView
				attributes={{ ...attributes, columns: result.attributes.columns }}
				body={body}
				rows={result.rows}
				columnLabels={result.attributes.columnLabels}
				meta={buildFootnote(result.meta)}
			/>
			{error && (
				<BlockErrorBox
					message={error}
					onCopy={onCopyError && (() => onCopyError(error))}
				/>
			)}
		</BlockFrame>
	);
}
