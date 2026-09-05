import { APP_NAME, APP_VERSION } from '../../config/constants.js';
import type { Env } from '../../config/env.js';

export function renderIndexPage(env: Env): string {
  const prefix = env.API_PREFIX;
  const docsUrl = '/docs';
  const removeUrl = `${prefix}/remove-background`;
  const bulkUrl = `${prefix}/remove-backgrounds`;
  const healthUrl = `${prefix}/health`;
  const readyUrl = `${prefix}/health/ready`;
  const maxMb = env.MAX_FILE_SIZE_MB;
  const maxBulk = env.MAX_BULK_IMAGES;
  const curlCommand = `curl -X POST ${removeUrl} \\
  -H "x-api-key: $API_KEY" \\
  -F image=@photo.jpg \\
  -F format=png \\
  -F quality=hd \\
  -F responseMode=json`;
  const bulkCurlCommand = `curl -X POST ${bulkUrl} \\
  -H "x-api-key: $API_KEY" \\
  -F images=@photo1.jpg \\
  -F images=@photo2.png \\
  -F format=png \\
  -F quality=hd`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${APP_NAME}</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #F8FAFC;
      --card: #FFFFFF;
      --primary: #2563EB;
      --primary-hover: #1D4ED8;
      --primary-light: #EFF6FF;
      --text: #0F172A;
      --muted: #64748B;
      --border: #E2E8F0;
      --ok: #16A34A;
      --ok-bg: #F0FDF4;
      --err: #DC2626;
      --err-bg: #FEF2F2;
      --shadow: 0 1px 2px rgba(15, 23, 42, 0.04), 0 8px 24px rgba(15, 23, 42, 0.04);
      --radius: 16px;
      --radius-sm: 14px;
    }
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }
    html, body { margin: 0; }
    body {
      min-height: 100vh;
      font: 16px/1.5 ui-sans-serif, system-ui, Segoe UI, sans-serif;
      background: var(--bg);
      color: var(--text);
    }
    a { color: var(--primary); text-decoration: none; }
    a:hover { color: var(--primary-hover); }
    button, input, select { font: inherit; }
    :focus-visible {
      outline: 2px solid var(--primary);
      outline-offset: 2px;
    }
    .wrap { max-width: 1120px; margin: 0 auto; padding: 0 20px 48px; }
    .header {
      background: var(--card);
      border-bottom: 1px solid var(--border);
    }
    .header-inner {
      max-width: 1120px;
      margin: 0 auto;
      padding: 14px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      color: inherit;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    .brand-mark {
      width: 34px;
      height: 34px;
      border-radius: 10px;
      background: var(--primary-light);
      color: var(--primary);
      display: grid;
      place-items: center;
      flex: 0 0 auto;
    }
    .nav {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .nav a {
      color: var(--muted);
      font-size: 14px;
      font-weight: 600;
    }
    .nav a:hover { color: var(--text); }
    .ver {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      padding: 4px 10px;
      background: var(--primary-light);
      color: var(--primary);
      font-size: 12px;
      font-weight: 700;
    }
    .hero {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      padding: 28px 0 22px;
    }
    .hero h1 {
      margin: 0 0 8px;
      font-size: clamp(1.45rem, 3vw, 2rem);
      letter-spacing: -0.03em;
      line-height: 1.2;
    }
    .hero p { margin: 0; color: var(--muted); max-width: 38rem; }
    .status {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      border-radius: 999px;
      padding: 7px 12px;
      background: #F1F5F9;
      color: var(--muted);
      font-size: 13px;
      font-weight: 700;
      white-space: nowrap;
      flex: 0 0 auto;
    }
    .status.ok { background: var(--ok-bg); color: var(--ok); }
    .status.bad { background: var(--err-bg); color: var(--err); }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: currentColor;
    }
    .workspace {
      display: grid;
      gap: 18px;
    }
    @media (min-width: 900px) {
      .workspace { grid-template-columns: 1.05fr 0.95fr; }
    }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      padding: 20px;
    }
    .card h2 {
      margin: 0 0 16px;
      font-size: 1.05rem;
      letter-spacing: -0.02em;
    }
    .label {
      display: block;
      margin: 0 0 6px;
      font-size: 13px;
      font-weight: 600;
      color: var(--text);
    }
    .field { position: relative; }
    .field input[type="password"],
    .field input[type="text"] {
      width: 100%;
      border: 1px solid var(--border);
      background: #fff;
      border-radius: var(--radius-sm);
      padding: 11px 44px 11px 12px;
      color: var(--text);
    }
    .field input:focus {
      border-color: var(--primary);
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
      outline: none;
    }
    .icon-btn {
      border: 0;
      background: transparent;
      color: var(--muted);
      padding: 6px;
      border-radius: 8px;
      cursor: pointer;
      display: inline-grid;
      place-items: center;
    }
    .icon-btn:hover { color: var(--text); background: #F8FAFC; }
    .toggle-key {
      position: absolute;
      right: 8px;
      top: 50%;
      transform: translateY(-50%);
    }
    .hint { margin: 6px 0 0; font-size: 13px; color: var(--muted); }
    .hint.err { color: var(--err); }
    .drop {
      margin-top: 16px;
      border: 1.5px dashed #93C5FD;
      background: var(--primary-light);
      border-radius: var(--radius);
      min-height: 168px;
      padding: 22px 16px;
      display: grid;
      place-items: center;
      text-align: center;
      cursor: pointer;
      color: var(--primary);
    }
    .drop:hover, .drop.drag { background: #DBEAFE; border-color: var(--primary); }
    .drop strong { display: block; color: var(--text); margin: 8px 0 2px; }
    .drop span { color: var(--muted); font-size: 13px; }
    .file-row {
      margin-top: 12px;
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 10px 12px;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .thumb {
      width: 42px;
      height: 42px;
      border-radius: 8px;
      object-fit: cover;
      background: #F1F5F9;
      flex: 0 0 auto;
    }
    .file-meta { min-width: 0; flex: 1; }
    .file-meta b, .file-meta small { display: block; }
    .file-meta b {
      font-size: 13px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .file-meta small { color: var(--muted); font-size: 12px; }
    .controls {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-top: 14px;
    }
    select {
      width: 100%;
      border: 1px solid var(--border);
      background: #fff;
      border-radius: 12px;
      padding: 10px 12px;
      color: var(--text);
    }
    .primary {
      width: 100%;
      margin-top: 16px;
      border: 0;
      border-radius: 12px;
      padding: 12px 16px;
      background: var(--primary);
      color: #fff;
      font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    .primary:hover { background: var(--primary-hover); }
    .primary:disabled { opacity: 0.55; cursor: wait; }
    .endpoint {
      display: flex;
      align-items: center;
      gap: 10px;
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 10px 12px;
      background: #F8FAFC;
    }
    .method {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      padding: 3px 8px;
      background: var(--ok-bg);
      color: var(--ok);
      font-size: 11px;
      font-weight: 800;
    }
    .endpoint code {
      flex: 1;
      min-width: 0;
      overflow: auto;
      font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
      font-size: 13px;
    }
    .code {
      position: relative;
      margin-top: 14px;
      background: #0F172A;
      color: #E2E8F0;
      border-radius: 14px;
      padding: 16px 44px 16px 16px;
      overflow: auto;
    }
    .code pre {
      margin: 0;
      font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
      font-size: 12.5px;
      line-height: 1.6;
      white-space: pre;
    }
    .code .kw { color: #93C5FD; }
    .code .flag { color: #FCA5A5; }
    .code .str { color: #86EFAC; }
    .copy-abs {
      position: absolute;
      top: 10px;
      right: 10px;
      color: #CBD5E1;
    }
    .copy-abs:hover { background: #1E293B; color: #fff; }
    .note { margin: 12px 0 0; font-size: 13px; color: var(--muted); }
    .facts {
      display: grid;
      gap: 12px;
      margin-top: 16px;
    }
    .fact {
      display: flex;
      gap: 10px;
      align-items: flex-start;
    }
    .fact-ico {
      width: 32px;
      height: 32px;
      border-radius: 10px;
      background: var(--primary-light);
      color: var(--primary);
      display: grid;
      place-items: center;
      flex: 0 0 auto;
    }
    .fact b { display: block; font-size: 13px; }
    .fact small { color: var(--muted); font-size: 12px; }
    .preview-card { margin-top: 18px; }
    .preview-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 14px;
    }
    .preview-head h2 { margin: 0; }
    .preview-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .ghost, .linkish {
      border: 0;
      background: transparent;
      cursor: pointer;
      font-weight: 700;
      font-size: 14px;
      padding: 8px 10px;
      border-radius: 10px;
    }
    .ghost { color: var(--primary); }
    .ghost:hover { background: var(--primary-light); }
    .linkish { color: var(--text); }
    .linkish:hover { background: #F1F5F9; }
    .ghost:disabled, .linkish:disabled { opacity: 0.4; cursor: not-allowed; }
    .preview-grid {
      display: grid;
      gap: 14px;
    }
    @media (min-width: 740px) {
      .preview-grid { grid-template-columns: 1fr 1fr; }
    }
    .pane h3 {
      margin: 0 0 8px;
      font-size: 13px;
      color: var(--muted);
      font-weight: 700;
    }
    .frame {
      min-height: 240px;
      border: 1px solid var(--border);
      border-radius: 14px;
      overflow: hidden;
      display: grid;
      place-items: center;
      background: #F8FAFC;
    }
    .frame.checker {
      background: repeating-conic-gradient(#E2E8F0 0% 25%, #F8FAFC 0% 50%) 50% / 16px 16px;
    }
    .frame img { max-width: 100%; max-height: 360px; display: block; }
    .empty {
      text-align: center;
      color: var(--muted);
      padding: 28px 16px;
    }
    .empty svg { color: #94A3B8; }
    .empty p { margin: 8px 0 0; font-size: 13px; }
    .banner {
      margin-top: 12px;
      border-radius: 12px;
      padding: 10px 12px;
      font-size: 13px;
    }
    .banner.err { background: var(--err-bg); color: var(--err); }
    .banner.ok { background: var(--ok-bg); color: var(--ok); }
    .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }
    .tabs {
      display: flex;
      gap: 6px;
      margin: 0 0 16px;
      padding: 4px;
      background: #F1F5F9;
      border-radius: 12px;
    }
    .tab {
      flex: 1;
      border: 0;
      background: transparent;
      color: var(--muted);
      font-weight: 700;
      font-size: 13px;
      padding: 8px 10px;
      border-radius: 9px;
      cursor: pointer;
    }
    .tab.active { background: #fff; color: var(--text); box-shadow: var(--shadow); }
    .check-row {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      margin-top: 14px;
      padding: 10px 12px;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: #F8FAFC;
    }
    .check-row input { margin-top: 3px; accent-color: var(--primary); }
    .check-row span { font-size: 13px; font-weight: 700; }
    .check-row small { display: block; color: var(--muted); font-weight: 500; }
    .counter {
      margin: 10px 0 0;
      font-size: 13px;
      font-weight: 700;
      color: var(--muted);
    }
    .batch-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(148px, 1fr));
      gap: 10px;
      margin-top: 12px;
    }
    .batch-card {
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
      background: #fff;
      min-width: 0;
    }
    .batch-thumb {
      aspect-ratio: 1;
      background: repeating-conic-gradient(#E2E8F0 0% 25%, #F8FAFC 0% 50%) 50% / 14px 14px;
      display: grid;
      place-items: center;
      overflow: hidden;
    }
    .batch-thumb img { width: 100%; height: 100%; object-fit: contain; display: block; }
    .batch-body { padding: 8px; }
    .batch-body b, .batch-body small { display: block; }
    .batch-body b {
      font-size: 12px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .batch-body small { color: var(--muted); font-size: 11px; }
    .status-pill {
      display: inline-flex;
      margin-top: 6px;
      border-radius: 999px;
      padding: 2px 7px;
      font-size: 11px;
      font-weight: 700;
      background: #F1F5F9;
      color: var(--muted);
    }
    .status-pill.ok { background: var(--ok-bg); color: var(--ok); }
    .status-pill.bad { background: var(--err-bg); color: var(--err); }
    .status-pill.busy { background: var(--primary-light); color: var(--primary); }
    .batch-actions { display: flex; gap: 4px; margin-top: 8px; flex-wrap: wrap; }
    .tiny {
      border: 0;
      background: var(--primary-light);
      color: var(--primary);
      border-radius: 8px;
      padding: 5px 7px;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
    }
    .tiny.danger { background: var(--err-bg); color: var(--err); }
    .tiny:disabled { opacity: 0.4; cursor: not-allowed; }
    .progress {
      margin-top: 6px;
      height: 4px;
      border-radius: 999px;
      background: #E2E8F0;
      overflow: hidden;
    }
    .progress > span {
      display: block;
      height: 100%;
      width: 35%;
      background: var(--primary);
      animation: load 1s linear infinite;
    }
    @keyframes load { from { transform: translateX(-120%); } to { transform: translateX(320%); } }
    .drop.disabled { opacity: 0.5; pointer-events: none; }
    @media (max-width: 720px) {
      .header-inner { flex-wrap: wrap; }
      .hero { flex-direction: column; }
      .controls { grid-template-columns: 1fr; }
      .preview-head { flex-direction: column; align-items: flex-start; }
      .preview-actions, .primary { width: 100%; }
      .preview-actions .ghost, .preview-actions .linkish { flex: 1; }
    }
  </style>
</head>
<body>
  <header class="header">
    <div class="header-inner">
      <a class="brand" href="/">
        <span class="brand-mark" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M12 2.6 20.4 7.4v9.2L12 21.4 3.6 16.6V7.4L12 2.6Z" stroke="currentColor" stroke-width="1.8"/>
            <path d="M8 12.2 12 8.4l4 3.8-4 3.8-4-3.8Z" fill="currentColor"/>
          </svg>
        </span>
        ${APP_NAME}
      </a>
      <nav class="nav">
        <a href="${docsUrl}">API Docs</a>
        <a href="${readyUrl}">Status</a>
        <span class="ver">v${APP_VERSION}</span>
      </nav>
    </div>
  </header>

  <main class="wrap">
    <section class="hero">
      <div>
        <h1>Remove backgrounds with one API call</h1>
        <p>Send one image or a batch of up to ${maxBulk}. Text, logos, and badges stay in the cutout.</p>
      </div>
      <div id="status" class="status">
        <span id="dot" class="dot"></span>
        <span id="status-text">Checking…</span>
      </div>
    </section>

    <div class="workspace">
      <section class="card">
        <h2>Try the API</h2>
        <div class="tabs" role="tablist">
          <button id="tab-single" class="tab active" type="button" role="tab" aria-selected="true">Single image</button>
          <button id="tab-batch" class="tab" type="button" role="tab" aria-selected="false">Batch up to ${maxBulk}</button>
        </div>
        <label class="label" for="key">x-api-key</label>
        <div class="field">
          <input id="key" type="password" autocomplete="off" spellcheck="false" placeholder="Paste API_KEY from your .env" />
          <button id="toggle-key" class="icon-btn toggle-key" type="button" aria-label="Show API key">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M2.4 12S6 6.5 12 6.5 21.6 12 21.6 12 18 17.5 12 17.5 2.4 12 2.4 12Z" stroke="currentColor" stroke-width="1.7"/>
              <circle cx="12" cy="12" r="2.6" stroke="currentColor" stroke-width="1.7"/>
            </svg>
          </button>
        </div>
        <p id="key-err" class="hint" hidden></p>

        <div id="panel-single">
        <label class="drop" id="drop" for="file">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path d="M12 16V5M12 5l-3.4 3.4M12 5l3.4 3.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            <path d="M5 16.5V18a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          </svg>
          <strong>Drag &amp; drop an image here</strong>
          <span>or click to browse</span>
          <span>PNG, JPG, WEBP up to ${maxMb} MB</span>
        </label>
        <input id="file" class="sr" type="file" accept="image/jpeg,image/png,image/webp" />

        <div id="file-row" class="file-row" hidden>
          <img id="file-thumb" class="thumb" alt="" />
          <div class="file-meta">
            <b id="file-name"></b>
            <small id="file-size"></small>
          </div>
          <button id="clear-file" class="icon-btn" type="button" aria-label="Remove file">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
        </div>

        <div id="panel-batch" hidden>
          <label class="drop" id="batch-drop" for="batch-file">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path d="M12 16V5M12 5l-3.4 3.4M12 5l3.4 3.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
              <path d="M5 16.5V18a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            </svg>
            <strong>Drag &amp; drop up to ${maxBulk} images</strong>
            <span>or click to browse</span>
            <span>Select up to ${maxBulk} images · PNG, JPG, WEBP</span>
          </label>
          <input id="batch-file" class="sr" type="file" accept="image/jpeg,image/png,image/webp" multiple />
          <p id="batch-counter" class="counter">0/${maxBulk} selected</p>
          <p id="batch-limit" class="hint err" hidden>You can select up to ${maxBulk} images.</p>
          <div id="batch-grid" class="batch-grid"></div>
          <div class="preview-actions" style="margin-top:12px">
            <button id="batch-clear" class="linkish" type="button" disabled>Clear all</button>
            <button id="batch-download-all" class="ghost" type="button" disabled>Download All</button>
          </div>
        </div>

        <div class="controls">
          <div>
            <label class="label" for="quality">Quality</label>
            <select id="quality">
              <option value="hd" selected>HD (High)</option>
              <option value="fast">Fast</option>
            </select>
          </div>
          <div>
            <label class="label" for="format">Output format</label>
            <select id="format">
              <option value="png" selected>PNG</option>
              <option value="webp">WEBP</option>
            </select>
          </div>
        </div>
        <div class="controls">
          <div>
            <label class="label" for="mode">Mode</label>
            <select id="mode">
              <option value="auto" selected>Auto</option>
              <option value="person">Person</option>
              <option value="product">Product</option>
              <option value="document">Document</option>
              <option value="graphic">Graphic / poster</option>
            </select>
          </div>
        </div>
        <label class="check-row" for="preserve-text">
          <input id="preserve-text" type="checkbox" checked />
          <span>Preserve text, logos, and foreground graphics<small>Keeps Urdu, Arabic, English text, badges, and stickers in the cutout.</small></span>
        </label>

        <button id="run" class="primary" type="button">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M4 12 20 5l-6.2 14L11 13 4 12Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
          </svg>
          <span id="run-label">Remove Background</span>
        </button>
      </section>

      <section class="card">
        <h2>Quick Integration</h2>
        <p class="label">Endpoint</p>
        <div class="endpoint">
          <span class="method">POST</span>
          <code>${removeUrl}</code>
          <button id="copy-endpoint" class="icon-btn" type="button" aria-label="Copy endpoint">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <rect x="8" y="8" width="11" height="11" rx="2" stroke="currentColor" stroke-width="1.7"/>
              <path d="M5 15.2V6.8A1.8 1.8 0 0 1 6.8 5H15" stroke="currentColor" stroke-width="1.7"/>
            </svg>
          </button>
        </div>
        <div class="code">
          <button id="copy-curl" class="icon-btn copy-abs" type="button" aria-label="Copy cURL">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <rect x="8" y="8" width="11" height="11" rx="2" stroke="currentColor" stroke-width="1.7"/>
              <path d="M5 15.2V6.8A1.8 1.8 0 0 1 6.8 5H15" stroke="currentColor" stroke-width="1.7"/>
            </svg>
          </button>
          <pre><span class="kw">curl</span> <span class="flag">-X</span> <span class="str">POST</span> ${removeUrl} \\
  <span class="flag">-H</span> <span class="str">"x-api-key: $API_KEY"</span> \\
  <span class="flag">-F</span> image=@photo.jpg \\
  <span class="flag">-F</span> format=png \\
  <span class="flag">-F</span> quality=hd \\
  <span class="flag">-F</span> responseMode=json</pre>
        </div>
        <p class="label">Bulk endpoint</p>
        <div class="endpoint">
          <span class="method">POST</span>
          <code>${bulkUrl}</code>
          <button id="copy-bulk-endpoint" class="icon-btn" type="button" aria-label="Copy bulk endpoint">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <rect x="8" y="8" width="11" height="11" rx="2" stroke="currentColor" stroke-width="1.7"/>
              <path d="M5 15.2V6.8A1.8 1.8 0 0 1 6.8 5H15" stroke="currentColor" stroke-width="1.7"/>
            </svg>
          </button>
        </div>
        <div class="code">
          <button id="copy-bulk-curl" class="icon-btn copy-abs" type="button" aria-label="Copy bulk cURL">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <rect x="8" y="8" width="11" height="11" rx="2" stroke="currentColor" stroke-width="1.7"/>
              <path d="M5 15.2V6.8A1.8 1.8 0 0 1 6.8 5H15" stroke="currentColor" stroke-width="1.7"/>
            </svg>
          </button>
          <pre><span class="kw">curl</span> <span class="flag">-X</span> <span class="str">POST</span> ${bulkUrl} \\
  <span class="flag">-H</span> <span class="str">"x-api-key: $API_KEY"</span> \\
  <span class="flag">-F</span> images=@photo1.jpg \\
  <span class="flag">-F</span> images=@photo2.png \\
  <span class="flag">-F</span> format=png \\
  <span class="flag">-F</span> quality=hd</pre>
        </div>
        <p class="note">Health checks stay public. <code>POST ${removeUrl}</code> and <code>POST ${bulkUrl}</code> require the key from <code>API_KEY</code>.</p>
        <div class="facts">
          <div class="fact">
            <span class="fact-ico" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <rect x="4" y="5" width="16" height="14" rx="2" stroke="currentColor" stroke-width="1.7"/>
                <path d="m8 14 2.4-2.6L13 14l3-3.4" stroke="currentColor" stroke-width="1.7"/>
              </svg>
            </span>
            <div><b>PNG, JPG, WEBP</b><small>Supported formats</small></div>
          </div>
          <div class="fact">
            <span class="fact-ico" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M7 17h10M8.5 17 7 7h10l-1.5 10H8.5Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
              </svg>
            </span>
            <div><b>Up to ${maxMb} MB</b><small>Maximum file size</small></div>
          </div>
          <div class="fact">
            <span class="fact-ico" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="m12 4 1.8 5.4H20l-5 3.6 1.9 5.5L12 15.8 7.1 18.5 9 13 4 9.4h6.2L12 4Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
              </svg>
            </span>
            <div><b>HD output</b><small>High-quality results</small></div>
          </div>
          <div class="fact">
            <span class="fact-ico" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <rect x="4" y="6" width="7" height="7" rx="1.4" stroke="currentColor" stroke-width="1.7"/>
                <rect x="13" y="6" width="7" height="7" rx="1.4" stroke="currentColor" stroke-width="1.7"/>
                <rect x="4" y="15" width="7" height="3" rx="1.2" stroke="currentColor" stroke-width="1.7"/>
                <rect x="13" y="15" width="7" height="3" rx="1.2" stroke="currentColor" stroke-width="1.7"/>
              </svg>
            </span>
            <div><b>Up to ${maxBulk} images</b><small>Bulk remove in one call</small></div>
          </div>
        </div>
      </section>
    </div>

    <section class="card preview-card">
      <div class="preview-head">
        <h2>Preview</h2>
        <div class="preview-actions">
          <button id="download" class="ghost" type="button" disabled>Download PNG</button>
          <button id="reset" class="linkish" type="button">Reset</button>
        </div>
      </div>
      <div class="preview-grid">
        <div class="pane">
          <h3>Original</h3>
          <div class="frame">
            <img id="original" alt="Original image" hidden />
            <div id="original-empty" class="empty">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <rect x="4" y="5" width="16" height="14" rx="2" stroke="currentColor" stroke-width="1.7"/>
                <circle cx="9" cy="10" r="1.4" fill="currentColor"/>
                <path d="m8 16 3-3.2 2 2.1 3-3.4 2 4.5H8Z" fill="currentColor"/>
              </svg>
              <p>Upload an image to see the original here.</p>
            </div>
          </div>
        </div>
        <div class="pane">
          <h3>Background Removed</h3>
          <div class="frame checker">
            <img id="out" alt="Background removed" hidden />
            <div id="result-empty" class="empty">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path d="M5 16V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8" stroke="currentColor" stroke-width="1.7"/>
                <path d="M8 19h8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
              </svg>
              <p>The transparent cutout will appear here.</p>
            </div>
          </div>
        </div>
      </div>
      <div id="err" class="banner err" hidden></div>
      <div id="meta" class="banner ok" hidden></div>
    </section>
  </main>

  <script>
    const healthUrl = ${JSON.stringify(healthUrl)};
    const removeUrl = ${JSON.stringify(removeUrl)};
    const bulkUrl = ${JSON.stringify(bulkUrl)};
    const curlCommand = ${JSON.stringify(curlCommand)};
    const bulkCurlCommand = ${JSON.stringify(bulkCurlCommand)};
    const statusEl = document.getElementById('status');
    const statusText = document.getElementById('status-text');
    fetch(healthUrl).then((r) => r.ok ? r.json() : Promise.reject()).then(() => {
      statusText.textContent = 'API Online';
      statusEl.className = 'status ok';
    }).catch(() => {
      statusText.textContent = 'API Offline';
      statusEl.className = 'status bad';
    });

    const keyInput = document.getElementById('key');
    const keyErr = document.getElementById('key-err');
    const fileInput = document.getElementById('file');
    const drop = document.getElementById('drop');
    const fileRow = document.getElementById('file-row');
    const fileThumb = document.getElementById('file-thumb');
    const original = document.getElementById('original');
    const originalEmpty = document.getElementById('original-empty');
    const resultEmpty = document.getElementById('result-empty');
    const downloadBtn = document.getElementById('download');
    const qualityInput = document.getElementById('quality');
    const formatInput = document.getElementById('format');
    const modeInput = document.getElementById('mode');
    const preserveTextInput = document.getElementById('preserve-text');
    const maxBulk = ${maxBulk};
    const tabSingle = document.getElementById('tab-single');
    const tabBatch = document.getElementById('tab-batch');
    const panelSingle = document.getElementById('panel-single');
    const panelBatch = document.getElementById('panel-batch');
    const runLabel = document.getElementById('run-label');
    let view = 'single';
    keyInput.value = sessionStorage.getItem('bg-api-key') || '';

    function setView(next) {
      view = next;
      const batch = next === 'batch';
      tabSingle.classList.toggle('active', !batch);
      tabBatch.classList.toggle('active', batch);
      tabSingle.setAttribute('aria-selected', String(!batch));
      tabBatch.setAttribute('aria-selected', String(batch));
      panelSingle.hidden = batch;
      panelBatch.hidden = !batch;
      runLabel.textContent = batch ? 'Remove Backgrounds' : 'Remove Background';
    }
    tabSingle.addEventListener('click', () => setView('single'));
    tabBatch.addEventListener('click', () => setView('batch'));

    document.getElementById('toggle-key').addEventListener('click', () => {
      const hidden = keyInput.type === 'password';
      keyInput.type = hidden ? 'text' : 'password';
      document.getElementById('toggle-key').setAttribute('aria-label', hidden ? 'Hide API key' : 'Show API key');
    });

    function formatSize(bytes) {
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
      return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    }

    function showFile(file) {
      const url = URL.createObjectURL(file);
      fileThumb.src = url;
      original.src = url;
      original.hidden = false;
      originalEmpty.hidden = true;
      document.getElementById('file-name').textContent = file.name;
      document.getElementById('file-size').textContent = formatSize(file.size);
      fileRow.hidden = false;
    }

    function clearFile() {
      fileInput.value = '';
      fileRow.hidden = true;
      original.hidden = true;
      originalEmpty.hidden = false;
      original.removeAttribute('src');
      fileThumb.removeAttribute('src');
    }

    fileInput.addEventListener('change', () => {
      const file = fileInput.files[0];
      if (file) showFile(file);
    });
    document.getElementById('clear-file').addEventListener('click', (event) => {
      event.preventDefault();
      clearFile();
    });
    ;['dragenter', 'dragover'].forEach((type) => {
      drop.addEventListener(type, (event) => {
        event.preventDefault();
        drop.classList.add('drag');
      });
    });
    ;['dragleave', 'drop'].forEach((type) => {
      drop.addEventListener(type, (event) => {
        event.preventDefault();
        drop.classList.remove('drag');
      });
    });
    drop.addEventListener('drop', (event) => {
      const file = event.dataTransfer && event.dataTransfer.files[0];
      if (!file) return;
      const transfer = new DataTransfer();
      transfer.items.add(file);
      fileInput.files = transfer.files;
      showFile(file);
    });

    async function copyText(value) {
      await navigator.clipboard.writeText(value);
    }
    document.getElementById('copy-endpoint').addEventListener('click', () => copyText(removeUrl));
    document.getElementById('copy-curl').addEventListener('click', () => copyText(curlCommand));
    document.getElementById('copy-bulk-endpoint').addEventListener('click', () => copyText(bulkUrl));
    document.getElementById('copy-bulk-curl').addEventListener('click', () => copyText(bulkCurlCommand));

    document.getElementById('reset').addEventListener('click', () => {
      clearFile();
      const img = document.getElementById('out');
      img.hidden = true;
      img.removeAttribute('src');
      resultEmpty.hidden = false;
      downloadBtn.disabled = true;
      document.getElementById('err').hidden = true;
      document.getElementById('meta').hidden = true;
      keyErr.hidden = true;
    });

    downloadBtn.addEventListener('click', () => {
      const img = document.getElementById('out');
      if (!img.src) return;
      const link = document.createElement('a');
      link.href = img.src;
      link.download = 'background-removed.' + (formatInput.value || 'png');
      link.click();
    });

    const batchFile = document.getElementById('batch-file');
    const batchDrop = document.getElementById('batch-drop');
    const batchGrid = document.getElementById('batch-grid');
    const batchCounter = document.getElementById('batch-counter');
    const batchLimit = document.getElementById('batch-limit');
    const batchClear = document.getElementById('batch-clear');
    const batchDownloadAll = document.getElementById('batch-download-all');
    const batchItems = [];
    let zipUrl = '';

    function renderBatch() {
      batchCounter.textContent = batchItems.length + '/' + maxBulk + ' selected';
      batchDrop.classList.toggle('disabled', batchItems.length >= maxBulk);
      batchFile.disabled = batchItems.length >= maxBulk;
      batchClear.disabled = batchItems.length === 0;
      batchDownloadAll.disabled = !zipUrl && !batchItems.some((item) => item.status === 'completed');
      batchGrid.innerHTML = batchItems.map((item, index) => {
        const pill = item.status === 'completed' ? 'ok' : item.status === 'failed' ? 'bad' : item.status === 'processing' ? 'busy' : '';
        const progress = item.status === 'processing' ? '<div class="progress"><span></span></div>' : '';
        const download = item.status === 'completed' && item.url
          ? '<button class="tiny" data-act="dl" data-i="' + index + '" type="button">Download</button>'
          : '';
        const retry = item.status === 'failed'
          ? '<button class="tiny" data-act="retry" data-i="' + index + '" type="button">Retry</button>'
          : '';
        return '<article class="batch-card"><div class="batch-thumb"><img src="' + item.preview + '" alt=""></div><div class="batch-body"><b>' + escapeHtml(item.file.name) + '</b><small>' + formatSize(item.file.size) + '</small><span class="status-pill ' + pill + '">' + (item.message || item.status) + '</span>' + progress + '<div class="batch-actions"><button class="tiny danger" data-act="rm" data-i="' + index + '" type="button">Remove</button>' + retry + download + '</div></div></div></article>';
      }).join('');
    }

    function escapeHtml(value) {
      return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    }

    function addBatchFiles(fileList) {
      batchLimit.hidden = true;
      const incoming = Array.from(fileList || []);
      if (batchItems.length + incoming.length > maxBulk) {
        batchLimit.hidden = false;
        return;
      }
      for (const file of incoming) {
        if (batchItems.length >= maxBulk) {
          batchLimit.hidden = false;
          break;
        }
        batchItems.push({
          file,
          preview: URL.createObjectURL(file),
          status: 'ready',
          message: 'Ready',
          url: '',
        });
      }
      renderBatch();
    }

    batchFile.addEventListener('change', () => {
      addBatchFiles(batchFile.files);
      batchFile.value = '';
    });
    ;['dragenter', 'dragover'].forEach((type) => {
      batchDrop.addEventListener(type, (event) => {
        event.preventDefault();
        batchDrop.classList.add('drag');
      });
    });
    ;['dragleave', 'drop'].forEach((type) => {
      batchDrop.addEventListener(type, (event) => {
        event.preventDefault();
        batchDrop.classList.remove('drag');
      });
    });
    batchDrop.addEventListener('drop', (event) => {
      addBatchFiles(event.dataTransfer && event.dataTransfer.files);
    });
    batchGrid.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-act]');
      if (!button) return;
      const index = Number(button.getAttribute('data-i'));
      const item = batchItems[index];
      if (!item) return;
      if (button.getAttribute('data-act') === 'rm') {
        batchItems.splice(index, 1);
        zipUrl = '';
        renderBatch();
      }
      if (button.getAttribute('data-act') === 'dl' && item.url) {
        const link = document.createElement('a');
        link.href = item.url;
        link.download = 'background-removed-' + item.file.name.replace(/\\.[^.]+$/, '') + '.' + (formatInput.value || 'png');
        link.click();
      }
      if (button.getAttribute('data-act') === 'retry') {
        retryOne(item);
      }
    });
    batchClear.addEventListener('click', () => {
      batchItems.length = 0;
      zipUrl = '';
      batchLimit.hidden = true;
      renderBatch();
    });
    batchDownloadAll.addEventListener('click', () => {
      if (zipUrl) {
        const link = document.createElement('a');
        link.href = zipUrl;
        link.download = 'background-removed-images.zip';
        link.click();
      }
    });

    function sharedFields(body) {
      body.set('format', formatInput.value || 'png');
      body.set('quality', qualityInput.value || 'hd');
      body.set('mode', modeInput.value || 'auto');
      body.set('preserveText', preserveTextInput.checked ? 'true' : 'false');
    }

    async function retryOne(item) {
      const key = keyInput.value.trim();
      if (!key) return;
      item.status = 'processing';
      item.message = 'Processing';
      renderBatch();
      try {
        const body = new FormData();
        body.set('image', item.file);
        sharedFields(body);
        body.set('responseMode', 'json');
        const response = await fetch(removeUrl, { method: 'POST', headers: { 'x-api-key': key }, body });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error?.message || 'Retry failed');
        item.status = 'completed';
        item.message = 'Completed';
        item.url = payload.data.result.url;
      } catch (error) {
        item.status = 'failed';
        item.message = error instanceof Error ? error.message : 'Failed';
      }
      renderBatch();
    }

    document.getElementById('run').addEventListener('click', async () => {
      const key = keyInput.value.trim();
      const err = document.getElementById('err');
      const img = document.getElementById('out');
      const meta = document.getElementById('meta');
      const btn = document.getElementById('run');
      err.hidden = true;
      meta.hidden = true;
      keyErr.hidden = true;
      if (!key) {
        keyErr.textContent = 'Enter a valid API key.';
        keyErr.hidden = false;
        keyErr.className = 'hint err';
        return;
      }
      sessionStorage.setItem('bg-api-key', key);

      if (view === 'batch') {
        if (batchItems.length === 0) { err.textContent = 'Choose 1 to ' + maxBulk + ' images.'; err.hidden = false; return; }
        const body = new FormData();
        for (const item of batchItems) body.append('images', item.file);
        sharedFields(body);
        batchItems.forEach((item) => { item.status = 'processing'; item.message = 'Processing'; });
        zipUrl = '';
        renderBatch();
        btn.disabled = true;
        const started = Date.now();
        try {
          const response = await fetch(bulkUrl, { method: 'POST', headers: { 'x-api-key': key }, body });
          const payload = await response.json();
          if (!response.ok) throw new Error(payload?.error?.message || ('Request failed (' + response.status + ')'));
          for (const result of payload.data.items || []) {
            const item = batchItems[result.index];
            if (!item) continue;
            if (result.status === 'completed') {
              item.status = 'completed';
              item.message = result.textPreserved ? 'Completed · text kept' : 'Completed';
              item.url = result.result.url;
            } else {
              item.status = 'failed';
              item.message = result.message || result.errorCode || 'Failed';
            }
          }
          zipUrl = payload.data.zip && payload.data.zip.url ? payload.data.zip.url : '';
          meta.textContent = payload.data.completed + '/' + payload.data.count + ' completed · ' + ((Date.now() - started) / 1000).toFixed(1) + 's';
          meta.hidden = false;
          if (payload.data.failed > 0) {
            err.textContent = payload.data.failed + ' image(s) failed. Use Retry on those cards.';
            err.hidden = false;
          }
        } catch (error) {
          batchItems.forEach((item) => {
            if (item.status === 'processing') {
              item.status = 'failed';
              item.message = error instanceof Error ? error.message : 'Failed';
            }
          });
          err.textContent = error instanceof Error ? error.message : 'Request failed';
          err.hidden = false;
        } finally {
          renderBatch();
          btn.disabled = false;
        }
        return;
      }

      const file = fileInput.files[0];
      if (!file) { err.textContent = 'Choose an image.'; err.hidden = false; return; }
      const body = new FormData();
      body.set('image', file);
      sharedFields(body);
      body.set('responseMode', 'binary');
      btn.disabled = true;
      resultEmpty.querySelector('p').textContent = 'Processing image…';
      resultEmpty.hidden = false;
      img.hidden = true;
      const started = Date.now();
      try {
        const response = await fetch(removeUrl, { method: 'POST', headers: { 'x-api-key': key }, body });
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error?.message || ('Request failed (' + response.status + ')'));
        }
        const blob = await response.blob();
        img.src = URL.createObjectURL(blob);
        img.hidden = false;
        resultEmpty.hidden = true;
        downloadBtn.disabled = false;
        meta.textContent = ((Date.now() - started) / 1000).toFixed(1) + 's · ' + (response.headers.get('x-image-id') || 'done');
        meta.hidden = false;
      } catch (error) {
        resultEmpty.querySelector('p').textContent = 'The transparent cutout will appear here.';
        resultEmpty.hidden = false;
        err.textContent = error instanceof Error ? error.message : 'Request failed';
        err.hidden = false;
      } finally {
        btn.disabled = false;
      }
    });
  </script>
</body>
</html>`;
}
