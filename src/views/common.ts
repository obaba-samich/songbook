/** Pieces shared by the Tablature, Chords and Lyrics views. */
import type { Section, Song, StrumPattern, StrumRef, TabBlock } from '../core/types';
import { NO_CHORD } from '../core/chords';
import { displayChord, guitarOf, shapeFor, shapesKey, soundingKey, type PlaySettings } from '../core/transpose';
import { chordDiagram } from './diagram';
import { esc } from './html';

export interface ViewCtx {
  song: Song;
  settings: PlaySettings;
  showStringNames: boolean;
  /** Width available for a tab staff row, in em of the song text size. */
  tabWidthEm: number;
  /** Chord chart: bars per row (0 = per lyric line) and size. */
  chartPerRow?: number;
  chartSize?: 's' | 'm' | 'l';
  /** Tab view: show every guitar part stacked (when the song has several). */
  stacked?: boolean;
}

export const chordName = (ctx: ViewCtx, name: string) => displayChord(name, ctx.song, ctx.settings);

export function guitarId(ctx: ViewCtx): string {
  return guitarOf(ctx.song, ctx.settings).id;
}

/** Sections in play order (repeats included). */
export function playedSections(song: Song): Section[] {
  return song.order.map((n) => song.sections.get(n.toLowerCase())!).filter(Boolean);
}

/** Strum refs for the selected guitar in a section. */
export function strumsFor(section: Section, gid: string): StrumRef[] {
  return section.body.flatMap((b) => (b.kind === 'strum' && b.guitar === gid ? b.refs : []));
}

export function tabsFor(section: Section, gid: string): TabBlock[] {
  return section.body.flatMap((b) => (b.kind === 'tab' && b.guitar === gid ? [b.tab] : []));
}

/** Chords per lyric line (lines without chords are skipped). */
export function progression(section: Section): string[][] {
  return section.body
    .flatMap((b) => (b.kind === 'lyric' ? [b.segments.map((s) => s.chord).filter((c): c is string => c !== null)] : []))
    .filter((row) => row.length);
}

/** Every chord used in played sections, in order of first appearance. */
export function usedChords(song: Song): string[] {
  const seen = new Set<string>();
  for (const s of playedSections(song)) for (const row of progression(s)) for (const c of row) if (c !== NO_CHORD) seen.add(c);
  return [...seen];
}

function countLabels(n: number, time: string): string[] | null {
  const [beats, unit] = time.split('/').map(Number);
  if (unit === 8 && n === beats) return Array.from({ length: n }, (_, i) => String(i + 1));
  if (unit === 8 && n === beats * 2) return Array.from({ length: n }, (_, i) => (i % 2 ? '&' : String(i / 2 + 1)));
  if (n === beats) return Array.from({ length: n }, (_, i) => String(i + 1));
  if (n === beats * 2) return Array.from({ length: n }, (_, i) => (i % 2 ? '&' : String(i / 2 + 1)));
  if (n === beats * 4) return Array.from({ length: n }, (_, i) => ['', 'e', '&', 'a'][i % 4] || String(i / 4 + 1));
  return null;
}

const STROKE: Record<string, { glyph: string; tip: string; cls: string }> = {
  D: { glyph: '↓', tip: 'Down strum', cls: 'down' },
  U: { glyph: '↑', tip: 'Up strum', cls: 'up' },
  '-': { glyph: '', tip: 'Rest — keep your hand moving but miss the strings', cls: 'rest' },
  X: { glyph: '✕', tip: 'Muted chuck — strum while lightly damping the strings with your fretting hand', cls: 'chuck' },
};

/** Text and tooltip for one fingerpicking slot, e.g. ['B','1'] → "B+1". */
export function pickCell(pick: string[]): { text: string; tip: string } {
  if (!pick.length) return { text: '', tip: 'Rest — let the strings ring' };
  const one = (t: string) => t === 'B' ? 'thumb on the bass string of the chord'
    : t === 'A' ? 'thumb on the alternate bass string (the next bass string up)'
    : `string ${t}${t === '1' ? ' (thinnest)' : t === '6' ? ' (thickest)' : ''}`;
  return { text: pick.join('+'), tip: (pick.length > 1 ? 'Pick together: ' : 'Pick ') + pick.map(one).join(' + ') };
}

