import { APP_NAME, APP_VERSION } from '../../config/constants.js';
import type { Env } from '../../config/env.js';

export function renderIndexPage(env: Env): string {
  const prefix = env.API_PREFIX;
  const docsUrl = '/docs';
  const removeUrl = `${prefix}/remove-background`;
  const healthUrl = `${prefix}/health`;
  const readyUrl = `${prefix}/health/ready`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${APP_NAME}</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0b1020;
      --panel: #141a2c;
      --line: #2a334d;
      --text: #eef2ff;
      --muted: #9aa6c3;
      --accent: #6ea8ff;
      --ok: #3dcc8a;
      --bad: #ff6b7a;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font: 16px/1.5 ui-sans-serif, system-ui, Segoe UI, sans-serif;
      background: radial-gradient(1200px 600px at 10% -10%, #1b2a55 0%, transparent 50%), var(--bg);
      color: var(--text);
    }
    main { max-width: 880px; margin: 0 auto; padding: 40px 20px 64px; }
    h1 { font-size: 2rem; letter-spacing: -0.03em; margin: 0 0 8px; }
    p { color: var(--muted); margin: 0 0 16px; }
    .row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin: 18px 0 28px; }
    .pill {
      display: inline-flex; align-items: center; gap: 8px;
      border: 1px solid var(--line); background: var(--panel);
      border-radius: 999px; padding: 6px 12px; font-size: 13px;
    }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: #667; }
    .dot.ok { background: var(--ok); }
    .dot.bad { background: var(--bad); }
    a { color: var(--accent); }
    .grid { display: grid; gap: 16px; }
    @media (min-width: 740px) { .grid { grid-template-columns: 1fr 1fr; } }
    section {
      background: var(--panel); border: 1px solid var(--line);
      border-radius: 16px; padding: 18px;
    }
    h2 { margin: 0 0 10px; font-size: 1.05rem; }
    code, pre {
      font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
      font-size: 12.5px;
    }
    pre {
      margin: 0; overflow: auto; background: #0d1324; border-radius: 10px;
      padding: 12px; color: #d7e3ff;
    }
    label { display: block; font-size: 13px; color: var(--muted); margin: 10px 0 6px; }
    input[type="text"], input[type="file"] {
      width: 100%; color: var(--text);
    }
    input[type="text"] {
      border: 1px solid var(--line); background: #0d1324; border-radius: 10px;
      padding: 10px 12px;
    }
    button {
      margin-top: 14px; border: 0; border-radius: 10px; padding: 10px 14px;
      background: var(--accent); color: #071018; font-weight: 650; cursor: pointer;
    }
    button:disabled { opacity: 0.55; cursor: wait; }
    .preview {
      margin-top: 14px; min-height: 160px; border-radius: 12px;
      background: repeating-conic-gradient(#2b3348 0% 25%, #1b2133 0% 50%) 50% / 18px 18px;
      display: grid; place-items: center; overflow: hidden;
    }
    .preview img { max-width: 100%; max-height: 320px; display: block; }
    .err { color: var(--bad); font-size: 13px; margin-top: 10px; }
    .meta { font-size: 12px; color: var(--muted); margin-top: 8px; }
  </style>
</head>
<body>
  <main>
    <h1>${APP_NAME}</h1>
    <p>Local BiRefNet cutouts. Send <code>x-api-key</code> on every processing request. v${APP_VERSION}</p>
    <div class="row">
      <span class="pill"><span id="dot" class="dot"></span><span id="status">Checking…</span></span>
      <a class="pill" href="${docsUrl}">OpenAPI docs</a>
      <a class="pill" href="${readyUrl}">Readiness</a>
    </div>
    <div class="grid">
      <section>
        <h2>Call the API</h2>
        <pre>curl -X POST ${removeUrl} \\
  -H "x-api-key: $API_KEY" \\
  -F image=@photo.jpg \\
  -F format=png \\
  -F quality=hd \\
  -F responseMode=json</pre>
        <p class="meta">Health checks stay public. <code>POST ${removeUrl}</code> requires the key from <code>API_KEY</code>.</p>
      </section>
      <section>
        <h2>Try a cutout</h2>
        <label for="key">x-api-key</label>
        <input id="key" type="text" autocomplete="off" spellcheck="false" placeholder="Paste API_KEY from your .env" />
        <label for="file">Image</label>
        <input id="file" type="file" accept="image/jpeg,image/png,image/webp" />
        <button id="run" type="button">Remove background</button>
        <div id="err" class="err" hidden></div>
        <div class="preview"><img id="out" alt="" hidden /></div>
        <div id="meta" class="meta"></div>
      </section>
    </div>
  </main>
  <script>
    const healthUrl = ${JSON.stringify(healthUrl)};
    const removeUrl = ${JSON.stringify(removeUrl)};
    const statusEl = document.getElementById('status');
    const dotEl = document.getElementById('dot');
    fetch(healthUrl).then((r) => r.ok ? r.json() : Promise.reject()).then(() => {
      statusEl.textContent = 'API online';
      dotEl.className = 'dot ok';
    }).catch(() => {
      statusEl.textContent = 'API offline';
      dotEl.className = 'dot bad';
    });

    const keyInput = document.getElementById('key');
    keyInput.value = sessionStorage.getItem('bg-api-key') || '';
    document.getElementById('run').addEventListener('click', async () => {
      const file = document.getElementById('file').files[0];
      const key = keyInput.value.trim();
      const err = document.getElementById('err');
      const img = document.getElementById('out');
      const meta = document.getElementById('meta');
      const btn = document.getElementById('run');
      err.hidden = true;
      img.hidden = true;
      meta.textContent = '';
      if (!key) { err.textContent = 'Paste your x-api-key first.'; err.hidden = false; return; }
      if (!file) { err.textContent = 'Choose an image.'; err.hidden = false; return; }
      sessionStorage.setItem('bg-api-key', key);
      const body = new FormData();
      body.set('image', file);
      body.set('format', 'png');
      body.set('quality', 'hd');
      body.set('responseMode', 'binary');
      btn.disabled = true;
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
        meta.textContent = ((Date.now() - started) / 1000).toFixed(1) + 's · ' + (response.headers.get('x-image-id') || 'done');
      } catch (error) {
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
