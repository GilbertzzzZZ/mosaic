// tests/helpers/dom.mjs
// 一份刚好够 preact 跑起来的 DOM，外加 Obsidian 给 HTMLElement 打的那几个补丁
// （createDiv / empty）。存在的理由只有一个：区块的按钮、切换、复制、提示条都是
// **行为**，只有真的渲染出来、真的点下去才测得到——断言 JSX 长什么样是这份 plan
// 从 Task 0 起就在反对的那种测试。
//
// 覆盖面刻意只到 preact 与本仓库组件实际用到的那些 API；不是通用 DOM 实现，也不
// 打算变成一个。

// 真 DOM 元素自带的这些 on* 属性，preact 会拿来判事件名要不要转小写
// （`name.toLowerCase() in dom` 成立才转，见 preact/src/diff/props.js）。缺了它们，
// onClick 会被注册成 'Click'，dispatchEvent('click') 永远打不中。
const HANDLER_PROPS = [
	"onclick",
	"onchange",
	"oninput",
	"onsubmit",
	"onfocus",
	"onblur",
	"onkeydown",
	"onkeyup",
	"onmousedown",
	"onmouseup",
];

// 新建元素的默认几何量。whenHostReady 在 clientWidth === 0 时会一直等下去（它明确
// 不设超时），测试要模拟「宿主尚未布局」时把这个值改成 0。
export const domDefaults = { clientWidth: 600 };

class Node {
	constructor() {
		this.childNodes = [];
		this.parentNode = null;
	}
	get firstChild() {
		return this.childNodes[0] ?? null;
	}
	get nextSibling() {
		const siblings = this.parentNode?.childNodes;
		if (!siblings) return null;
		return siblings[siblings.indexOf(this) + 1] ?? null;
	}
	appendChild(child) {
		return this.insertBefore(child, null);
	}
	insertBefore(child, ref) {
		if (child.parentNode) child.parentNode.removeChild(child);
		const at = ref ? this.childNodes.indexOf(ref) : this.childNodes.length;
		this.childNodes.splice(at < 0 ? this.childNodes.length : at, 0, child);
		child.parentNode = this;
		return child;
	}
	removeChild(child) {
		const at = this.childNodes.indexOf(child);
		if (at >= 0) this.childNodes.splice(at, 1);
		child.parentNode = null;
		return child;
	}
	remove() {
		this.parentNode?.removeChild(this);
	}
	get textContent() {
		return this.childNodes.map((child) => child.textContent).join("");
	}
	set textContent(value) {
		this.childNodes = [];
		if (value !== "" && value != null) this.appendChild(new TextNode(value));
	}
	get ownerDocument() {
		return document;
	}
}

class TextNode extends Node {
	constructor(data) {
		super();
		this.nodeType = 3;
		this.data = String(data);
	}
	get textContent() {
		return this.data;
	}
	set textContent(value) {
		this.data = String(value);
	}
}

function makeStyle() {
	const style = {
		cssText: "",
		setProperty(name, value) {
			style[name] = value;
		},
		removeProperty(name) {
			delete style[name];
		},
	};
	return style;
}

class Element extends Node {
	constructor(tagName, namespaceURI) {
		super();
		this.nodeType = 1;
		this.localName = String(tagName).toLowerCase();
		this.nodeName = String(tagName).toUpperCase();
		this.namespaceURI = namespaceURI;
		this.attributes = new Map();
		this.style = makeStyle();
		this.listeners = new Map();
		for (const prop of HANDLER_PROPS) this[prop] = null;
		// 几何量：whenHostReady 与 ChartFigure 的宽度重建都读 clientWidth，切到原文
		// 视图前读 offsetHeight。默认值可整体改（defaultClientWidth），也可逐个覆盖。
		this.clientWidth = domDefaults.clientWidth;
		this.offsetHeight = 240;
		const owner = this;
		this.classList = {
			contains: (name) => owner.className.split(/\s+/).includes(name),
			add: (name) => {
				if (!owner.classList.contains(name)) {
					owner.className = `${owner.className} ${name}`.trim();
				}
			},
			remove: (name) => {
				owner.className = owner.className
					.split(/\s+/)
					.filter((c) => c && c !== name)
					.join(" ");
			},
		};
	}
	get isConnected() {
		let node = this;
		while (node.parentNode) node = node.parentNode;
		return node === document || node === document.body;
	}
	setAttribute(name, value) {
		this.attributes.set(name, String(value));
	}
	getAttribute(name) {
		return this.attributes.has(name) ? this.attributes.get(name) : null;
	}
	removeAttribute(name) {
		this.attributes.delete(name);
	}
	hasAttribute(name) {
		return this.attributes.has(name);
	}
	get className() {
		return this.getAttribute("class") ?? "";
	}
	set className(value) {
		this.setAttribute("class", value ?? "");
	}
	get innerHTML() {
		return this.childNodes.map(serialize).join("");
	}
	set innerHTML(value) {
		// setIcon 与 preact 的 dangerouslySetInnerHTML 都只用它来清空/塞一段 svg；
		// 这里不做解析，只保留原文，够断言用。
		this.childNodes = [];
		if (value) {
			const raw = new TextNode("");
			raw.data = "";
			raw.rawHtml = String(value);
			this.appendChild(raw);
		}
	}
	addEventListener(type, handler) {
		const list = this.listeners.get(type) ?? [];
		list.push(handler);
		this.listeners.set(type, list);
	}
	removeEventListener(type, handler) {
		const list = this.listeners.get(type) ?? [];
		const at = list.indexOf(handler);
		if (at >= 0) list.splice(at, 1);
	}
	dispatchEvent(event) {
		event.target = event.target ?? this;
		event.currentTarget = this;
		for (const handler of [...(this.listeners.get(event.type) ?? [])]) {
			handler.call(this, event);
		}
		return true;
	}
	click() {
		this.dispatchEvent({ type: "click", preventDefault() {}, stopPropagation() {} });
	}
	// --- Obsidian 给 HTMLElement 打的补丁，入口处理器直接用 ---
	createDiv(options) {
		return this.createEl("div", options);
	}
	createEl(tag, options) {
		const el = document.createElement(tag);
		if (options?.cls) el.className = options.cls;
		if (options?.text != null) el.appendChild(document.createTextNode(options.text));
		this.appendChild(el);
		return el;
	}
	empty() {
		for (const child of [...this.childNodes]) this.removeChild(child);
	}
}

