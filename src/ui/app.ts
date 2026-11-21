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

type View = 'tab' | 'chords' | 'lyrics';

interface Entry {
  id: string;
  fileName: string;
  result: ParseResult;
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

export function startApp(root: HTMLElement, bundled: Record<string, string>): void {
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

  root.innerHTML = `
  <div class="shell${prefs.sidebar ? '' : ' no-sidebar'}">
    <aside class="library" aria-label="Song library">
      <div class="lib-head">
        <h2>Songs</h2>
        <input type="search" class="search" placeholder="Search title or artist" aria-label="Search songs" />
      </div>
      <ul class="song-list"></ul>
      <div class="lib-actions">
        <label class="btn">Open .gsong<input type="file" class="file-in" accept=".gsong,text/plain" multiple hidden /></label>
        <label class="btn">Open folder<input type="file" class="dir-in" webkitdirectory multiple hidden /></label>
        <p class="muted small">…or drag a .gsong file onto the page.</p>
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
        <div class="tb-group" aria-label="Song">
          <select class="guitar-sel" aria-label="Guitar part" title="Guitar part" hidden></select>
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
  <div class="drop-overlay" hidden>Drop .gsong files to open them</div>`;

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
    return e.result.song.meta.title || e.fileName;
  }

  function renderList() {
    const q = search.trim().toLowerCase();
    const items = entries
      .filter((e) => !q || [title(e), e.result.song.meta.artist, e.fileName].some((s) => s.toLowerCase().includes(q)))
      .sort((a, b) => title(a).localeCompare(title(b)));
    list.innerHTML = items.length
      ? items
          .map((e) => {
            const errs = e.result.diagnostics.filter((d) => d.severity === 'error').length;
            const warns = e.result.diagnostics.length - errs;
            const badge = errs ? `<span class="badge err" title="${errs} error(s)">${errs}</span>` : warns ? `<span class="badge warn" title="${warns} warning(s)">!</span>` : '';
            return `<li><button class="song-item${e === current ? ' active' : ''}" data-id="${esc(e.id)}">
              <span class="t">${esc(title(e))}</span><span class="a">${esc(e.result.song.meta.artist || e.fileName)}</span>${badge}</button></li>`;
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
    const ds = e.result.diagnostics;
    if (!ds.length) { diag.innerHTML = ''; return; }
    const errs = ds.filter((d) => d.severity === 'error');
    const warns = ds.filter((d) => d.severity === 'warning');
    const item = (d: (typeof ds)[number]) => {
      const src = e.result.lines[d.line - 1];
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
    if (!current || !settings) {
      diag.innerHTML = '';
      article.innerHTML = `<div class="empty-state"><h1>Songbook</h1><p>Pick a song on the left, or drop a <code>.gsong</code> file here.</p></div>`;
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

  function select(e: Entry) {
    current = e;
    settings = defaultSettings(e.result.song);
    prefs.last = e.id;
    savePrefs(prefs);
    stopScroll();
    render();
    window.scrollTo(0, 0);
  }

  function addFiles(files: File[]) {
    const gs = files.filter((f) => f.name.toLowerCase().endsWith('.gsong'));
    if (!gs.length) {
      diag.innerHTML = `<div class="diag-box err"><h3>No .gsong files found</h3><p class="small">Only files ending in .gsong can be opened.</p></div>`;
      return;
    }
    Promise.all(gs.map((f) => f.text().then((text) => ({ f, text })))).then((loaded) => {
      let first: Entry | null = null;
      for (const { f, text } of loaded) {
        const id = 'file:' + ((f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name);
        const entry: Entry = { id, fileName: f.name, result: parseSong(text), source: 'loaded' };
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

  // ---- events ----
  root.addEventListener('click', (ev) => {
    const t = ev.target as HTMLElement;
    const item = t.closest<HTMLElement>('.song-item');
    if (item) { const e = entries.find((x) => x.id === item.dataset.id); if (e) select(e); return; }
    const vb = t.closest<HTMLElement>('.view-switch button');
    if (vb) { prefs.view = vb.dataset.view as View; savePrefs(prefs); render(); return; }
    if (!t.closest('.settings-menu')) menu.open = false;
    if (!settings && !t.closest('.sidebar-toggle, .help-btn, .help-close, .fs-up, .fs-down')) return;
    if (t.closest('.tr-up')) { settings!.transpose = Math.min(11, settings!.transpose + 1); render(); }
    else if (t.closest('.tr-down')) { settings!.transpose = Math.max(-11, settings!.transpose - 1); render(); }
    else if (t.closest('.tr-val')) { settings!.transpose = 0; render(); }
    else if (t.closest('.fs-up')) { prefs.fontSize = Math.min(40, prefs.fontSize + 2); savePrefs(prefs); render(); }
    else if (t.closest('.fs-down')) { prefs.fontSize = Math.max(12, prefs.fontSize - 2); savePrefs(prefs); render(); }
    else if (t.closest('.scroll-btn')) { scrolling ? stopScroll() : startScroll(); }
    else if (t.closest('.sidebar-toggle')) { prefs.sidebar = !prefs.sidebar; shell.classList.toggle('no-sidebar', !prefs.sidebar); savePrefs(prefs); render(); }
    else if (t.closest('.help-btn')) { helpPanel.hidden = !helpPanel.hidden; }
    else if (t.closest('.help-close')) { helpPanel.hidden = true; }
    else if (t.closest('.print-btn')) { window.print(); }
  });
  $('.search').addEventListener('input', (e) => { search = (e.target as HTMLInputElement).value; renderList(); });
  guitarSel.addEventListener('change', () => {
    if (!current || !settings) return;
    if (guitarSel.value === 'all') { prefs.stacked = true; savePrefs(prefs); render(); return; }
    if (prefs.view === 'tab') { prefs.stacked = false; savePrefs(prefs); }
    const g = Number(guitarSel.value);
    settings = { ...defaultSettings(current.result.song, g), transpose: settings.transpose };
    render();
  });
  capoSel.addEventListener('change', () => { if (settings) { settings.capo = Number(capoSel.value); render(); } });
  names.addEventListener('change', () => { prefs.showStringNames = names.checked; savePrefs(prefs); render(); });
  speed.addEventListener('input', () => { prefs.speed = Number(speed.value); savePrefs(prefs); });
  themeSel.addEventListener('change', () => { prefs.theme = themeSel.value as Prefs['theme']; savePrefs(prefs); applyTheme(); });
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
    if (e.key === ' ' && current) { e.preventDefault(); scrolling ? stopScroll() : startScroll(); }
    if (e.key === 'Escape') helpPanel.hidden = true;
  });
  let resizeTimer = 0;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = window.setTimeout(() => prefs.view === 'tab' && render(), 150); });

  // Print: wrap tab to a fixed page width, restore afterwards.
  window.addEventListener('beforeprint', () => { stopScroll(); if (prefs.view === 'tab') { tabWidthOverride = 42; render(); } });
  window.addEventListener('afterprint', () => { if (tabWidthOverride) { tabWidthOverride = null; render(); } });

  installTooltips(document.body);

  const start = entries.find((e) => e.id === prefs.last);
  if (start) select(start); else render();
}
