/**
 * Engraved tab staff drawn as SVG, in the style of a printed tab book.
 *
 * The whole song is one continuous score: section names sit above the bar
 * where each section starts, measure numbers run through the song, rows are
 * justified to the page width. Each row has (top → bottom): section name,
 * chord names, effects (P.M., let ring, vibrato, bends, pick strokes), the
 * six string lines with fret numbers on them, rhythm stems and beams, lyrics.
 */
import type { TabSystem, Tuning } from '../core/types';
import { describeAnnotation, describeTabToken, tokenizeTabLine, type TabToken } from '../core/tab';
import { isValidChordName } from '../core/chords';
import { stringName } from '../core/parser';
import { esc } from './html';

/** A tab system plus optional data the hand-written format doesn't carry. */
export interface StaffSystem extends TabSystem {
  /** Onset column → position in its bar and duration, in 16th-note ticks. Without it, rhythm is read from column spacing. */
  rhythm?: Map<number, { tick: number; dur: number }>;
  /** Lyrics placed under the note at `col`. */
  lyrics?: { col: number; text: string }[];
  /** Pick/strum direction at `col`. */
  strokes?: { col: number; dir: 'D' | 'U' }[];
  /** Section that starts with this system (drawn above its first bar). */
  section?: string;
  sectionTip?: string;
  /** Built from chords + strum rather than written as tab. */
  generated?: boolean;
}

/** SVG units per em (rows are sized in em so they scale with the font size). */
const U = 16;
const CW = 7; // width of one tab column
const PAD = 6; // space inside each measure, both sides
const GAP = 13; // distance between strings
const LANE_SECTION = 12;
const LANE_CHORD = 27;
const LANE_FX = 41;
const TOP = 58; // y of the top string

export type AnnoKind = 'chord' | 'pm' | 'ring' | 'nh' | 'text';
export interface AnnoItem { col: number; end: number; kind: AnnoKind; text: string }

/** Read annotation lines (written above the strings) into positioned items. */
export function parseAnnotations(lines: string[]): AnnoItem[] {
  const items: AnnoItem[] = [];
  const re = /(P\.?M\.?|let\s+ring|N\.?H\.?)(-*)|([^\s|]+)/gi;
  for (const line of lines) {
    for (const m of line.matchAll(re)) {
      const col = m.index!;
      if (m[1]) {
        const kind: AnnoKind = /^p/i.test(m[1]) ? 'pm' : /^l/i.test(m[1]) ? 'ring' : 'nh';
        items.push({ col, end: col + m[0].length - 1, kind, text: m[1] });
        continue;
      }
      const word = m[3];
      if (/^[-.]+$/.test(word)) continue;
      items.push({ col, end: col + word.length - 1, kind: isValidChordName(word) ? 'chord' : 'text', text: word });
    }
  }
  return items;
}

export interface MeasureSpan { s: number; e: number; startRepeat: boolean; endRepeat: boolean }

/** Split a system into measures at the bar-line columns shared by all strings. */
export function systemMeasures(strings: string[]): MeasureSpan[] {
  const len = Math.max(...strings.map((s) => s.length));
  const isBar = (c: number) => strings.every((s) => s[c] === '|');
  const points: number[] = [];
  if (!isBar(0)) points.push(-1);
  for (let c = 0; c < len; c++) if (isBar(c)) points.push(c);
  if (!isBar(len - 1)) points.push(len);
  const out: MeasureSpan[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    let s = points[i] + 1;
    let e = points[i + 1];
    const colon = (c: number) => strings.some((x) => x[c] === ':');
    const startRepeat = e > s && colon(s);
    if (startRepeat) s++;
    const endRepeat = e > s && colon(e - 1);
    if (endRepeat) e--;
    if (e > s || startRepeat || endRepeat) out.push({ s, e: Math.max(e, s), startRepeat, endRepeat });
  }
  return out;
}

export interface NoteValue { base: 16 | 8 | 4 | 2 | 1; dotted: boolean }