class Document extends Node {
	constructor() {
		super();
		this.nodeType = 9;
		this.body = new Element("body");
		this.body.parentNode = this;
		this.childNodes = [this.body];
	}
	createElement(tag) {
		return new Element(tag);
	}
	createElementNS(ns, tag) {
		return new Element(tag, ns);
	}
	createTextNode(data) {
		return new TextNode(data);
	}
	addEventListener() {}
	removeEventListener() {}
}

export const document = new Document();

export function serialize(node) {
	if (node.nodeType === 3) return node.rawHtml ?? node.data;
	const attrs = [...node.attributes.entries()]
		.map(([name, value]) => ` ${name}="${value}"`)
		.join("");
	return `<${node.localName}${attrs}>${node.childNodes.map(serialize).join("")}</${node.localName}>`;
}

// 极简选择器：只支持一个复合选择器（标签 + .class + [attr="value"] 的任意组合），
// 不支持后代/兄弟组合子——测试里要找的东西都在这个范围内。
function matches(el, selector) {
	const tag = /^[a-zA-Z][\w-]*/.exec(selector)?.[0];
	if (tag && el.localName !== tag.toLowerCase()) return false;
	for (const [, cls] of selector.matchAll(/\.([\w-]+)/g)) {
		if (!el.className.split(/\s+/).includes(cls)) return false;
	}
	for (const [, name, value] of selector.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)) {
		if (value === undefined) {
			if (!el.hasAttribute(name)) return false;
		} else if (el.getAttribute(name) !== value) return false;
	}
	return true;
}

export function queryAll(root, selector) {
	const found = [];
	const walk = (node) => {
		if (node.nodeType === 1 && matches(node, selector)) found.push(node);
		for (const child of node.childNodes) walk(child);
	};
	walk(root);
	return found;
}

export function query(root, selector) {
	return queryAll(root, selector)[0] ?? null;
}

/** 装好全套全局对象；返回剪贴板探针（复制按钮的落点）。 */
export function installGlobals() {
	const clipboard = { text: undefined };
	const listeners = new Map();
	globalThis.document = document;
	globalThis.Node = Node;
	globalThis.Element = Element;
	globalThis.Text = TextNode;
	// node 自带的 navigator 是只读 getter，直接赋值会抛；改用 defineProperty。
	Object.defineProperty(globalThis, "navigator", {
		configurable: true,
		value: {
			clipboard: {
				writeText(text) {
					clipboard.text = text;
					return Promise.resolve();
				},
			},
		},
	});
	globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
	globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
	globalThis.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
	globalThis.window = globalThis;
	globalThis.addEventListener = (type, handler) => {
		const list = listeners.get(type) ?? [];
		list.push(handler);
		listeners.set(type, list);
	};
	globalThis.removeEventListener = (type, handler) => {
		const list = listeners.get(type) ?? [];
		const at = list.indexOf(handler);
		if (at >= 0) list.splice(at, 1);
	};
	globalThis.dispatchEvent = (event) => {
		for (const handler of [...(listeners.get(event.type) ?? [])]) handler(event);
		return true;
	};
	globalThis.CustomEvent = class {
		constructor(type, init) {
			this.type = type;
			Object.assign(this, init);
		}
	};
	return clipboard;
}

// 让 preact 的 effect 队列排空。hooks 的 afterPaint 走 requestAnimationFrame（这里
// 是 setTimeout(0)）再 setTimeout 一跳，中间还夹着 setState 的微任务重渲染。数它的
// 跳数而不是等一个固定毫秒：并行跑多个测试文件时定时器会被拖慢，等时间会偶发假红。
export async function flush(turns = 6) {
	for (let i = 0; i < turns; i += 1) {
		await new Promise((resolve) => setTimeout(resolve, 1));
	}
}

export function mountHost() {
	const host = document.createElement("div");
	document.body.appendChild(host);
	return host;
}
