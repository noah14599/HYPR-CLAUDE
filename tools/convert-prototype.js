// One-time converter (already run; kept for the record). Usage:
//   npm i htmlparser2@9 && node tools/convert-prototype.js hypr-site/index.html web/app/hypr
// Then add "/* eslint-disable */" as the first line of the generated HyprApp.tsx.
// HYPR design prototype (.dc.html template + logic) -> React TSX + CSS.
// Mirrors the semantics of the prototype runtime (support.js): sc-if, sc-for, {{ expr }},
// style strings, style-<pseudo> hover rules, and text interpolation wrapped in span.sc-interp.
const fs = require("fs");
const path = require("path");
const { parseDocument } = require("htmlparser2");

const [, , SRC, OUT_DIR] = process.argv;
const src = fs.readFileSync(SRC, "utf8");

// ---- split the file ----
const open = /<x-dc(?:\s[^>]*)?>/.exec(src);
const close = src.lastIndexOf("</x-dc>");
let template = src.slice(open.index + open[0].length, close);
const helmetM = /<helmet>([\s\S]*?)<\/helmet>/i.exec(template);
const helmet = helmetM ? helmetM[1] : "";
template = template.replace(/<helmet>[\s\S]*?<\/helmet>/i, "");
const scriptM = /<script type="text\/x-dc" data-dc-script[^>]*>([\s\S]*?)<\/script>/.exec(src);
let logic = scriptM[1];

const helmetCss = (/<style>([\s\S]*?)<\/style>/.exec(helmet) || [, ""])[1];
const fontLinks = [...helmet.matchAll(/<link [^>]*href="([^"]*fonts\.googleapis\.com\/css2[^"]*)"/g)].map(m => m[1].replace(/&amp;/g, "&"));

// ---- expressions (same grammar as the runtime's resolve()) ----
const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*/;
function wrapsWhole(e) {
  let d = 0;
  for (let i = 0; i < e.length - 1; i++) {
    if (e[i] === "(") d++;
    else if (e[i] === ")") { d--; if (d === 0) return false; }
  }
  return true;
}
function topEq(e) {
  let d = 0;
  for (let i = 0; i < e.length; i++) {
    const c = e[i];
    if (c === "[" || c === "(") d++;
    else if (c === "]" || c === ")") d--;
    else if (d === 0 && (c === "=" || c === "!") && e[i + 1] === "=") {
      if (i > 0 && (e[i - 1] === "=" || e[i - 1] === "!")) continue;
      if (!e.slice(0, i).trim()) continue;
      return { index: i, op: e[i + 2] === "=" ? c + "==" : c + "=" };
    }
  }
  return null;
}
function conv(raw, scope) {
  const e = String(raw).trim();
  if (!e) return "undefined";
  if (e[0] === "(" && e[e.length - 1] === ")" && wrapsWhole(e)) return conv(e.slice(1, -1), scope);
  const eq = topEq(e);
  if (eq) return "(" + conv(e.slice(0, eq.index), scope) + " " + eq.op + " " + conv(e.slice(eq.index + eq.op.length), scope) + ")";
  if (e[0] === "!") return "!(" + conv(e.slice(1), scope) + ")";
  if (["true", "false", "null", "undefined"].includes(e)) return e;
  if (/^-?\d+(\.\d+)?$/.test(e)) return e;
  if (e.length >= 2 && (e[0] === '"' || e[0] === "'") && e[e.length - 1] === e[0]) return JSON.stringify(e.slice(1, -1));
  const head = e.match(IDENT);
  if (!head) return "undefined";
  let out = scope.has(head[0]) ? head[0] : "__v[" + JSON.stringify(head[0]) + "]";
  let i = head[0].length;
  while (i < e.length) {
    if (e[i] === ".") {
      const m = e.slice(i + 1).match(IDENT) || e.slice(i + 1).match(/^\d+/);
      if (!m) return "undefined";
      out += "?.[" + JSON.stringify(m[0]) + "]";
      i += 1 + m[0].length;
    } else if (e[i] === "[") {
      let depth = 1, j = i + 1;
      while (j < e.length && depth > 0) { if (e[j] === "[") depth++; else if (e[j] === "]") { depth--; if (depth === 0) break; } j++; }
      out += "?.[" + conv(e.slice(i + 1, j), scope) + "]";
      i = j + 1;
    } else return "undefined";
  }
  return out;
}

