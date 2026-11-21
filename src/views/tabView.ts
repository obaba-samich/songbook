/**
 * Tablature view: the whole song as one continuous tab score. Sections with
 * hand-written tab use it; every other section is turned into tab from its
 * chords and strum/pick pattern, with the lyrics under the notes.
 *
 * With several guitars and "All parts" chosen, the parts are stacked like a
 * band score: every row shows the same measures for each guitar, one above
 * the other, joined by a bracket.
 */
import { guitarOf, type PlaySettings } from '../core/transpose';
import { chordSystems } from './chordTab';
import { diagramsBlock, guitarId, orderBlock, playedSections, songHeader, tabsFor, type ViewCtx } from './common';
import { esc } from './html';
import { renderStaff, staffMeasureWidths, staffRowRoom, type StaffOptions, type StaffSystem } from './tabStaff';

function songSystems(ctx: ViewCtx): StaffSystem[] {
  const gid = guitarId(ctx);
  const systems: StaffSystem[] = [];
  for (const s of playedSections(ctx.song)) {
    const written = tabsFor(s, gid).flatMap((t) => t.systems);
    const sys: StaffSystem[] = written.length ? written.map((x) => ({ ...x })) : chordSystems(s, ctx);
    if (!sys.length) continue;
    const comments = s.body.flatMap((b) => (b.kind === 'comment' ? [b.text] : []));
    sys[0] = { ...sys[0], section: s.name, sectionTip: comments.join(' · ') || undefined };
    systems.push(...sys);
  }
  return systems;
}

function staffOptions(ctx: ViewCtx): StaffOptions {
  return {
    tuning: guitarOf(ctx.song, ctx.settings).tuning,
    widthEm: ctx.tabWidthEm,
    showStringNames: ctx.showStringNames,
    time: ctx.song.meta.time,
    showTimeSig: true,
    tempo: ctx.song.meta.tempo,
  };
}

/** Settings for another guitar: same transpose, capo moved by the same amount. */
export function settingsFor(ctx: ViewCtx, index: number): PlaySettings {
  const { song, settings } = ctx;
  const delta = settings.capo - guitarOf(song, settings).capo;
  const g = song.guitars[index];
  return { transpose: settings.transpose, capo: Math.max(0, g.capo + delta), guitar: index };
}

function stackedScore(ctx: ViewCtx): string {
  const parts = ctx.song.guitars.map((g, i) => {
    const gctx: ViewCtx = { ...ctx, settings: settingsFor(ctx, i) };
    const opts = staffOptions(gctx);
    // Section names and lyrics only on the top part.
    const systems = songSystems(gctx).map((s) => (i ? { ...s, section: undefined, sectionTip: undefined, lyrics: undefined } : s));
    return { g, opts: { ...opts, tempo: i ? null : opts.tempo }, systems, widths: staffMeasureWidths(systems, opts) };
  });
  // Shared row breaks: fit the widest part's version of each measure.
  const n = Math.max(...parts.map((p) => p.widths.length));
  const rowMeasures: number[] = [];
  let count = 0, used = 0;
  for (let m = 0; m < n; m++) {
    const w = Math.max(...parts.map((p) => p.widths[m] ?? 0));
    if (count && used + w > staffRowRoom(parts[0].opts, rowMeasures.length === 0)) { rowMeasures.push(count); count = 0; used = 0; }
    count++; used += w;
  }
  if (count) rowMeasures.push(count);
  const measureWidths = Array.from({ length: n }, (_, m) => Math.max(...parts.map((p) => p.widths[m] ?? 0)));
  const rendered = parts.map((p) => renderStaff(p.systems, { ...p.opts, rowMeasures, measureWidths }).rows);
  const rows = rowMeasures.map((_, r) => `<div class="stack-row">${parts
    .map((p, i) => `<div class="stack-part"><span class="part-name" data-tip="${esc(p.g.name)}${p.g.capo ? ` — capo ${p.g.capo}` : ''}${p.g.tuning.name !== 'Standard' ? `, ${esc(p.g.tuning.name)}` : ''}">${esc(p.g.name)}</span>${rendered[i][r] ?? ''}</div>`)
    .join('')}</div>`);
  return `<div class="staff stacked">${rows.join('')}</div>`;
}

export function renderTabView(ctx: ViewCtx): string {
  const body = ctx.stacked && ctx.song.guitars.length > 1
    ? stackedScore(ctx)
    : renderStaff(songSystems(ctx), staffOptions(ctx)).html;
  return `${songHeader(ctx)}<div class="view-tab">${body}</div>${diagramsBlock(ctx)}${orderBlock(ctx.song)}`;
}
