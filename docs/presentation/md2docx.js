#!/usr/bin/env node
/*
 * md2docx.js – converts one Markdown document of this repository into a Word file (.docx).
 *
 * Scope: the Markdown subset used in docs/ (headings, paragraphs, bold/italic/code, bullet and numbered
 * lists, pipe tables, fenced code, horizontal rules) plus ```mermaid blocks, which are rendered to PNG
 * with the local mermaid bundle in headless Chrome and embedded as pictures.
 *
 * Usage (the npm packages are not part of this project; they live in a scratch folder):
 *   mkdir -p /tmp/deck-tools && cd /tmp/deck-tools && npm init -y && npm i docx marked mermaid puppeteer-core
 *   NODE_PATH=/tmp/deck-tools/node_modules node docs/presentation/md2docx.js docs/11_design_review_hydac.md \
 *       docs/presentation/Customer_Monitor_Design_Review_PreRead.docx
 *
 * Environment: CHROME = path to a Chrome/Chromium binary (default: Google Chrome on macOS).
 *              MERMAID_DIR = folder where the rendered diagram PNGs are kept (default: a temp folder).
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const docx = require("docx");

const {
  AlignmentType, BorderStyle, Document, ExternalHyperlink, Footer, Header, HeadingLevel, ImageRun,
  LevelFormat, Packer, PageNumber, Paragraph, ShadingType, Table, TableCell, TableOfContents, TableRow,
  TabStopType, TextRun, VerticalAlign, WidthType,
} = docx;

// ---------------------------------------------------------------- theme (same palette as build-deck.js)
const NAVY = "14213D", TEAL = "0E7C7B", INK = "1F2933", SLATE = "5B6B7A", ICE = "C9D6E8", MIST = "EEF2F7",
  CODE_BG = "F1F3F5", WHITE = "FFFFFF";
const HEAD_FONT = "Cambria", BODY_FONT = "Calibri", CODE_FONT = "Consolas";

// A4, 2 cm margins → 9638 DXA text width (1440 DXA = 1 inch)
const PAGE = { width: 11906, height: 16838 };
const MARGIN = 1134;
const TEXT_W = PAGE.width - 2 * MARGIN;
const TEXT_W_PX = Math.floor((TEXT_W / 1440) * 96); // 96 dpi pixels used by ImageRun
const MAX_IMG_H_PX = 880;                             // a picture taller than this would not fit a page with its caption

const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

// ---------------------------------------------------------------- helpers
function unescapeHtml(s) {
  return String(s)
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Inline tokens → TextRun[] (and hyperlinks). `fmt` carries bold/italics/code/strike/size/color. */
function inline(tokens, fmt = {}) {
  const out = [];
  const run = (text, extra = {}) => {
    const f = { ...fmt, ...extra };
    const opts = { text, bold: f.bold, italics: f.italics, strike: f.strike };
    if (f.size) opts.size = f.size;
    if (f.color) opts.color = f.color;
    if (f.code) {
      opts.font = CODE_FONT;
      opts.size = (f.size || 21) - 2;
      opts.shading = { type: ShadingType.CLEAR, fill: CODE_BG, color: "auto" };
    }
    return new TextRun(opts);
  };
  const pushText = (text, extra) => {
    // soft line breaks inside a paragraph become line breaks
    const parts = unescapeHtml(text).split("\n");
    parts.forEach((p, i) => {
      if (i > 0) out.push(new TextRun({ break: 1 }));
      if (p.length) out.push(run(p, extra));
    });
  };
  for (const t of tokens || []) {
    switch (t.type) {
      case "text":
        if (t.tokens && t.tokens.length) out.push(...inline(t.tokens, fmt));
        else pushText(t.text);
        break;
      case "escape": pushText(t.text); break;
      case "strong": out.push(...inline(t.tokens, { ...fmt, bold: true })); break;
      case "em": out.push(...inline(t.tokens, { ...fmt, italics: true })); break;
      case "del": out.push(...inline(t.tokens, { ...fmt, strike: true })); break;
      case "codespan": out.push(run(unescapeHtml(t.text), { code: true })); break;
      case "br": out.push(new TextRun({ break: 1 })); break;
      case "html":
        if (/^<br\s*\/?>$/i.test(t.text.trim())) out.push(new TextRun({ break: 1 }));
        else pushText(t.text.replace(/<[^>]+>/g, ""));
        break;
      case "link": {
        const children = inline(t.tokens, { ...fmt, color: TEAL });
        if (/^https?:/i.test(t.href)) out.push(new ExternalHyperlink({ link: t.href, children }));
        else out.push(...children);
        break;
      }
      case "image": pushText(t.text || t.title || ""); break;
      default: pushText(t.raw || "");
    }
  }
  return out;
}