// ---- attributes ----
const kebabToCamel = s => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
function cssToObj(css) {
  const o = {};
  for (const decl of css.split(";")) {
    const i = decl.indexOf(":");
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim();
    o[prop.startsWith("--") ? prop : kebabToCamel(prop)] = decl.slice(i + 1).trim();
  }
  return o;
}
const importantify = css => css.split(";").map(d => d.trim()).filter(Boolean)
  .map(d => /!important\s*$/.test(d) ? d : d + " !important").join(";");
const SVG_CAMEL = new Set(["stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-dasharray", "stroke-dashoffset", "stroke-opacity", "stroke-miterlimit",
  "fill-opacity", "fill-rule", "clip-rule", "clip-path", "stop-color", "stop-opacity", "text-anchor", "dominant-baseline", "vector-effect",
  "font-size", "font-weight", "font-family", "letter-spacing", "alignment-baseline", "shape-rendering", "paint-order"]);
const EVENT_MAP = { onclick: "onClick", onchange: "onChange", oninput: "onInput", onsubmit: "onSubmit", onkeydown: "onKeyDown", onkeyup: "onKeyUp",
  onmousedown: "onMouseDown", onmouseup: "onMouseUp", onmouseenter: "onMouseEnter", onmouseleave: "onMouseLeave", onfocus: "onFocus", onblur: "onBlur",
  onmousemove: "onMouseMove", onpointerdown: "onPointerDown", onpointerup: "onPointerUp", onpointermove: "onPointerMove", onpointerleave: "onPointerLeave",
  onpointercancel: "onPointerCancel", ontouchstart: "onTouchStart", ontouchend: "onTouchEnd", ontouchmove: "onTouchMove", onscroll: "onScroll", onwheel: "onWheel" };

const pseudoRules = [];
const pseudoCache = new Map();
let dynPseudo = 0;
function pseudoClass(pseudo, css) {
  const k = pseudo + "|" + css;
  if (pseudoCache.has(k)) return pseudoCache.get(k);
  const cls = "hp" + pseudoCache.size.toString(36);
  const el = pseudo === "before" || pseudo === "after";
  pseudoRules.push("." + cls + (el ? "::" : ":") + pseudo + "{" + (el ? css : importantify(css)) + "}");
  pseudoCache.set(k, cls);
  return cls;
}

