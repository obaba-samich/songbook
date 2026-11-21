/**
 * Bar-by-bar chord chart, the way a session player writes it:
 * the first bar shows the strum and the chord; after that
 *   %          = play the previous bar again (same chord, same strum)
 *   % + chord  = same strum, change to this chord
 * and the strum is written out again whenever it changes.
 */
import type { Section, Stroke } from '../core/types';
import { sectionLayout } from './chordTab';
import { chordName, type ViewCtx } from './common';
import { esc } from './html';

export type ChartKind = 'full' | 'repeat' | 'chord';

export interface ChartBar {
  /** Chord names in this bar (displayed names, in order). Empty = no chord. */
  chords: string[];
  pattern: string;
  strokes: Stroke[];
  kind: ChartKind;
  /** Lyric line this bar belongs to (bars of one line share a row). */
  line: number;
}

export function sectionChart(section: Section, ctx: ViewCtx): ChartBar[] {
  const layout = sectionLayout(section, ctx);
  if (!layout) return [];
  const { spans, bars, firstSlotOfBar, starts, chordAt } = layout;
  const out: ChartBar[] = [];
  bars.forEach((bar, b) => {
    const s0 = firstSlotOfBar[b];
    const s1 = firstSlotOfBar[b + 1];
    const idx = [chordAt(s0)];
    starts.forEach((st, i) => { if (st > s0 && st < s1 && !idx.includes(i)) idx.push(i); });
    const chords = idx.map((i) => spans[i].chord).map((c) => (c ? chordName(ctx, c) : 'N.C.'));
    const strokes = bar.map((sl) => sl.stroke);
    const prev = out[out.length - 1];
    const sameStrum = !!prev && prev.pattern === bar[0].pattern && prev.strokes.join('') === strokes.join('');
    const sameChords = !!prev && prev.chords.join(' ') === chords.join(' ');
    const kind: ChartKind = !sameStrum ? 'full' : sameChords ? 'repeat' : 'chord';
    out.push({ chords, pattern: bar[0].pattern, strokes, kind, line: spans[chordAt(s0)].line });
  });
  return out;
}

const ARROW: Record<Stroke, string> = { D: '↓', U: '↑', '-': '', X: '✕' };

function countLabels(n: number, time: string): string[] | null {
  const [beats, unit] = time.split('/').map(Number);
  if (n === beats) return Array.from({ length: n }, (_, i) => String(i + 1));
  if (n === beats * 2) return Array.from({ length: n }, (_, i) => (i % 2 ? '&' : String(i / 2 + 1)));
  if (n === beats * 4 && unit !== 8) return Array.from({ length: n }, (_, i) => ['', 'e', '&', 'a'][i % 4] || String(i / 4 + 1));
  return null;
}

function strumHtml(strokes: Stroke[], time: string): string {
  const counts = countLabels(strokes.length, time);
  const tips: Record<Stroke, string> = {
    D: 'Strum down', U: 'Strum up', '-': 'Rest — keep your hand moving, miss the strings', X: 'Muted chuck — strum while damping the strings',
  };
  return `<span class="cb-strum">${strokes
    .map((s, i) => `<span class="cb-stroke" data-tip="${tips[s]}"><b>${ARROW[s]}</b>${counts ? `<i>${counts[i]}</i>` : ''}</span>`)
    .join('')}</span>`;
}

export function renderChart(bars: ChartBar[], time: string): string {
  if (!bars.length) return '<p class="muted">No chords in this section.</p>';
  const rows: ChartBar[][] = [];
  for (const b of bars) {
    const last = rows[rows.length - 1];
    if (last && last[0].line === b.line) last.push(b);
    else rows.push([b]);
  }
  const cell = (b: ChartBar) => {
    const names = b.chords.map((c) => `<span class="cb-chord">${esc(c)}</span>`).join('');
    if (b.kind === 'full') {
      return `<div class="cb-bar full"><div class="cb-chords">${names}</div>${strumHtml(b.strokes, time)}</div>`;
    }
    const tip = b.kind === 'repeat'
      ? 'Repeat the previous bar: same chord, same strum'
      : `Same strum as the previous bar, but change to ${b.chords.join(' then ')}`;
    return `<div class="cb-bar ${b.kind}"><div class="cb-chords">${b.kind === 'chord' ? names : ''}</div><span class="cb-repeat" data-tip="${esc(tip)}">%</span></div>`;
  };
  // Four bars to a row, like a lead sheet; a line's bars never mix with the next line's.
  const chunks: ChartBar[][] = rows.flatMap((r) => Array.from({ length: Math.ceil(r.length / 4) }, (_, i) => r.slice(i * 4, i * 4 + 4)));
  return `<div class="chart">${chunks.map((r) => `<div class="cb-row">${r.map(cell).join('')}</div>`).join('')}</div>`;
}
