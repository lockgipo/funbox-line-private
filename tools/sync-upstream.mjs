import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const UPSTREAM_URL = "https://raw.githubusercontent.com/UXUX11/funbox-line/main/index.html";
const MODULE_FILES = [
  "continuous-draw.css",
  "continuous-draw.js",
  "continuous-draw-ui.html",
];
const UI_SPLIT_MARKER = "<!-- FUNBOX_DRAW_FILTERS_STAY_HERE -->";
const CSS_REF = '<link rel="stylesheet" href="custom/continuous-draw.css">';
const JS_REF = '<script src="custom/continuous-draw.js" defer></script>';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

function usage() {
  console.log(`
安全同步原作者頁面，並注入自訂的連續抽選模組。

用法：
  node tools/sync-upstream.mjs
  node tools/sync-upstream.mjs --source <網址或檔案> --output <預覽檔案>
  node tools/sync-upstream.mjs --check-only
  node tools/sync-upstream.mjs --apply

選項：
  --source      上游 index.html 網址或本機路徑（預設：原作者 main 分支）
  --output      輸出預覽路徑（預設：preview/index.html）
  --check-only  只驗證相容性，不寫入檔案
  --apply       明確覆寫專案根目錄的 index.html（正式更新時才使用）
  --help        顯示說明
`);
}