const hasInterp = s => s.includes("{{");
function tmplLiteral(raw, scope) {
  const parts = raw.split(/\{\{([\s\S]+?)\}\}/g);
  return "`" + parts.map((p, i) => i & 1 ? "${__s(" + conv(p, scope) + ")}" : p.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${")).join("") + "`";
}
function wholeBinding(raw) { const m = raw.match(/^\s*\{\{([\s\S]+?)\}\}\s*$/); return m ? m[1] : null; }

const warnings = [];
function attrsToJsx(el, scope) {
  const out = [];
  const classes = [];
  const dynClasses = [];
  for (const [name0, value] of Object.entries(el.attribs)) {
    let name = name0;
    if (name === "sc-name" || name === "hint-size") continue;
    if (name.startsWith("style-")) {
      const pseudo = name.slice(6);
      if (hasInterp(value)) { dynClasses.push("__pc(" + JSON.stringify(pseudo) + ", " + tmplLiteral(value, scope) + ")"); dynPseudo++; }
      else classes.push(pseudoClass(pseudo, value));
      continue;
    }
    if (name === "class") name = "className";
    else if (name === "for") name = "htmlFor";
    else if (/^on[a-z]/i.test(name)) name = EVENT_MAP[name.toLowerCase()] || "on" + name[2].toUpperCase() + name.slice(3);
    else if (SVG_CAMEL.has(name)) name = kebabToCamel(name);
    else if (name === "crossorigin") name = "crossOrigin";
    else if (name === "tabindex") name = "tabIndex";
    else if (name === "autocomplete") name = "autoComplete";
    else if (name === "autofocus") name = "autoFocus";
    else if (name === "maxlength") name = "maxLength";
    else if (name === "readonly") name = "readOnly";
    else if (name === "spellcheck") name = "spellCheck";
    else if (name === "inputmode") name = "inputMode";
    else if (name === "enterkeyhint") name = "enterKeyHint";

    const wb = wholeBinding(value);
    if (name === "style") {
      if (wb) out.push("style={__css(" + conv(wb, scope) + ")}");
      else if (hasInterp(value)) out.push("style={__css(" + tmplLiteral(value, scope) + ")}");
      else out.push("style={" + JSON.stringify(cssToObj(value)) + "}");
      continue;
    }
    if (name === "className" && (wb || hasInterp(value))) {
      classes.unshift("__DYN__" + (wb ? "__s(" + conv(wb, scope) + ")" : tmplLiteral(value, scope)));
      continue;
    }
    if (name === "className") { classes.unshift(value); continue; }
    if (/^on[A-Z]/.test(name) && !wb) { warnings.push("static handler dropped: " + name + "=" + value); continue; }
    if (wb) {
      let ex = conv(wb, scope);
      if (name === "value") ex = "(" + ex + ") ?? \"\"";
      if (name === "checked") ex = "(" + ex + ") ?? false";
      out.push(name + "={" + ex + "}");
    } else if (hasInterp(value)) out.push(name + "={" + tmplLiteral(value, scope) + "}");
    else out.push(name + "={" + JSON.stringify(value) + "}");
  }
  if (classes.length || dynClasses.length) {
    const stat = classes.filter(c => !c.startsWith("__DYN__"));
    const dyn = classes.filter(c => c.startsWith("__DYN__")).map(c => c.slice(7)).concat(dynClasses);
    if (!dyn.length) out.push("className=" + JSON.stringify(stat.join(" ")));
    else out.push("className={__cx(" + stat.map(c => JSON.stringify(c)).concat(dyn).join(", ") + ")}");
  }
  return out;
}

// ---- nodes ----
let forDepth = 0;
function children(node, scope, ind) {
  return node.children.map(c => walk(c, scope, ind)).filter(x => x != null);
}
function walk(node, scope, ind) {
  const pad = "  ".repeat(ind);
  if (node.type === "text") {
    const txt = node.data;
    if (!hasInterp(txt)) {
      if (!txt.trim() && !txt.includes(" ")) return null;
      return pad + "{" + JSON.stringify(txt) + "}";
    }
    const parts = txt.split(/\{\{([\s\S]+?)\}\}/g);
    return parts.map((p, i) => i & 1 ? pad + "{__t(" + conv(p, scope) + ")}" : (p ? pad + "{" + JSON.stringify(p) + "}" : null)).filter(Boolean).join("\n");
  }
  if (node.type === "comment") return null;
  if (node.type !== "tag" && node.type !== "script" && node.type !== "style") return null;
  const tag = node.name;
  if (tag === "sc-if") {
    const cond = conv(wholeBinding(node.attribs.value || "") ?? (node.attribs.value || ""), scope);
    const kids = children(node, scope, ind + 1);
    if (!kids.length) return null;
    return pad + "{(" + cond + ") ? (<>\n" + kids.join("\n") + "\n" + pad + "</>) : null}";
  }
  if (tag === "sc-for") {
    const list = conv(wholeBinding(node.attribs.list || "") ?? "", scope);
    const as = node.attribs.as || "item";
    const inner = new Set(scope); inner.add(as); inner.add("$index");
    const kids = children(node, inner, ind + 2);
    return pad + "{__arr(" + list + ").map((" + as + ", $index) => (\n" + pad + "  <Fragment key={$index}>\n" + kids.join("\n") + "\n" + pad + "  </Fragment>\n" + pad + "))}";
  }
  if (tag.startsWith("sc-") || tag === "x-import" || tag === "dc-import") { warnings.push("unsupported tag " + tag); return null; }
  const attrs = attrsToJsx(node, scope);
  const kids = children(node, scope, ind + 1);
  const openTag = "<" + tag + (attrs.length ? " " + attrs.join(" ") : "");
  if (!kids.length) return pad + openTag + " />";
  return pad + openTag + ">\n" + kids.join("\n") + "\n" + pad + "</" + tag + ">";
}

const doc = parseDocument(template, { lowerCaseAttributeNames: false, lowerCaseTags: true, recognizeSelfClosing: true, decodeEntities: true });
const jsx = children(doc, new Set(), 3).join("\n");

// ---- logic ----
if (!/class Component extends DCLogic/.test(logic)) throw new Error("no Component class");
logic = logic.replace("class Component extends DCLogic", "class Component extends React.Component<any, any>");

const tsx = `// @ts-nocheck
/* GENERATED from hypr-site/index.html by the one-time prototype converter.
   This is the design prototype's own logic and markup as plain React, so every screen
   matches it exactly. From here on, edit this file directly. */
"use client";

import React, { Fragment } from "react";

// ---- template helpers (same behaviour as the prototype runtime) ----
const __s = (x) => (x == null ? "" : String(x));
const __arr = (x) => (Array.isArray(x) ? x : []);
const __cx = (...a) => a.filter(Boolean).join(" ");
function __t(x) {
  if (x === undefined || x === null || typeof x === "boolean") return null;
  if (React.isValidElement(x) || Array.isArray(x)) return x;
  return <span className="sc-interp">{String(x)}</span>;
}
const kebabToCamel = (k) => k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const cssCache = new Map();
function __css(x) {
  if (x == null || typeof x !== "string") return x;
  let o = cssCache.get(x);
  if (o) return o;
  o = {};
  for (const decl of x.split(";")) {
    const i = decl.indexOf(":");
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim();
    o[prop.startsWith("--") ? prop : kebabToCamel(prop)] = decl.slice(i + 1).trim();
  }
  cssCache.set(x, o);
  return o;
}
let pcSheet = null;
const pcCache = new Map();
function __pc(pseudo, rule) {
  const k = pseudo + "|" + rule;
  if (pcCache.has(k)) return pcCache.get(k);
  if (typeof document === "undefined") return "";
  if (!pcSheet) { const el = document.createElement("style"); document.head.appendChild(el); pcSheet = el.sheet; }
  const cls = "hpd" + pcCache.size.toString(36);
  const body = rule.split(";").map(d => d.trim()).filter(Boolean).map(d => /!important\\s*$/.test(d) ? d : d + " !important").join(";");
  pcSheet.insertRule("." + cls + ":" + pseudo + "{" + body + "}", pcSheet.cssRules.length);
  pcCache.set(k, cls);
  return cls;
}

// ---- prototype logic ----
${logic}

// ---- markup ----
export default class HyprApp extends Component {
  render() {
    const __v = { ...this.props, ...this.renderVals() };
    return (
      <>
${jsx}
      </>
    );
  }
}
`;

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, "HyprApp.tsx"), tsx);
fs.writeFileSync(path.join(OUT_DIR, "hypr.css"),
  "/* GENERATED: the prototype's global styles plus its hover rules. */\n" + helmetCss.trim().replace(/url\(assets\//g, "url(/assets/") + "\n\n/* style-hover rules from the markup */\n" + pseudoRules.join("\n") + "\n");
fs.writeFileSync(path.join(OUT_DIR, "fonts.json"), JSON.stringify(fontLinks));
console.log("tsx lines", tsx.split("\n").length, "| hover rules", pseudoRules.length, "| dynamic hover", dynPseudo, "| fonts", fontLinks.length);
console.log("warnings", warnings.length, [...new Set(warnings)].slice(0, 20));