/** Duration in 16th-note ticks → note value (whole = 16). */
export function noteValue(ticks: number): NoteValue {
  const table: [number, NoteValue][] = [
    [16, { base: 16, dotted: false }], [12, { base: 8, dotted: true }], [8, { base: 8, dotted: false }],
    [6, { base: 4, dotted: true }], [4, { base: 4, dotted: false }], [3, { base: 2, dotted: true }],
    [2, { base: 2, dotted: false }], [1, { base: 1, dotted: false }],
  ];
  for (const [t, v] of table) if (ticks >= t) return v;
  return { base: 1, dotted: false };
}

interface Sys {
  system: StaffSystem;
  tokens: TabToken[][];
  annos: AnnoItem[];
  stacked: Map<number, number>;
  first: boolean;
  /** Most common measure width in columns, for spotting pickup bars. */
  typicalWidth: number;
}
interface Measure extends MeasureSpan {
  sys: Sys;
  number: number;
  natural: number;
  x: number;
  scale: number;
  row: number;
  firstOfSys: boolean;
}

export interface StaffOptions {
  tuning: Tuning;
  /** Width available for a row, in em. */
  widthEm: number;
  showStringNames: boolean;
  /** Number of the first measure. */
  firstMeasure?: number;
  /** Time signature, used for rhythm; drawn at the start when showTimeSig. */
  time?: string;
  showTimeSig?: boolean;
  tempo?: number | null;
  /** Force row breaks: number of measures in each row (used to line up stacked parts). */
  rowMeasures?: number[];
  /** Layout width per measure (stacked parts use the widest part's width so bar lines line up). */
  measureWidths?: number[];
  /** Only measure, don't draw: returns each measure's natural width. */
  measureOnly?: boolean;
}

/** Natural width of every measure, so stacked parts can share row breaks. */
export function staffMeasureWidths(systems: StaffSystem[], o: StaffOptions): number[] {
  return renderStaff(systems, { ...o, measureOnly: true }).widths ?? [];
}

/** Room for measures in a row (the first row also holds the time signature). */
export function staffRowRoom(o: StaffOptions, firstRow: boolean): number {
  return Math.max(20, o.widthEm) * U - 22 - (firstRow && o.showTimeSig ? 18 : 0);
}

const isNote = (t: TabToken) => t.kind === 'fret' || t.kind === 'ghost' || t.kind === 'muted';
/** A note drawn by a bend/release arrow instead of a number. */
const hiddenNote = (tokens: TabToken[], i: number) => tokens[i - 1]?.kind === 'bend' || tokens[i - 1]?.kind === 'release';

function neighbour(tokens: TabToken[], idx: number, dir: -1 | 1): number {
  for (let j = idx + dir; j >= 0 && j < tokens.length; j += dir) {
    const k = tokens[j].kind;
    if (k === 'fret' || k === 'ghost') return j;
    if (k === 'dash' || k === 'bar' || k === 'other') return -1;
  }
  return -1;
}

const tipAttr = (t: string | null | undefined) => (t ? ` data-tip="${esc(t)}"` : '');

const NOTE_NAMES: Record<number, string> = { 16: 'whole note', 8: 'half note', 4: 'quarter note', 2: 'eighth note', 1: 'sixteenth note' };

