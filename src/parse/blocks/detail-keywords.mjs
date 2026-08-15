// 详情列关键词表：命中即按 detail 列型排版（更宽的列宽配额）。
// 与算法分离，便于将来扩充其他语言而不动 table-layout.mjs 的分类算法。
// 英文词一律加 \b 词边界，避免 rule→ruler、cause→because、path→sympathy、
// source→resource、note→denote、origin→original 这类子串误命中。
export const DETAIL_HEADER_PATTERN =
	/口径|路径|说明|备注|描述|来源|依据|公式|计算|规则|原因|\b(?:descriptions?|details?|detailed|explanations?|instructions?|comments?|remarks?|notes?|summary|context|rationale|justifications?|basis|criteri(?:a|on)|definitions?|methodology|formulas?|calculations?|calculated|rules?|reasons?|causes?|sources?|origins?|paths?)\b/i;

// 单元格值关键词：值本身像口径/血统说明时，同样按 detail 列排版。
export const DETAIL_VALUE_PATTERN =
	/(?:^|[ 　])=|源表|合并表|口径|路径|快照|\b(?:sources?[ _-]?tables?|merged?[ _-]?tables?|joined?[ _-]?tables?|snapshots?|definitions?|criteri(?:a|on)|paths?)\b/i;