function plainText(tokens) {
  return (tokens || []).map((t) => {
    if (t.tokens && t.tokens.length) return plainText(t.tokens);
    if (t.type === "br" || t.type === "html") return " ";
    return unescapeHtml(t.text || t.raw || "");
  }).join("");
}

// ---------------------------------------------------------------- mermaid → PNG (headless Chrome)
async function renderMermaid(blocks, outDir) {
  if (!blocks.length) return new Map();
  const puppeteer = require("puppeteer-core");
  const mermaidJs = fs.readFileSync(require.resolve("mermaid/dist/mermaid.min.js"), "utf8");
  fs.mkdirSync(outDir, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), "md2docx-"));
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    userDataDir: path.join(tmp, "profile"),
    args: ["--no-first-run", "--no-default-browser-check", "--disable-gpu", "--disable-crash-reporter",
      "--disable-breakpad", `--crash-dumps-dir=${tmp}`, "--hide-scrollbars"],
  });
  const result = new Map();
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 2400, height: 1600, deviceScaleFactor: 2 });
    // rankSpacing is the distance between ranks (horizontal in LR, vertical in TB): generous for LR,
    // where width is cheap, tight for TB, where every pixel of height costs scale on the page.
    const configFor = (rankSpacing) => ({
      startOnLoad: false, theme: "base", securityLevel: "loose",
      themeVariables: {
        fontFamily: `${BODY_FONT}, Arial, sans-serif`, fontSize: "16px",
        primaryColor: `#${MIST}`, primaryBorderColor: `#${NAVY}`, primaryTextColor: `#${INK}`,
        secondaryColor: `#${WHITE}`, tertiaryColor: `#F7F9FC`, lineColor: `#${SLATE}`,
        clusterBkg: "#F7F9FC", clusterBorder: `#${ICE}`, edgeLabelBackground: `#${WHITE}`,
      },
      flowchart: { htmlLabels: true, curve: "basis", padding: 10, nodeSpacing: 56, rankSpacing, subGraphTitleMargin: { top: 10, bottom: 10 } },
    });
    // mermaid.initialize must run before the page's load event, otherwise the bundle renders the
    // diagram itself with the default theme and a later run() skips the already processed node.
    const renderOne = async (src, file, rankSpacing) => {
      const html = `<!doctype html><html><head><meta charset="utf-8"><script>${mermaidJs}</script>
        <script>mermaid.initialize(${JSON.stringify(configFor(rankSpacing))});</script>
        <style>body{margin:0;background:#fff;font-family:${BODY_FONT},Arial,sans-serif}#d{display:block;width:2300px;padding:8px}</style>
        </head><body><div id="d"><pre class="mermaid">${escapeHtml(src)}</pre></div></body></html>`;
      await page.setContent(html, { waitUntil: "load" });
      const box = await page.evaluate(async () => {
        await window.mermaid.run({ nodes: [document.querySelector("#d pre")] });
        const svg = document.querySelector("#d svg");
        if (!svg) throw new Error("mermaid produced no svg");
        // mermaid sets max-width to the natural width and width:100%; shrink the container to it
        const natural = parseFloat(svg.style.maxWidth) || svg.getBoundingClientRect().width;
        document.getElementById("d").style.width = `${Math.ceil(natural)}px`;
        const r = svg.getBoundingClientRect();
        return { width: Math.ceil(r.width), height: Math.ceil(r.height) };
      });
      const el = await page.$("#d");
      await el.screenshot({ path: file, type: "png" });
      return { file, cssWidth: box.width + 16, cssHeight: box.height + 16 };
    };
    // scale at which the picture fits the text width and a comfortable page height
    const fit = (r) => Math.min(1, TEXT_W_PX / r.cssWidth, MAX_IMG_H_PX / r.cssHeight);

    for (const [i, src] of blocks.entries()) {
      const name = (suffix) => path.join(outDir, `mermaid-${i + 1}${suffix}.png`);
      let chosen = await renderOne(src, name(""), 72);
      let note = "as written";
      // A wide left-to-right flowchart becomes unreadable at text width: re-lay it out top-to-bottom.
      // Rank spacing is now vertical: keep it generous (fewer label collisions) while the picture still
      // fits the page at a readable scale, otherwise tighten it.
      if (fit(chosen) < 0.75 && /^\s*(flowchart|graph)\s+LR\b/m.test(src)) {
        const tb = src.replace(/^(\s*(?:flowchart|graph))\s+LR\b/m, "$1 TB");
        const roomy = await renderOne(tb, name("-tb"), 72);
        if (fit(roomy) >= 0.7) { chosen = roomy; note = "top-to-bottom"; }
        else {
          const tight = await renderOne(tb, name("-tb-tight"), 44);
          const best = fit(tight) > fit(roomy) ? tight : roomy;
          if (fit(best) > fit(chosen)) { chosen = best; note = `top-to-bottom, ${best === tight ? "tight" : "roomy"} rank spacing`; }
        }
      }
      result.set(i, chosen);
      console.log(`mermaid ${i + 1}: ${chosen.cssWidth}×${chosen.cssHeight} css px, scale ${fit(chosen).toFixed(2)} (${note}) → ${chosen.file}`);
    }
  } finally {
    await browser.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  return result;
}