export function renderStaff(systems: StaffSystem[], o: StaffOptions): { html: string; measures: number; rows: string[]; widths?: number[] } {
  const lines = o.tuning.notes.length;
  const labels = [...o.tuning.notes].reverse().map((n, i) => (i === 0 ? n.toLowerCase() : n));
  const lowIndex = (row: number) => lines - 1 - row;
  const time = o.time ?? '4/4';
  const [beats, unit] = time.split('/').map(Number);
  const barTicks = Math.round((beats * 16) / (unit || 4)) || 16;
  const groupTicks = unit === 8 && beats % 3 === 0 ? 6 : 4;
  const firstNo = o.firstMeasure ?? 1;

  // ---- measures ----
  const measures: Measure[] = [];
  systems.forEach((system, si) => {
    const tokens = system.strings.map(tokenizeTabLine);
    const stacked = new Map<number, number>();
    tokens.forEach((row) => row.forEach((t, i) => isNote(t) && !hiddenNote(row, i) && stacked.set(t.start, (stacked.get(t.start) ?? 0) + 1)));
    const spans = systemMeasures(system.strings);
    const widths = spans.map((x) => x.e - x.s).sort((p, q) => p - q);
    const sys: Sys = { system, tokens, annos: parseAnnotations(system.annotations), stacked, first: si === 0, typicalWidth: Math.max(1, widths[Math.floor(widths.length / 2)] ?? 1) };
    spans.forEach((span, mi) => {
      measures.push({
        ...span, sys, number: firstNo + measures.length, natural: (span.e - span.s) * CW + PAD * 2,
        x: 0, scale: 1, row: 0, firstOfSys: mi === 0,
      });
    });
  });
  if (!measures.length) return { html: '', measures: 0, rows: [] };
  if (o.measureOnly) return { html: '', measures: measures.length, rows: [], widths: measures.map((m) => m.natural) };
  const lw = (m: Measure, i: number) => Math.max(m.natural, o.measureWidths?.[i] ?? 0);
  const layoutW = new Map(measures.map((m, i) => [m, lw(m, i)]));

  // ---- rows (greedy fill, then justify) ----
  const total = Math.max(20, o.widthEm) * U;
  const clefW = 22;
  const sigW = o.showTimeSig ? 18 : 0;
  const rows: Measure[][] = [];
  let cur: Measure[] = [];
  let used = 0;
  if (o.rowMeasures) {
    let i = 0;
    for (const n of o.rowMeasures) { if (i < measures.length) rows.push(measures.slice(i, i + n)); i += n; }
    if (i < measures.length) rows.push(measures.slice(i));
  } else {
    for (const m of measures) {
      const avail = total - clefW - (rows.length === 0 ? sigW : 0);
      if (cur.length && used + layoutW.get(m)! > avail) { rows.push(cur); cur = []; used = 0; }
      cur.push(m);
      used += layoutW.get(m)!;
    }
    if (cur.length) rows.push(cur);
  }

  const svgs = rows.map((row, ri) => {
    const first = ri === 0;
    const startX = clefW + (first ? sigW : 0);
    const natural = row.reduce((a, m) => a + layoutW.get(m)!, 0);
    const avail = total - startX;
    // Stacked parts share breaks, so a short last row is still justified like the others.
    const lastRow = ri === rows.length - 1 && !o.rowMeasures;
    const scale = !lastRow || natural / avail > 0.55 ? Math.min(avail / natural, 3) : Math.min(avail / natural, 1.5);
    let x = startX;
    // A measure widened to match a stacked part spreads its notes out to fill it.
    for (const m of row) { const w = layoutW.get(m)!; m.x = x; m.scale = scale * (w / m.natural); m.row = ri; x += w * scale; }
    const endX = x;
    const width = Math.ceil(first || !lastRow ? total : Math.max(endX + 2, total * 0.4));
    const yS = (r: number) => TOP + r * GAP;
    const bottom = yS(lines - 1);
    const stemTop = bottom + 6;
    const stemEnd = bottom + 20;
    const lyricY = bottom + 34;
    const parts: string[] = [];
    let hasLyrics = false;

    for (let r = 0; r < lines; r++) parts.push(`<line class="st-line" x1="2" y1="${yS(r)}" x2="${endX}" y2="${yS(r)}"/>`);
    parts.push(`<line class="st-bar" x1="2" y1="${TOP}" x2="2" y2="${bottom}"/>`);

    if (o.showStringNames) {
      labels.forEach((l, r) => {
        const sname = stringName(o.tuning, lowIndex(r));
        parts.push(`<text class="st-sname" x="11" y="${yS(r)}"${tipAttr(`${sname} string`)}>${esc(l)}</text>`);
      });
    } else {
      const mid = (TOP + bottom) / 2;
      ['T', 'A', 'B'].forEach((ch, i) => parts.push(`<text class="st-clef" x="12" y="${mid + (i - 1) * 15}">${ch}</text>`));
    }
    if (first && o.showTimeSig) {
      const mid = (TOP + bottom) / 2;
      parts.push(`<text class="st-sig" x="${clefW + 8}" y="${mid - 9}">${beats}</text><text class="st-sig" x="${clefW + 8}" y="${mid + 15}">${unit}</text>`);
    }

    const colX = (m: Measure, c: number, len = 1) => m.x + PAD * m.scale + (c - m.s + len / 2) * CW * m.scale;
    const measureOf = (sys: Sys, c: number) => row.find((m) => m.sys === sys && c >= m.s && c < m.e);
    const mid = (TOP + bottom) / 2;

    row.forEach((m, mi) => {
      const isLastOfAll = m === measures[measures.length - 1];
      const end = m.x + m.natural * m.scale;
      const sys = m.sys;

      // section name + double bar where a section starts
      if (m.firstOfSys && sys.system.section) {
        parts.push(`<text class="st-section" x="${m.x + 3}" y="${LANE_SECTION}"${tipAttr(sys.system.sectionTip)}>${esc(sys.system.section)}</text>`);
        if (m.number !== firstNo && mi > 0) parts.push(`<line class="st-bar" x1="${m.x + 3}" y1="${TOP}" x2="${m.x + 3}" y2="${bottom}"/>`);
      }
      parts.push(`<text class="st-num" x="${m.x + 2}" y="${TOP - 4}">${m.number}</text>`);

      // bar lines
      const dots = (cx: number) => `<circle class="st-dot" cx="${cx}" cy="${mid - GAP / 2}" r="1.7"/><circle class="st-dot" cx="${cx}" cy="${mid + GAP / 2}" r="1.7"/>`;
      if (m.startRepeat) parts.push(`<rect class="st-thick" x="${m.x}" y="${TOP}" width="3" height="${bottom - TOP}"/><line class="st-bar" x1="${m.x + 5}" y1="${TOP}" x2="${m.x + 5}" y2="${bottom}"/>${dots(m.x + 9)}`);
      if (m.endRepeat) parts.push(`${dots(end - 9)}<line class="st-bar" x1="${end - 5}" y1="${TOP}" x2="${end - 5}" y2="${bottom}"/><rect class="st-thick" x="${end - 3}" y="${TOP}" width="3" height="${bottom - TOP}"/>`);
      else if (isLastOfAll) parts.push(`<line class="st-bar" x1="${end - 5}" y1="${TOP}" x2="${end - 5}" y2="${bottom}"/><rect class="st-thick" x="${end - 3}" y="${TOP}" width="3" height="${bottom - TOP}"/>`);
      else parts.push(`<line class="st-bar" x1="${end}" y1="${TOP}" x2="${end}" y2="${bottom}"/>`);

      // notes and techniques
      const onsetLen = new Map<number, number>();
      sys.tokens.forEach((tokens, r) => {
        const sname = stringName(o.tuning, lowIndex(r));
        const y = yS(r);
        tokens.forEach((t, i) => {
          if (t.start < m.s || t.start >= m.e) return;
          const x = colX(m, t.start, t.text.length);
          let tip = describeTabToken(tokens, i, sname);
          if (isNote(t)) {
            if (hiddenNote(tokens, i)) return;
            onsetLen.set(t.start, Math.max(onsetLen.get(t.start) ?? 0, t.text.length));
            const n = sys.stacked.get(t.start) ?? 0;
            if (tip && n > 1) tip += ` — played together with the other ${n - 1} stacked note${n > 2 ? 's' : ''}`;
            const label = t.kind === 'muted' ? 'X' : t.text;
            const w = label.length * 6.8 + 3;
            parts.push(`<g class="st-note"${tipAttr(tip)}><rect class="st-knock" x="${x - w / 2}" y="${y - 6.5}" width="${w}" height="13"/><text class="st-fret" x="${x}" y="${y}">${esc(label)}</text></g>`);
            return;
          }
          const a = neighbour(tokens, i, -1);
          const b = neighbour(tokens, i, 1);
          const ma = a >= 0 ? measureOf(sys, tokens[a].start) : undefined;
          const mb = b >= 0 ? measureOf(sys, tokens[b].start) : undefined;
          const xa = ma ? colX(ma, tokens[a].start, tokens[a].text.length) : x - CW;
          const xb = mb ? colX(mb, tokens[b].start, tokens[b].text.length) : x + CW;
          switch (t.kind) {
            case 'hammer':
            case 'pull': {
              const top = y - 8;
              const cx = (xa + xb) / 2;
              parts.push(`<g class="st-fx"${tipAttr(tip)}><rect class="st-hit" x="${xa}" y="${top - 12}" width="${Math.max(8, xb - xa)}" height="12"/>
                <path class="st-slur" d="M${xa + 1} ${top} Q${cx} ${top - 7} ${xb - 1} ${top}"/>
                <text class="st-hp" x="${cx}" y="${top - 8}">${t.kind === 'hammer' ? 'H' : 'P'}</text></g>`);
              break;
            }
            case 'slideUp':
            case 'slideDown': {
              const fa = a >= 0 ? tokens[a].fret! : 0;
              const fb = b >= 0 ? tokens[b].fret! : fa + (t.kind === 'slideUp' ? 1 : -1);
              const up = fb > fa;
              parts.push(`<g class="st-fx"${tipAttr(tip)}><rect class="st-hit" x="${xa + 4}" y="${y - 6}" width="${Math.max(6, xb - xa - 8)}" height="12"/>
                <line class="st-slide" x1="${xa + 5}" y1="${y + (up ? 3 : -3)}" x2="${xb - 5}" y2="${y + (up ? -3 : 3)}"/></g>`);
              break;
            }
            case 'bend': {
              const fa = a >= 0 ? tokens[a].fret! : 0;
              const steps = b >= 0 ? tokens[b].fret! - fa : 2;
              const amount = ({ 1: '½', 2: 'full', 3: '1½', 4: '2' } as Record<number, string>)[steps] ?? '';
              const ax = xa + 12;
              const ay = LANE_FX + 2;
              parts.push(`<g class="st-fx"${tipAttr(tip)}><rect class="st-hit" x="${xa + 2}" y="${ay - 10}" width="16" height="${y - ay + 10}"/>
                <path class="st-bend" d="M${xa + 5} ${y} Q${ax} ${y} ${ax} ${ay + 4}"/>
                <path class="st-arrow" d="M${ax - 3} ${ay + 5} L${ax} ${ay} L${ax + 3} ${ay + 5} Z"/>
                <text class="st-amt" x="${ax}" y="${ay - 3}">${amount}</text></g>`);
              break;
            }
            case 'release': {
              const ay = LANE_FX + 2;
              const rx = b >= 0 ? xb : x + CW;
              parts.push(`<g class="st-fx"${tipAttr(tip)}><rect class="st-hit" x="${rx - 8}" y="${ay}" width="12" height="${y - ay}"/>
                <path class="st-bend" d="M${rx - 6} ${ay + 2} Q${rx} ${ay + 2} ${rx} ${y - 9}"/>
                <path class="st-arrow" d="M${rx - 3} ${y - 13} L${rx} ${y - 8} L${rx + 3} ${y - 13} Z"/></g>`);
              break;
            }
            case 'vibrato': {
              const x0 = colX(m, t.start) - 3;
              const x1 = colX(m, t.start + t.text.length - 1) + 4;
              let d = `M${x0} ${LANE_FX + 6}`;
              for (let kx = x0, up = true; kx < x1; kx += 3, up = !up) d += ` L${Math.min(kx + 3, x1)} ${LANE_FX + (up ? 4 : 8)}`;
              parts.push(`<g class="st-fx"${tipAttr(tip)}><rect class="st-hit" x="${x0}" y="${LANE_FX + 1}" width="${x1 - x0}" height="9"/><path class="st-vib" d="${d}"/></g>`);
              break;
            }
            default:
              break;
          }
        });
      });

      // rhythm: explicit durations, or read from the column spacing
      const onsets = [...onsetLen.keys()].sort((p, q) => p - q);
      const span = Math.max(1, m.e - m.s);
      // A bar much narrower than its neighbours (a pickup) is a shorter bar.
      const mTicks = Math.max(1, Math.min(barTicks, Math.round((barTicks * span) / sys.typicalWidth)));
      const notes = onsets.map((c, i) => {
        const known = sys.system.rhythm?.get(c);
        const tick = known?.tick ?? Math.round(((c - m.s) / span) * mTicks);
        const nextTick = i + 1 < onsets.length ? Math.round(((onsets[i + 1] - m.s) / span) * mTicks) : mTicks;
        const dur = known?.dur ?? Math.max(1, nextTick - tick);
        return { c, x: colX(m, c, onsetLen.get(c)!), tick, v: noteValue(dur) };
      });
      const beamable = (n: (typeof notes)[number]) => n.v.base <= 2;
      let gi = 0;
      while (gi < notes.length) {
        const n = notes[gi];
        if (!beamable(n)) {
          const tip = `${n.v.dotted ? 'Dotted ' : ''}${NOTE_NAMES[n.v.base]}`;
          if (n.v.base === 4) parts.push(`<line class="st-stem"${tipAttr(tip)} x1="${n.x}" y1="${stemTop}" x2="${n.x}" y2="${stemEnd}"/>`);
          if (n.v.base === 8) parts.push(`<line class="st-stem"${tipAttr(tip)} x1="${n.x}" y1="${stemTop}" x2="${n.x}" y2="${stemTop + 8}"/>`);
          if (n.v.dotted) parts.push(`<circle class="st-dot" cx="${n.x + 4}" cy="${n.v.base === 8 ? stemTop + 8 : stemEnd - 2}" r="1.3"/>`);
          gi++;
          continue;
        }
        const group = [n];
        while (gi + group.length < notes.length) {
          const nx = notes[gi + group.length];
          if (!beamable(nx) || Math.floor(nx.tick / groupTicks) !== Math.floor(n.tick / groupTicks)) break;
          group.push(nx);
        }
        for (const g of group) {
          parts.push(`<line class="st-stem"${tipAttr(`${g.v.dotted ? 'Dotted ' : ''}${NOTE_NAMES[g.v.base]}`)} x1="${g.x}" y1="${stemTop}" x2="${g.x}" y2="${stemEnd}"/>`);
          if (g.v.dotted) parts.push(`<circle class="st-dot" cx="${g.x + 4}" cy="${stemEnd - 5}" r="1.3"/>`);
        }
        if (group.length === 1) {
          parts.push(`<path class="st-flag" d="M${n.x} ${stemEnd} q5 -2 6 -8"/>`);
          if (n.v.base === 1) parts.push(`<path class="st-flag" d="M${n.x} ${stemEnd - 4} q5 -2 6 -8"/>`);
        } else {
          const x0 = group[0].x;
          const x1 = group[group.length - 1].x;
          parts.push(`<rect class="st-beam" x="${x0}" y="${stemEnd - 2}" width="${x1 - x0}" height="2.2"/>`);
          group.forEach((g, k) => {
            if (g.v.base !== 1) return;
            const nb = group[k + 1];
            const pb = group[k - 1];
            if (nb && nb.v.base === 1) parts.push(`<rect class="st-beam" x="${g.x}" y="${stemEnd - 6}" width="${nb.x - g.x}" height="2.2"/>`);
            else if (!pb || pb.v.base !== 1) {
              const dir = nb ? 1 : -1;
              parts.push(`<rect class="st-beam" x="${dir > 0 ? g.x : g.x - 5}" y="${stemEnd - 6}" width="5" height="2.2"/>`);
            }
          });
        }
        gi += group.length;
      }

      // pick strokes (⊓ down, V up) and lyrics under the notes
      for (const st of sys.system.strokes ?? []) {
        if (st.col < m.s || st.col >= m.e) continue;
        const sx = colX(m, st.col, onsetLen.get(st.col) ?? 1);
        const sy = LANE_FX - 1;
        parts.push(st.dir === 'D'
          ? `<path class="st-pick"${tipAttr('Down strum')} d="M${sx - 3} ${sy + 2} V${sy - 3} H${sx + 3} V${sy + 2}"/>`
          : `<path class="st-pick"${tipAttr('Up strum')} d="M${sx - 2.6} ${sy - 4} L${sx} ${sy + 2} L${sx + 2.6} ${sy - 4}"/>`);
      }
      for (const ly of sys.system.lyrics ?? []) {
        if (ly.col < m.s || ly.col >= m.e) continue;
        hasLyrics = true;
        parts.push(`<text class="st-lyric" x="${colX(m, ly.col, onsetLen.get(ly.col) ?? 1) - 3}" y="${lyricY}">${esc(ly.text)}</text>`);
      }
    });

    // annotations: chord names, P.M., let ring
    const systemsInRow = [...new Set(row.map((m) => m.sys))];
    for (const sys of systemsInRow) {
      const ms = row.filter((m) => m.sys === sys);
      const rowStart = Math.min(...ms.map((m) => m.s));
      const rowEnd = Math.max(...ms.map((m) => m.e)) - 1;
      const xAt = (c: number) => {
        const m = ms.find((mm) => c >= mm.s && c < mm.e) ?? (c < rowStart ? ms[0] : ms.find((mm) => c < mm.s) ?? ms[ms.length - 1]);
        return colX(m, Math.max(m.s, Math.min(c, m.e - 1)));
      };
      for (const it of sys.annos) {
        const a = Math.max(it.col, rowStart);
        const b = Math.min(it.end, rowEnd);
        if (a > b) continue;
        const labelHere = it.col >= rowStart;
        if (it.kind === 'chord') {
          if (labelHere) parts.push(`<text class="st-chord" x="${xAt(it.col) - 3}" y="${LANE_CHORD}">${esc(it.text)}</text>`);
        } else if (it.kind === 'text') {
          if (labelHere) parts.push(`<text class="st-text" x="${xAt(it.col) - 3}" y="${LANE_FX}">${esc(it.text)}</text>`);
        } else {
          const name = it.kind === 'pm' ? 'P.M.' : it.kind === 'ring' ? 'let ring' : 'N.H.';
          const x0 = xAt(a) - 3;
          const lw = labelHere ? name.length * 4.6 + 4 : 0;
          const x1 = Math.max(xAt(b) + 3, x0 + lw + 6);
          parts.push(`<g class="st-fx"${tipAttr(describeAnnotation(it.text))}><rect class="st-hit" x="${x0}" y="${LANE_FX - 8}" width="${x1 - x0}" height="11"/>
            ${labelHere ? `<text class="st-effect" x="${x0}" y="${LANE_FX}">${name}</text>` : ''}
            <line class="st-dash" x1="${x0 + lw}" y1="${LANE_FX - 3}" x2="${x1}" y2="${LANE_FX - 3}"/>
            ${it.end <= rowEnd ? `<line class="st-tick" x1="${x1}" y1="${LANE_FX - 6}" x2="${x1}" y2="${LANE_FX}"/>` : ''}</g>`);
        }
      }
    }

    // The tempo gets its own line above the first row.
    const dy = first && o.tempo ? 14 : 0;
    const tempo = dy ? `<text class="st-tempo" x="4" y="10">♩ = ${o.tempo}</text>` : '';
    const height = (hasLyrics ? lyricY + 6 : stemEnd + 8) + dy;
    return `<svg class="staff-row" viewBox="0 0 ${width} ${height}" style="width:${(width / U).toFixed(3)}em" role="img" aria-label="Tab, measures ${row[0].number}–${row[row.length - 1].number}">${tempo}<g transform="translate(0 ${dy})">${parts.join('')}</g></svg>`;
  });

  return { html: `<div class="staff">${svgs.join('')}</div>`, measures: measures.length, rows: svgs };
}