/** Draw a strum pattern with arrows, gaps for rests, counts and repeat marks. */
export function renderStrum(p: StrumPattern | undefined, ref: StrumRef, time: string, compact = false): string {
  if (!p) return `<div class="strum missing">strum "${esc(ref.name)}" not found</div>`;
  const counts = countLabels(p.strokes.length, time);
  const cells = p.strokes
    .map((s, i) => {
      if (p.picks) {
        const c = pickCell(p.picks[i]);
        return `<span class="stroke pick" data-tip="${esc(c.tip)}"><b>${esc(c.text)}</b>${counts ? `<i>${esc(counts[i])}</i>` : ''}</span>`;
      }
      const st = STROKE[s];
      return `<span class="stroke ${st.cls}" data-tip="${esc(st.tip)}"><b>${st.glyph}</b>${counts ? `<i>${esc(counts[i])}</i>` : ''}</span>`;
    })
    .join('');
  // In compact form (above lyrics) the pattern is one bar, played every bar — no repeat count.
  const rep = ref.repeat > 1 && !compact;
  return `<div class="strum${compact ? ' compact' : ''}">
    <span class="strum-name">${esc(p.name)}${p.picks ? ' <small data-tip="Fingerpicking: B = bass string of the chord, A = alternate bass, numbers = string (1 = thinnest)">(picked)</small>' : ''}</span>
    ${rep ? '<span class="repeat-mark" data-tip="Repeat sign: play this pattern again">‖:</span>' : ''}
    <span class="strokes">${cells}</span>
    ${rep ? `<span class="repeat-mark" data-tip="End of repeat">:‖</span><span class="times" data-tip="Play the pattern ${ref.repeat} times">×${ref.repeat}</span>` : ''}
    ${compact ? '<span class="strum-every" data-tip="This pattern is one bar long. Play it once for every bar, changing chord where the chord names are.">every bar</span>' : ''}
  </div>`;
}

export function renderStrums(ctx: ViewCtx, section: Section, compact = false): string {
  const refs = strumsFor(section, guitarId(ctx));
  if (!refs.length) return '';
  return `<div class="strums">${refs.map((r) => renderStrum(ctx.song.strums.get(r.name), r, ctx.song.meta.time, compact)).join('')}</div>`;
}

export function sectionComments(section: Section): string {
  const cs = section.body.flatMap((b) => (b.kind === 'comment' ? [b.text] : []));
  return cs.map((c) => `<p class="sec-comment">${esc(c)}</p>`).join('');
}

export function songHeader(ctx: ViewCtx): string {
  const { song, settings } = ctx;
  const g = guitarOf(song, settings);
  const sk = soundingKey(song, settings);
  const shapes = shapesKey(song, settings);
  const bits: string[] = [];
  if (sk) bits.push(`Key ${esc(sk)}`);
  bits.push(settings.capo ? `Capo ${settings.capo}` : 'No capo');
  if (settings.capo && shapes) bits.push(`${esc(shapes.replace(/m$/, ' minor'))} shapes`);
  if (song.meta.tempo) bits.push(`${song.meta.tempo} BPM`);
  bits.push(esc(song.meta.time));
  if (g.tuning.name !== 'Standard') bits.push(`Tuning: ${esc(g.tuning.name)} (${esc(g.tuning.notes.join(' '))})`);
  if (song.guitars.length > 1) bits.push(ctx.stacked ? `Parts: ${song.guitars.map((x) => esc(x.name)).join(' + ')}` : `Part: ${esc(g.name)}`);
  if (settings.transpose) bits.push(`Transposed ${settings.transpose > 0 ? '+' : ''}${settings.transpose}`);
  return `<header class="song-head">
    <h1>${esc(song.meta.title || 'Untitled')}</h1>
    <p class="artist">${esc(song.meta.artist)}</p>
    <p class="meta">${bits.join('<span class="dot"> · </span>')}</p>
    ${song.comments.map((c) => `<p class="song-comment">${esc(c)}</p>`).join('')}
  </header>`;
}

export function diagramsBlock(ctx: ViewCtx): string {
  const chords = usedChords(ctx.song);
  if (!chords.length) return '';
  const seen = new Set<string>();
  const boxes = chords
    .map((c) => ({ shown: chordName(ctx, c), shape: shapeFor(c, ctx.song, ctx.settings) }))
    .filter((d) => !seen.has(d.shown) && seen.add(d.shown))
    .map((d) => chordDiagram(d.shown, d.shape))
    .join('');
  return `<section class="diagrams-wrap"><h2>Chords used</h2><div class="diagrams">${boxes}</div></section>`;
}

export function orderBlock(song: Song): string {
  if (!song.order.length) return '';
  return `<section class="order-wrap"><h2>Song order</h2><p class="order">${song.order
    .map((n) => `<span>${esc(n)}</span>`)
    .join('<span class="arrow"> → </span>')}</p></section>`;
}

export function chordChip(ctx: ViewCtx, name: string): string {
  if (name === NO_CHORD) return '<span class="chip nc" data-tip="No chord — stop playing">N.C.</span>';
  return `<span class="chip">${esc(chordName(ctx, name))}</span>`;
}

export function progressionRows(ctx: ViewCtx, section: Section): string {
  const rows = progression(section);
  if (!rows.length) return '<p class="muted">No chords in this section.</p>';
  return `<div class="prog">${rows.map((r) => `<div class="prog-row">${r.map((c) => chordChip(ctx, c)).join('')}</div>`).join('')}</div>`;
}