// ---------------------------------------------------------------- block conversion
class Converter {
  constructor(images) {
    this.images = images;      // Map<mermaidIndex, {file, cssWidth, cssHeight}>
    this.mermaidSeen = 0;
    this.orderedLists = 0;     // one numbering instance per numbered list, so each restarts at 1
    this.h2Count = 0;
    this.numbering = [{
      reference: "bullets",
      levels: [0, 1, 2].map((lvl) => ({
        level: lvl, format: LevelFormat.BULLET, text: ["•", "–", "·"][lvl], alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 360 + 360 * lvl + 360, hanging: 360 } } },
      })),
    }];
  }

  orderedRef() {
    const reference = `numbers-${this.orderedLists++}`;
    this.numbering.push({
      reference,
      levels: [0, 1, 2].map((lvl) => ({
        level: lvl, format: LevelFormat.DECIMAL, text: `%${lvl + 1}.`, alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 360 + 360 * lvl + 360, hanging: 360 } } },
      })),
    });
    return reference;
  }

  blocks(tokens, ctx = {}) {
    const out = [];
    for (const t of tokens) {
      switch (t.type) {
        case "space": case "hr": break;
        case "heading": out.push(...this.heading(t)); break;
        case "paragraph": out.push(new Paragraph({ children: inline(t.tokens), ...(ctx.paragraph || {}) })); break;
        case "text": out.push(new Paragraph({ children: inline(t.tokens || [t]), ...(ctx.paragraph || {}) })); break;
        case "table": out.push(this.table(t), new Paragraph({ spacing: { before: 0, after: 60 }, children: [new TextRun({ text: "", size: 8 })] })); break;
        case "list": out.push(...this.list(t, 0)); break;
        case "code": out.push(...this.code(t)); break;
        case "blockquote":
          out.push(...this.blocks(t.tokens, { paragraph: { indent: { left: 567 }, border: { left: { style: BorderStyle.SINGLE, size: 12, color: ICE, space: 8 } } } }));
          break;
        case "html": break;
        default: out.push(new Paragraph({ text: unescapeHtml(t.raw || "") }));
      }
    }
    return out;
  }

  heading(t) {
    const text = plainText(t.tokens);
    if (t.depth === 1) {
      const title = text.replace(/^\d+\s+[–-]\s+/, "");
      return [new Paragraph({ heading: HeadingLevel.TITLE, children: inline(t.tokens).length ? [new TextRun(title)] : [] })];
    }
    if (t.depth === 2) {
      const first = this.h2Count++ === 0;
      return [new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: !first, children: inline(t.tokens) })];
    }
    const level = t.depth === 3 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3;
    return [new Paragraph({ heading: level, children: inline(t.tokens) })];
  }

  list(t, level) {
    const reference = t.ordered ? this.orderedRef() : "bullets";
    const out = [];
    for (const item of t.items) {
      const own = [];
      const nested = [];
      for (const sub of item.tokens) {
        if (sub.type === "list") nested.push(sub);
        else own.push(sub);
      }
      const paragraphs = this.blocks(own, { paragraph: { numbering: { reference, level }, spacing: { after: 60 } } });
      if (!paragraphs.length) paragraphs.push(new Paragraph({ numbering: { reference, level }, text: "" }));
      out.push(...paragraphs);
      for (const n of nested) out.push(...this.list(n, level + 1));
    }
    return out;
  }

  code(t) {
    if ((t.lang || "").trim() === "mermaid") {
      const img = this.images.get(this.mermaidSeen++);
      if (!img) return [new Paragraph({ children: [new TextRun({ text: "[diagram not rendered]", italics: true, color: SLATE })] })];
      const data = fs.readFileSync(img.file);
      const width = Math.min(TEXT_W_PX, img.cssWidth);
      const height = Math.round(img.cssHeight * (width / img.cssWidth));
      return [new Paragraph({
        alignment: AlignmentType.CENTER, spacing: { before: 120, after: 200 }, keepNext: false,
        children: [new ImageRun({ type: "png", data, transformation: { width, height }, altText: { title: "Diagram", description: "Diagram", name: path.basename(img.file) } })],
      })];
    }
    return t.text.split("\n").map((line, i, arr) => new Paragraph({
      spacing: { before: i === 0 ? 120 : 0, after: i === arr.length - 1 ? 160 : 0, line: 240 },
      shading: { type: ShadingType.CLEAR, fill: CODE_BG, color: "auto" },
      indent: { left: 170, right: 170 },
      children: [new TextRun({ text: line || " ", font: CODE_FONT, size: 18 })],
    }));
  }

  table(t) {
    const cols = t.header.length;
    const allRows = [t.header, ...t.rows];
    // Column weights from content length (half max, half 75th percentile, clamped); a column whose
    // body is empty (to be filled in by the reader) still gets room. Then every column is at least as
    // wide as its longest word (≈ 95 DXA per character at 9 pt plus cell margins), so IDs such as
    // "UC-01" and single-word headers never break mid-word; the deficit is taken from wider columns.
    const texts = allRows.map((r) => r.map((cell) => (cell ? plainText(cell.tokens) : "")));
    const widths = [];
    const minDxa = [];
    for (let c = 0; c < cols; c++) {
      const lens = texts.map((r) => (r[c] || "").length).sort((a, b) => a - b);
      const max = lens[lens.length - 1];
      const p75 = lens[Math.floor((lens.length - 1) * 0.75)];
      const header = texts[0][c].length;
      const bodyEmpty = texts.slice(1).every((r) => !(r[c] || "").trim());
      widths.push(Math.max(8, bodyEmpty ? 20 : 0, 0.8 * header, Math.min(80, 0.5 * max + 0.5 * p75)));
      const longestWord = Math.max(...texts.map((r) => Math.max(0, ...(r[c] || "").split(/\s+/).map((w) => w.length))));
      minDxa.push(Math.min(Math.round(TEXT_W * 0.45), longestWord * 95 + 240));
    }
    const sum = widths.reduce((a, b) => a + b, 0);
    const dxa = widths.map((w) => Math.round((TEXT_W * w) / sum));
    let deficit = 0;
    for (let c = 0; c < cols; c++) if (dxa[c] < minDxa[c]) { deficit += minDxa[c] - dxa[c]; dxa[c] = minDxa[c]; }
    const surplus = dxa.map((w, c) => Math.max(0, w - minDxa[c]));
    const surplusSum = surplus.reduce((a, b) => a + b, 0);
    if (deficit > 0 && surplusSum > 0) for (let c = 0; c < cols; c++) dxa[c] -= Math.round((deficit * surplus[c]) / surplusSum);
    dxa[cols - 1] += TEXT_W - dxa.reduce((a, b) => a + b, 0);

    const border = { style: BorderStyle.SINGLE, size: 4, color: ICE };
    const borders = { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border };
    const margins = { top: 50, bottom: 50, left: 80, right: 80 };

    const cell = (tok, c, isHeader, zebra) => new TableCell({
      width: { size: dxa[c], type: WidthType.DXA },
      margins,
      verticalAlign: VerticalAlign.TOP,
      shading: isHeader
        ? { type: ShadingType.CLEAR, fill: NAVY, color: "auto" }
        : zebra ? { type: ShadingType.CLEAR, fill: MIST, color: "auto" } : undefined,
      children: [new Paragraph({
        spacing: { before: 0, after: 0, line: 252 },
        alignment: t.align && t.align[c] === "right" ? AlignmentType.RIGHT : t.align && t.align[c] === "center" ? AlignmentType.CENTER : AlignmentType.LEFT,
        children: inline(tok ? tok.tokens : [], isHeader ? { bold: true, color: WHITE, size: 18 } : { size: 18 }),
      })],
    });

    const rows = [
      new TableRow({ tableHeader: true, cantSplit: true, children: t.header.map((h, c) => cell(h, c, true, false)) }),
      ...t.rows.map((r, i) => new TableRow({ cantSplit: true, children: r.map((x, c) => cell(x, c, false, i % 2 === 1)) })),
    ];
    return new Table({ rows, width: { size: TEXT_W, type: WidthType.DXA }, columnWidths: dxa, borders, layout: docx.TableLayoutType.FIXED });
  }
}

