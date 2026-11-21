/** Tablature view: 6-line tab per section, chords as a fallback. */
import { stringName } from '../core/parser';
import { describeAnnotation, describeTabToken, ordinal, splitSystem, tokenizeTabLine } from '../core/tab';
import type { TabSystem, Tuning } from '../core/types';
import { guitarOf } from '../core/transpose';
import {
  diagramsBlock, guitarId, orderBlock, playedSections, progressionRows, renderStrums, sectionComments, songHeader,
  tabsFor, type ViewCtx,
} from './common';
import { esc, tip } from './html';

/** Label shown left of each tab line, high string first ("e", "B", …). */
export function tabLabels(tuning: Tuning): string[] {
  const high = [...tuning.notes].reverse();
  return high.map((n, i) => (i === 0 ? n.toLowerCase() : n));
}

function renderAnnotation(line: string, pad: string): string {
  const html = line.replace(/[^\s]+/g, (w) => `\u0000${w}\u0001`);
  const out = esc(html).replace(/\u0000([^\u0001]*)\u0001/g, (_, w) => {
    const t = describeAnnotation(w);
    return t ? `<span class="t-anno"${tip(t)}>${w}</span>` : w;
  });
  return `<span class="t-row anno">${pad}${out}</span>`;
}

function renderSystem(sys: TabSystem, tuning: Tuning, ctx: ViewCtx): string {
  const labels = tabLabels(tuning);
  const lowIndex = (row: number) => tuning.notes.length - 1 - row;
  const width = Math.max(...labels.map((l) => l.length));
  const chunks = splitSystem(sys.strings, sys.annotations, ctx.tabCols - (ctx.showStringNames ? width : 0));
  return chunks
    .map((chunk) => {
      const tokenRows = chunk.strings.map(tokenizeTabLine);
      // Which columns have a note on more than one string → "played together".
      const colCount = new Map<number, number>();
      tokenRows.forEach((row) =>
        row.forEach((t) => (t.kind === 'fret' || t.kind === 'ghost' || t.kind === 'muted') && colCount.set(t.start, (colCount.get(t.start) ?? 0) + 1)),
      );
      const pad = ctx.showStringNames ? ' '.repeat(width) : '';
      const annos = chunk.annotations.map((a) => renderAnnotation(a, pad)).join('\n');
      const rows = tokenRows.map((tokens, r) => {
        const sname = stringName(tuning, lowIndex(r));
        const label = ctx.showStringNames
          ? `<span class="t-label"${tip(`${sname} string (${ordinal(r + 1)} from the top)`)}>${esc(labels[r].padEnd(width))}</span>`
          : '';
        const body = tokens
          .map((t, i) => {
            if (t.kind === 'dash') return '-';
            let text = describeTabToken(tokens, i, sname);
            if (text && (t.kind === 'fret' || t.kind === 'ghost') && (colCount.get(t.start) ?? 0) > 1)
              text += ` — played together with the other ${colCount.get(t.start)! - 1} stacked note${colCount.get(t.start)! > 2 ? 's' : ''} in this column`;
            return text ? `<span class="t-${t.kind}"${tip(text)}>${esc(t.text)}</span>` : esc(t.text);
          })
          .join('');
        return `<span class="t-row">${label}${body}</span>`;
      });
      return `<pre class="tab" aria-label="tab">${annos ? annos + '\n' : ''}${rows.join('\n')}</pre>`;
    })
    .join('');
}

export function renderTabView(ctx: ViewCtx): string {
  const gid = guitarId(ctx);
  const tuning = guitarOf(ctx.song, ctx.settings).tuning;
  const sections = playedSections(ctx.song)
    .map((s) => {
      const tabs = tabsFor(s, gid);
      const body = tabs.length
        ? tabs.map((t) => t.systems.map((sys) => renderSystem(sys, tuning, ctx)).join('')).join('')
        : `<div class="tab-fallback"><p class="muted small">No tab for this section — play the chords:</p>${progressionRows(ctx, s)}</div>`;
      return `<section class="sec"><h2 class="sec-label">${esc(s.name)}</h2>${sectionComments(s)}${renderStrums(ctx, s, true)}${body}</section>`;
    })
    .join('');
  return `${songHeader(ctx)}<div class="view-tab">${sections}</div>${diagramsBlock(ctx)}${orderBlock(ctx.song)}`;
}