function parseArgs(argv) {
  const options = {
    source: UPSTREAM_URL,
    output: path.join(repoRoot, "preview", "index.html"),
    checkOnly: false,
    apply: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help") {
      usage();
      process.exit(0);
    } else if (arg === "--check-only") {
      options.checkOnly = true;
    } else if (arg === "--apply") {
      options.apply = true;
    } else if (arg === "--source" || arg === "--output") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${arg} 缺少值`);
      }
      options[arg.slice(2)] = value;
      i += 1;
    } else {
      throw new Error(`不認識的選項：${arg}`);
    }
  }

  if (options.apply && argv.includes("--output")) {
    throw new Error("--apply 與 --output 不能同時使用");
  }
  if (options.apply) {
    options.output = path.join(repoRoot, "index.html");
  } else if (!path.isAbsolute(options.output)) {
    options.output = path.resolve(repoRoot, options.output);
  }

  return options;
}

function countText(haystack, needle) {
  if (!needle) return 0;
  return haystack.split(needle).length - 1;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function assertExactlyOnce(html, marker, label) {
  const count = countText(html, marker);
  if (count !== 1) {
    throw new Error(`${label} 應出現 1 次，實際出現 ${count} 次`);
  }
}

function countClassToken(html, className) {
  const pattern = new RegExp(`\\b${className.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\b`, "g");
  return (html.match(pattern) || []).length;
}

function extractDrawLinks(html) {
  const tags = html.match(/<a\b[^>]*>/gi) || [];
  return tags
    .filter((tag) => /\bclass\s*=\s*["'][^"']*\bdraw-link\b[^"']*["']/i.test(tag))
    .map((tag) => {
      const match = tag.match(/\bhref\s*=\s*(["'])(.*?)\1/i);
      return match ? match[2] : "";
    });
}

async function loadSource(source) {
  if (/^https?:\/\//i.test(source)) {
    const response = await fetch(source, {
      headers: { "User-Agent": "funbox-line-safe-sync" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      throw new Error(`下載原作者頁面失敗：HTTP ${response.status}`);
    }
    return response.text();
  }

  const sourcePath = path.isAbsolute(source) ? source : path.resolve(repoRoot, source);
  return readFile(sourcePath, "utf8");
}

function validateUpstream(html) {
  const markers = {
    page: 'id="page-draws"',
    guide: '<div class="continuous-draw-guide">',
    filters: '<div class="draw-filter-btn-group">',
    panel: '<div class="continuous-draw-panel" id="continuousDrawPanel">',
    list: '<div class="draw-list">',
    script: "/* ===== Funbox 連續抽選模式：依商品開始時間自動判斷 ===== */",
  };

  for (const [key, marker] of Object.entries(markers)) {
    assertExactlyOnce(html, marker, `上游結構 ${key}`);
  }
  assertExactlyOnce(html, "</head>", "</head>");

  if (html.includes("custom/continuous-draw.css") || html.includes("custom/continuous-draw.js")) {
    throw new Error("來源已經包含自訂模組；請改用原作者的 index.html 作為來源");
  }

  const counts = {
    stores: countClassToken(html, "draw-store"),
    items: countClassToken(html, "draw-item"),
    links: extractDrawLinks(html).length,
  };
  if (counts.stores < 1 || counts.items < 1 || counts.links < 1) {
    throw new Error(`找不到完整抽獎資料：店家 ${counts.stores}、品項 ${counts.items}、連結 ${counts.links}`);
  }

  const order = [markers.guide, markers.filters, markers.panel, markers.list].map((marker) => html.indexOf(marker));
  if (!order.every((position, index) => index === 0 || position > order[index - 1])) {
    throw new Error("原作者頁面的篩選器、控制區或抽獎清單順序已改變");
  }

  const scriptMarkerPosition = html.indexOf(markers.script);
  const scriptStart = html.lastIndexOf("<script", scriptMarkerPosition);
  const scriptEndStart = html.indexOf("</script>", scriptMarkerPosition);
  if (scriptStart < 0 || scriptEndStart < 0) {
    throw new Error("找不到原作者連續抽選程式所在的 <script> 區塊");
  }
  const upstreamScript = html.slice(scriptStart, scriptEndStart + "</script>".length);
  const allScripts = html.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi) || [];
  const supportingScripts = allScripts.filter((script) => script !== upstreamScript);
  if (!supportingScripts.length) {
    throw new Error("找不到原作者頁面的其他必要程式");
  }

  const links = extractDrawLinks(html);
  const invalidLinks = links.filter((link) => !/^https:\/\/lin\.ee\/[A-Za-z0-9]+(?:[?#].*)?$/.test(link));
  if (invalidLinks.length) {
    throw new Error(`發現不允許的抽獎網址：${invalidLinks[0]}`);
  }

  return {
    markers,
    counts,
    links,
    pageSha256: sha256(html),
    scriptSha256: sha256(upstreamScript),
    supportingScriptsSha256: sha256(supportingScripts.join("\n<!-- script-boundary -->\n")),
  };
}

async function validateBaseline(validation) {
  const baselinePath = path.join(scriptDir, "upstream-baseline.json");
  let baseline;
  try {
    baseline = JSON.parse(await readFile(baselinePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw new Error(`無法讀取上游基準：${error.message}`);
  }

  if (baseline.continuousDrawScriptSha256 !== validation.scriptSha256) {
    throw new Error(
      "原作者的連續抽選程式已改變。為避免漏掉新邏輯，請先人工比較並更新自訂模組與 upstream-baseline.json",
    );
  }
  if (baseline.supportingScriptsSha256 !== validation.supportingScriptsSha256) {
    throw new Error(
      "原作者的其他頁面程式已改變。為避免自動發布不相容內容，請先人工比較並更新 upstream-baseline.json",
    );
  }
}

function replaceSpan(html, startMarker, endMarker, replacement, label) {
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error(`無法替換 ${label}`);
  }
  return html.slice(0, start) + replacement.trimEnd() + "\n" + html.slice(end);
}

function injectModules(upstreamHtml, uiTemplate, validation) {
  assertExactlyOnce(uiTemplate, UI_SPLIT_MARKER, "介面模組分隔標記");
  const [guideHtml, panelHtml] = uiTemplate.split(UI_SPLIT_MARKER);
  const { markers } = validation;

  let output = upstreamHtml.replace("</head>", `${CSS_REF}\n</head>`);
  output = replaceSpan(output, markers.guide, markers.filters, guideHtml, "使用說明");
  output = replaceSpan(output, markers.panel, markers.list, panelHtml, "連續抽選控制區");

  const scriptMarkerPosition = output.indexOf(markers.script);
  const scriptStart = output.lastIndexOf("<script", scriptMarkerPosition);
  const scriptEndStart = output.indexOf("</script>", scriptMarkerPosition);
  if (scriptStart < 0 || scriptEndStart < 0) {
    throw new Error("找不到原作者連續抽選程式所在的 <script> 區塊");
  }
  output = output.slice(0, scriptStart) + JS_REF + output.slice(scriptEndStart + "</script>".length);

  return output;
}

function validateOutput(output, originalLinks) {
  assertExactlyOnce(output, CSS_REF, "自訂樣式引用");
  assertExactlyOnce(output, JS_REF, "自訂程式引用");

  const requiredIds = [
    "continuousDrawPanel",
    "continuousDrawProgress",
    "continuousDrawStore",
    "continuousDrawProduct",
    "continuousDrawStatus",
    "continuousDrawOpen",
    "continuousDrawNext",
    "continuousDrawSkipStore",
    "continuousDrawAutoToggle",
    "continuousDrawUndo",
    "continuousDrawRestore",
    "continuousDrawStopOverlay",
  ];
  for (const id of requiredIds) {
    assertExactlyOnce(output, `id="${id}"`, `介面元件 ${id}`);
  }

  const outputLinks = extractDrawLinks(output);
  if (JSON.stringify(outputLinks) !== JSON.stringify(originalLinks)) {
    throw new Error("注入模組後的抽獎連結與原作者版本不同，已停止輸出");
  }

  return { links: outputLinks.length };
}

async function copyModules(outputDir) {
  const sourceDir = path.join(repoRoot, "custom");
  const destinationDir = path.join(outputDir, "custom");
  if (path.resolve(sourceDir) === path.resolve(destinationDir)) return;

  await mkdir(destinationDir, { recursive: true });
  await Promise.all(
    MODULE_FILES.filter((name) => name !== "continuous-draw-ui.html").map((name) =>
      copyFile(path.join(sourceDir, name), path.join(destinationDir, name)),
    ),
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const customDir = path.join(repoRoot, "custom");
  const [upstreamHtml, uiTemplate] = await Promise.all([
    loadSource(options.source),
    readFile(path.join(customDir, "continuous-draw-ui.html"), "utf8"),
  ]);
  await Promise.all(MODULE_FILES.map((name) => readFile(path.join(customDir, name), "utf8")));

  const validation = validateUpstream(upstreamHtml);
  await validateBaseline(validation);
  const output = injectModules(upstreamHtml, uiTemplate, validation);
  const result = validateOutput(output, validation.links);

  if (!options.checkOnly) {
    const outputDir = path.dirname(options.output);
    await mkdir(outputDir, { recursive: true });
    await writeFile(options.output, output, "utf8");
    await copyModules(outputDir);
  }

  console.log(JSON.stringify({
    ok: true,
    mode: options.checkOnly ? "check-only" : options.apply ? "apply" : "preview",
    source: options.source,
    output: options.checkOnly ? null : path.relative(repoRoot, options.output).replaceAll("\\", "/"),
    stores: validation.counts.stores,
    items: validation.counts.items,
    drawLinks: result.links,
    upstreamPageSha256: validation.pageSha256,
    upstreamScriptSha256: validation.scriptSha256,
    supportingScriptsSha256: validation.supportingScriptsSha256,
  }, null, 2));
}

main().catch((error) => {
  console.error(`同步失敗：${error.message}`);
  process.exitCode = 1;
});