// ---------------------------------------------------------------- document
async function main() {
  const [, , inFile, outFile] = process.argv;
  if (!inFile || !outFile) {
    console.error("usage: md2docx.js <input.md> <output.docx>");
    process.exit(2);
  }
  const { marked } = await import("marked");
  const md = fs.readFileSync(inFile, "utf8");
  const tokens = marked.lexer(md, { gfm: true });

  const mermaidBlocks = tokens.filter((t) => t.type === "code" && (t.lang || "").trim() === "mermaid").map((t) => t.text);
  const imgDir = process.env.MERMAID_DIR || fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), "md2docx-img-"));
  const images = await renderMermaid(mermaidBlocks, imgDir);

  const conv = new Converter(images);

  // split: everything before the first H2 is the title block; a table of contents follows it
  const firstH2 = tokens.findIndex((t) => t.type === "heading" && t.depth === 2);
  const head = firstH2 < 0 ? tokens : tokens.slice(0, firstH2);
  const rest = firstH2 < 0 ? [] : tokens.slice(firstH2);
  const titleTok = head.find((t) => t.type === "heading" && t.depth === 1);
  const docTitle = titleTok ? plainText(titleTok.tokens).replace(/^\d+\s+[–-]\s+/, "") : path.basename(inFile, ".md");

  const body = [
    ...conv.blocks(head),
    new Paragraph({ spacing: { before: 240, after: 120 }, children: [new TextRun({ text: "Contents", font: HEAD_FONT, size: 26, bold: true, color: NAVY })] }),
    new TableOfContents("Contents", { hyperlink: true, headingStyleRange: "1-2" }),
    ...conv.blocks(rest),
  ];

  const hdrRun = (text, extra = {}) => new TextRun({ text, size: 16, color: SLATE, ...extra });
  const doc = new Document({
    creator: "purplecat AG",
    title: docTitle,
    description: "Converted from Markdown by docs/presentation/md2docx.js",
    // Word asks once on opening whether to update fields (fills the table of contents). UPDATE_FIELDS=0 skips that.
    features: process.env.UPDATE_FIELDS === "0" ? undefined : { updateFields: true },
    numbering: { config: conv.numbering },
    styles: {
      default: {
        document: { run: { font: BODY_FONT, size: 21, color: INK }, paragraph: { spacing: { before: 0, after: 120, line: 276 } } },
        title: { run: { font: HEAD_FONT, size: 44, bold: true, color: NAVY }, paragraph: { spacing: { before: 0, after: 240 }, keepNext: true } },
        heading1: { run: { font: HEAD_FONT, size: 32, bold: true, color: NAVY }, paragraph: { spacing: { before: 360, after: 160 }, keepNext: true, outlineLevel: 0 } },
        heading2: { run: { font: HEAD_FONT, size: 26, bold: true, color: TEAL }, paragraph: { spacing: { before: 280, after: 120 }, keepNext: true, outlineLevel: 1 } },
        heading3: { run: { font: BODY_FONT, size: 22, bold: true, color: INK }, paragraph: { spacing: { before: 200, after: 80 }, keepNext: true, outlineLevel: 2 } },
        hyperlink: { run: { color: TEAL, underline: {} } },
      },
    },
    sections: [{
      properties: {
        page: { size: PAGE, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN, header: 600, footer: 600 } },
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            tabStops: [{ type: TabStopType.RIGHT, position: TEXT_W }],
            border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: ICE, space: 4 } },
            spacing: { after: 0 },
            children: [hdrRun(docTitle), hdrRun("\tpurplecat AG · draft for review")],
          })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            tabStops: [{ type: TabStopType.RIGHT, position: TEXT_W }],
            spacing: { before: 0, after: 0 },
            children: [hdrRun("HYDAC – Customer Monitor on SAP BTP"), hdrRun("\tPage "), new TextRun({ children: [PageNumber.CURRENT], size: 16, color: SLATE }), hdrRun(" of "), new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: SLATE })],
          })],
        }),
      },
      children: body,
    }],
  });

  const buf = await Packer.toBuffer(doc);
  fs.writeFileSync(outFile, buf);
  console.log(`wrote ${outFile} (${(buf.length / 1024).toFixed(0)} KB), ${images.size} diagram(s) from ${imgDir}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
