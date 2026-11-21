/** App shell: library, toolbar, view switching, loading, auto-scroll, print. */
import { parseSong } from '../core/parser';
import type { ParseResult } from '../core/types';
import { defaultSettings, type PlaySettings } from '../core/transpose';
import { renderTabView } from '../views/tabView';
import { renderChordsView } from '../views/chordsView';
import { renderLyricsView } from '../views/lyricsView';
import type { ViewCtx } from '../views/common';
import { esc } from '../views/html';
import { installTooltips } from './tooltip';
import { TAB_HELP_HTML } from './tabHelp';
import { defaultPart, GP_EXT, GpView, loadGp, partOptions, type GpPart, type GpSong } from './gpView';

type View = 'tab' | 'chords' | 'lyrics';

interface Entry {
  id: string;
  fileName: string;
  /** A .gsong file … */
  result?: ParseResult;
  /** … or a Guitar Pro file. */
  gp?: GpSong;
  source: 'library' | 'loaded';
}

interface Prefs {
  view: View;
  fontSize: number;
  theme: 'light' | 'dark' | 'system';
  showStringNames: boolean;
  speed: number;
  last: string | null;
  sidebar: boolean;
  chartPerRow: number;
  chartSize: 's' | 'm' | 'l';
  /** Tab view: stack every guitar part (songs with several guitars). */
  stacked: boolean;
}

const PREFS_KEY = 'songbook.prefs.v1';
const DEFAULT_PREFS: Prefs = { view: 'lyrics', fontSize: 20, theme: 'system', showStringNames: true, speed: 4, last: null, sidebar: true, chartPerRow: 8, chartSize: 'm', stacked: true };

function loadPrefs(): Prefs {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}
function savePrefs(p: Prefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* private mode etc. */ }
}

const baseName = (path: string) => path.split('/').pop() ?? path;

export function startApp(root: HTMLElement, bundled: Record<string, string>, gpFiles: Record<string, string> = {}): void {
  const prefs = loadPrefs();
  const entries: Entry[] = Object.entries(bundled).map(([path, text]) => ({
    id: 'lib:' + baseName(path),
    fileName: baseName(path),
    result: parseSong(text),
    source: 'library',
  }));
  let current: Entry | null = null;
  let settings: PlaySettings | null = null;
  let search = '';
  let scrolling = false;
  let tabWidthOverride: number | null = null;
  let gpView: GpView | null = null;
  let gpPart: GpPart = 'guitars';

  root.innerHTML = `
  <div class="shell${prefs.sidebar ? '' : ' no-sidebar'}">
    <aside class="library" aria-label="Song library">
      <div class="lib-head">
        <h2>Songs</h2>
        <input type="search" class="search" placeholder="Search title or artist" aria-label="Search songs" />
      </div>
      <ul class="song-list"></ul>
      <div class="lib-actions">
        <label class="btn">Open song file<input type="file" class="file-in" accept=".gsong,.gp,.gp3,.gp4,.gp5,.gpx,text/plain" multiple hidden /></label>
        <label class="btn">Open folder<input type="file" class="dir-in" webkitdirectory multiple hidden /></label>
        <p class="muted small">…or drag a .gsong or Guitar Pro file onto the page.</p>
      </div>
    </aside>
    <main class="main">
      <div class="toolbar" role="toolbar" aria-label="Song controls">
        <button class="icon sidebar-toggle" title="Show/hide song list" aria-label="Show or hide song list">☰</button>
        <div class="seg-ctl view-switch" role="tablist" aria-label="View">
          <button data-view="tab" role="tab">Tab</button>
          <button data-view="chords" role="tab">Chords</button>
          <button data-view="lyrics" role="tab">Lyrics</button>
        </div>
        <select class="guitar-sel" aria-label="Guitar part" title="Guitar part" hidden></select>
        <div class="tb-group key-capo" aria-label="Song">
          <span class="lbl" title="Transpose (changes the key)">Key</span>
          <button class="icon tr-down" aria-label="Transpose down" title="Transpose down">−</button>
          <button class="tr-val" title="Transpose amount — click to reset" aria-label="Transpose amount">0</button>
          <button class="icon tr-up" aria-label="Transpose up" title="Transpose up">+</button>
          <span class="lbl">Capo</span>
          <select class="capo-sel" aria-label="Capo">${Array.from({ length: 13 }, (_, i) => `<option value="${i}">${i || '–'}</option>`).join('')}</select>
        </div>
        <div class="tb-group" aria-label="Auto-scroll">
          <button class="icon scroll-btn" aria-label="Start auto-scroll" title="Auto-scroll (space)">▶</button>
          <input type="range" class="speed" min="1" max="10" step="1" aria-label="Scroll speed" title="Scroll speed" />
        </div>
        <span class="tb-spacer"></span>
        <details class="menu settings-menu">
          <summary class="icon" title="Display settings" aria-label="Display settings">⚙</summary>
          <div class="menu-body">
            <div class="menu-row"><span>Text size</span><span class="menu-ctl"><button class="icon fs-down" aria-label="Smaller text">A−</button><span class="fs-val"></span><button class="icon fs-up" aria-label="Bigger text">A+</button></span></div>
            <label class="menu-row"><span>Theme</span><select class="theme-sel"><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
            <label class="menu-row"><span>String names on tab</span><input type="checkbox" class="names" /></label>
            <div class="menu-title">Chord chart</div>
            <label class="menu-row"><span>Bars per row</span><select class="perrow-sel"><option value="0">Per line</option><option value="4">4</option><option value="6">6</option><option value="8">8</option><option value="12">12</option><option value="16">16</option></select></label>
            <label class="menu-row"><span>Size</span><select class="chartsize-sel"><option value="s">Small</option><option value="m">Medium</option><option value="l">Large</option></select></label>
          </div>
        </details>
        <button class="icon help-btn" title="How to read tab" aria-label="How to read tab">?</button>
        <button class="icon print-btn" title="Print" aria-label="Print">⎙</button>
      </div>
      <div class="diagnostics" aria-live="polite"></div>
      <article class="song"></article>
    </main>
    <aside class="help-panel" hidden aria-label="How to read tab">
      <button class="icon help-close" aria-label="Close help">✕</button>
      ${TAB_HELP_HTML}
    </aside>
  </div>
  <div class="drop-overlay" hidden>Drop .gsong or Guitar Pro files to open them</div>`;

  const $ = <T extends Element = HTMLElement>(sel: string) => root.querySelector(sel) as unknown as T;
  const shell = $('.shell');
  const list = $('.song-list');
  const article = $('.song');
  const diag = $('.diagnostics');
  const guitarSel = $<HTMLSelectElement>('.guitar-sel');
  const capoSel = $<HTMLSelectElement>('.capo-sel');
  const speed = $<HTMLInputElement>('.speed');
  const names = $<HTMLInputElement>('.names');
  const helpPanel = $('.help-panel');

  speed.value = String(prefs.speed);
  names.checked = prefs.showStringNames;
  const themeSel = $<HTMLSelectElement>('.theme-sel');
  const perRowSel = $<HTMLSelectElement>('.perrow-sel');
  const chartSizeSel = $<HTMLSelectElement>('.chartsize-sel');
  const menu = $<HTMLDetailsElement>('.settings-menu');
  themeSel.value = prefs.theme;
  perRowSel.value = String(prefs.chartPerRow);
  chartSizeSel.value = prefs.chartSize;

  function applyTheme() {
    const t = prefs.theme === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : prefs.theme;
    document.documentElement.dataset.theme = t;
  }
  applyTheme();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

  function title(e: Entry) {
    return (e.gp ? e.gp.title : e.result?.song.meta.title) || e.fileName;
  }
  function artist(e: Entry) {
    return (e.gp ? e.gp.artist : e.result?.song.meta.artist) || '';
  }
  const isDark = () => document.documentElement.dataset.theme === 'dark';

  function renderList() {
    const q = search.trim().toLowerCase();
    const items = entries
      .filter((e) => !q || [title(e), artist(e), e.fileName].some((s) => s.toLowerCase().includes(q)))
      .sort((a, b) => title(a).localeCompare(title(b)));
    list.innerHTML = items.length
      ? items
          .map((e) => {
            const ds = e.result?.diagnostics ?? [];
            const errs = ds.filter((d) => d.severity === 'error').length;
            const warns = ds.length - errs;
            const badge = errs ? `<span class="badge err" title="${errs} error(s)">${errs}</span>` : warns ? `<span class="badge warn" title="${warns} warning(s)">!</span>` : '';
            return `<li><button class="song-item${e === current ? ' active' : ''}" data-id="${esc(e.id)}">
              <span class="t">${esc(title(e))}</span><span class="a">${esc(artist(e) || e.fileName)}${e.gp ? ' <i class="gp-tag" title="Guitar Pro file: full tab">tab</i>' : ''}</span>${badge}</button></li>`;
          })
          .join('')
      : `<li class="muted small empty">${entries.length ? 'No songs match.' : 'No songs yet. Put .gsong files in songs/ or open one.'}</li>`;
  }

  function measureTabWidth(): number {
    if (tabWidthOverride) return tabWidthOverride;
    const cs = getComputedStyle(article);
    const inner = article.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    return Math.max(20, inner / prefs.fontSize - 0.2);
  }

  function renderDiagnostics(e: Entry) {
    if (!e.result) { diag.innerHTML = ''; return; }
    const ds = e.result.diagnostics;
    if (!ds.length) { diag.innerHTML = ''; return; }
    const errs = ds.filter((d) => d.severity === 'error');
    const warns = ds.filter((d) => d.severity === 'warning');
    const item = (d: (typeof ds)[number]) => {
      const src = e.result!.lines[d.line - 1];
      return `<li class="${d.severity}"><b>Line ${d.line}</b> — ${esc(d.message)}${src !== undefined && src.trim() ? `<pre class="src"><span class="ln">${d.line} │</span> ${esc(src)}</pre>` : ''}</li>`;
    };
    diag.innerHTML = `
      ${errs.length ? `<div class="diag-box err"><h3>${errs.length} error${errs.length > 1 ? 's' : ''} in ${esc(e.fileName)}</h3><p class="small">The song below may be incomplete until these are fixed.</p><ul>${errs.map(item).join('')}</ul></div>` : ''}
      ${warns.length ? `<details class="diag-box warn"><summary>${warns.length} warning${warns.length > 1 ? 's' : ''}</summary><ul>${warns.map(item).join('')}</ul></details>` : ''}`;
  }

  function render() {
    root.querySelectorAll<HTMLButtonElement>('.view-switch button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === prefs.view)));
    $('.fs-val').textContent = String(prefs.fontSize);
    article.style.fontSize = `${prefs.fontSize}px`;
    article.dataset.view = prefs.view;
    renderList();
    const gpMode = !!current?.gp;
    root.querySelectorAll<HTMLButtonElement>('.view-switch button').forEach((b) => { b.disabled = gpMode && b.dataset.view !== 'tab'; });
    $('.key-capo').hidden = gpMode;
    if (!gpMode && gpView) { gpView.destroy(); gpView = null; }
    if (current?.gp) { renderGp(current, current.gp); return; }
    if (!current || !settings || !current.result) {
      diag.innerHTML = '';
      guitarSel.hidden = true;
      article.innerHTML = `<div class="empty-state"><h1>Songbook</h1><p>Pick a song on the left, or drop a <code>.gsong</code> or Guitar Pro file here.</p></div>`;
      return;
    }
    const song = current.result.song;
    guitarSel.hidden = song.guitars.length < 2;
    const canStack = prefs.view === 'tab' && song.guitars.length > 1;
    guitarSel.innerHTML = (canStack ? '<option value="all">All parts (stacked)</option>' : '')
      + song.guitars.map((g, i) => `<option value="${i}">${esc(g.name)}</option>`).join('');
    guitarSel.value = canStack && prefs.stacked ? 'all' : String(settings.guitar);
    capoSel.value = String(settings.capo);
    $('.tr-val').textContent = settings.transpose > 0 ? `+${settings.transpose}` : String(settings.transpose);
    renderDiagnostics(current);
    const ctx: ViewCtx = { song, settings, showStringNames: prefs.showStringNames, tabWidthEm: measureTabWidth(), chartPerRow: prefs.chartPerRow, chartSize: prefs.chartSize, stacked: prefs.view === 'tab' && prefs.stacked };
    article.innerHTML = prefs.view === 'tab' ? renderTabView(ctx) : prefs.view === 'chords' ? renderChordsView(ctx) : renderLyricsView(ctx);
    document.title = `${song.meta.title || current.fileName} — Songbook`;
  }

  /** Guitar Pro song: alphaTab draws it; only the Tab view exists. */
  function renderGp(e: Entry, gp: GpSong) {
    diag.innerHTML = '';
    guitarSel.hidden = false;
    guitarSel.innerHTML = partOptions(gp).map((o) => `<option value="${o.value}">${esc(o.label)}</option>`).join('');
    guitarSel.value = String(gpPart);
    document.title = `${gp.title} — Songbook`;
    if (gpView && article.dataset.gp === e.id) return;
    gpView?.destroy();
    article.dataset.gp = e.id;
    article.innerHTML = `<header class="song-head"><h1>${esc(gp.title)}</h1><p class="artist">${esc(gp.artist)}</p>
      <p class="meta">${gp.score.tempo ? `${gp.score.tempo} BPM · ` : ''}Guitar Pro file · ▶ plays it with a cursor · click a note to start there</p></header>
      <div class="gp-score"></div>`;
    gpView = new GpView(article.querySelector<HTMLElement>('.gp-score')!, gp, gpPart, {
      dark: isDark(), scale: prefs.fontSize / 20, showStringNames: prefs.showStringNames,
      onPlayState: (p) => { scrollBtn.textContent = p ? '❚❚' : '▶'; },
    });
    gpView.speed = speedFactor();
  }
  const speedFactor = () => [0.25, 0.4, 0.5, 0.6, 0.75, 0.85, 1, 1.1, 1.25, 1.5][Number(speed.value) - 1] ?? 1;
  /** Force alphaTab to redraw (theme, size or string-name change). */
  function redrawGp() { if (gpView) { gpView.destroy(); gpView = null; render(); } }

  function select(e: Entry) {
    if (gpView) { gpView.destroy(); gpView = null; }
    delete article.dataset.gp;
    current = e;
    settings = e.result ? defaultSettings(e.result.song) : null;
    if (e.gp) gpPart = defaultPart(e.gp);
    prefs.last = e.id;
    savePrefs(prefs);
    stopScroll();
    render();
    window.scrollTo(0, 0);
  }

  function gpEntry(id: string, fileName: string, bytes: Uint8Array, source: Entry['source']): Entry | null {
    try {
      return { id, fileName, gp: loadGp(bytes, fileName), source };
    } catch (err) {
      diag.innerHTML = `<div class="diag-box err"><h3>Couldn't read ${esc(fileName)}</h3><p class="small">${esc(String((err as Error)?.message ?? err))}</p></div>`;
      return null;
    }
  }

  // Guitar Pro files from songs/ are fetched after start-up (they're binary).
  for (const [path, url] of Object.entries(gpFiles)) {
    fetch(url).then((r) => r.arrayBuffer()).then((buf) => {
      const e = gpEntry('lib:' + baseName(path), baseName(path), new Uint8Array(buf), 'library');
      if (!e) return;
      entries.push(e);
      if (!current && prefs.last === e.id) select(e); else renderList();
    });
  }

  function addFiles(files: File[]) {
    const gs = files.filter((f) => f.name.toLowerCase().endsWith('.gsong') || GP_EXT.test(f.name));
    if (!gs.length) {
      diag.innerHTML = `<div class="diag-box err"><h3>No song files found</h3><p class="small">Open files ending in .gsong, or Guitar Pro files (.gp, .gp5, .gpx…).</p></div>`;
      return;
    }
    Promise.all(gs.map((f) => (GP_EXT.test(f.name) ? f.arrayBuffer() : f.text()).then((data) => ({ f, data })))).then((loaded) => {
      let first: Entry | null = null;
      for (const { f, data } of loaded) {
        const id = 'file:' + ((f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name);
        const entry = typeof data === 'string'
          ? { id, fileName: f.name, result: parseSong(data), source: 'loaded' as const }
          : gpEntry(id, f.name, new Uint8Array(data), 'loaded');
        if (!entry) continue;
        const idx = entries.findIndex((x) => x.id === id);
        if (idx >= 0) entries[idx] = entry; else entries.push(entry);
        first ??= entry;
      }
      if (first) select(first);
    });
  }

  // ---- auto-scroll ----
  let last = 0;
  let carry = 0;
  const scrollBtn = $('.scroll-btn');
  function step(t: number) {
    if (!scrolling) return;
    const dt = last ? (t - last) / 1000 : 0;
    last = t;
    carry += dt * Number(speed.value) * 9;
    const px = Math.floor(carry);
    if (px) { carry -= px; window.scrollBy(0, px); }
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) { stopScroll(); return; }
    requestAnimationFrame(step);
  }
  function startScroll() {
    scrolling = true; last = 0; carry = 0;
    scrollBtn.textContent = '❚❚';
    scrollBtn.setAttribute('aria-label', 'Pause auto-scroll');
    requestAnimationFrame(step);
  }
  function stopScroll() {
    scrolling = false;
    scrollBtn.textContent = '▶';
    scrollBtn.setAttribute('aria-label', 'Start auto-scroll');
  }

  /** ▶ / space: play a Guitar Pro song with its cursor; otherwise (or without audio) auto-scroll. */
  function togglePlay() {
    if (gpView && !scrolling && gpView.playPause()) return;
    scrolling ? stopScroll() : startScroll();
  }

  // ---- events ----
  root.addEventListener('click', (ev) => {
    const t = ev.target as HTMLElement;
    const item = t.closest<HTMLElement>('.song-item');
    if (item) { const e = entries.find((x) => x.id === item.dataset.id); if (e) select(e); return; }
    const vb = t.closest<HTMLElement>('.view-switch button');
    if (vb) { prefs.view = vb.dataset.view as View; savePrefs(prefs); render(); return; }
    if (!t.closest('.settings-menu')) menu.open = false;
    if (!settings && !t.closest('.sidebar-toggle, .help-btn, .help-close, .fs-up, .fs-down, .scroll-btn')) return;
    if (t.closest('.tr-up')) { settings!.transpose = Math.min(11, settings!.transpose + 1); render(); }
    else if (t.closest('.tr-down')) { settings!.transpose = Math.max(-11, settings!.transpose - 1); render(); }
    else if (t.closest('.tr-val')) { settings!.transpose = 0; render(); }
    else if (t.closest('.fs-up')) { prefs.fontSize = Math.min(40, prefs.fontSize + 2); savePrefs(prefs); redrawGp(); render(); }
    else if (t.closest('.fs-down')) { prefs.fontSize = Math.max(12, prefs.fontSize - 2); savePrefs(prefs); redrawGp(); render(); }
    else if (t.closest('.scroll-btn')) { togglePlay(); }
    else if (t.closest('.sidebar-toggle')) { prefs.sidebar = !prefs.sidebar; shell.classList.toggle('no-sidebar', !prefs.sidebar); savePrefs(prefs); render(); }
    else if (t.closest('.help-btn')) { helpPanel.hidden = !helpPanel.hidden; }
    else if (t.closest('.help-close')) { helpPanel.hidden = true; }
    else if (t.closest('.print-btn')) { window.print(); }
  });
  $('.search').addEventListener('input', (e) => { search = (e.target as HTMLInputElement).value; renderList(); });
  guitarSel.addEventListener('change', () => {
    if (current?.gp && gpView) {
      const v = guitarSel.value;
      gpPart = v === 'guitars' || v === 'all' ? v : Number(v);
      gpView.setPart(gpPart);
      return;
    }
    if (!current?.result || !settings) return;
    if (guitarSel.value === 'all') { prefs.stacked = true; savePrefs(prefs); render(); return; }
    if (prefs.view === 'tab') { prefs.stacked = false; savePrefs(prefs); }
    const g = Number(guitarSel.value);
    settings = { ...defaultSettings(current.result.song, g), transpose: settings.transpose };
    render();
  });
  capoSel.addEventListener('change', () => { if (settings) { settings.capo = Number(capoSel.value); render(); } });
  names.addEventListener('change', () => { prefs.showStringNames = names.checked; savePrefs(prefs); redrawGp(); render(); });
  speed.addEventListener('input', () => { prefs.speed = Number(speed.value); savePrefs(prefs); if (gpView) gpView.speed = speedFactor(); });
  themeSel.addEventListener('change', () => { prefs.theme = themeSel.value as Prefs['theme']; savePrefs(prefs); applyTheme(); redrawGp(); });
  perRowSel.addEventListener('change', () => { prefs.chartPerRow = Number(perRowSel.value); savePrefs(prefs); render(); });
  chartSizeSel.addEventListener('change', () => { prefs.chartSize = chartSizeSel.value as Prefs['chartSize']; savePrefs(prefs); render(); });
  $<HTMLInputElement>('.file-in').addEventListener('change', (e) => { const i = e.target as HTMLInputElement; addFiles([...(i.files ?? [])]); i.value = ''; });
  $<HTMLInputElement>('.dir-in').addEventListener('change', (e) => { const i = e.target as HTMLInputElement; addFiles([...(i.files ?? [])]); i.value = ''; });

  const overlay = root.querySelector<HTMLElement>('.drop-overlay')!;
  let dragDepth = 0;
  window.addEventListener('dragenter', (e) => { if (e.dataTransfer?.types.includes('Files')) { dragDepth++; overlay.hidden = false; } });
  window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) overlay.hidden = true; });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault(); dragDepth = 0; overlay.hidden = true;
    addFiles([...(e.dataTransfer?.files ?? [])]);
  });

  document.addEventListener('keydown', (e) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (e.key === ' ' && current) { e.preventDefault(); togglePlay(); }
    if (e.key === 'Escape') helpPanel.hidden = true;
  });
  let resizeTimer = 0;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = window.setTimeout(() => prefs.view === 'tab' && !gpView && render(), 150); });

  // Print: wrap tab to a fixed page width, restore afterwards.
  window.addEventListener('beforeprint', () => { stopScroll(); if (prefs.view === 'tab') { tabWidthOverride = 42; render(); } });
  window.addEventListener('afterprint', () => { if (tabWidthOverride) { tabWidthOverride = null; render(); } });

  installTooltips(document.body);

  const start = entries.find((e) => e.id === prefs.last);
  if (start) select(start); else render();
}
