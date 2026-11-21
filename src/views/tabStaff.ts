/**
 * Engraved tab staff (Guitar Pro / Songsterr style) drawn as SVG from the
 * ASCII tab in a .gsong file: real string lines, fret numbers sitting on the
 * strings, measure numbers, justified rows, slur arcs for hammer-ons and
 * pull-offs, slide lines, bend arrows, vibrato waves, P.M. / let ring lines,
 * chord names above the staff, time signature and tempo.
 */
import type { TabSystem, Tuning } from '../core/types';
import { describeAnnotation, describeTabToken, tokenizeTabLine, type TabToken } from '../core/tab';
import { isValidChordName } from '../core/chords';
import { stringName } from '../core/parser';
import { esc } from './html';

/** SVG units per em (rows are sized in em so they scale with the font size). */
const U = 16;
const CW = 7; // width of one tab column
const PAD = 6; // space inside each measure, both sides
const GAP = 13; // distance between strings
const TOP = 47; // y of the top string
const LANE_CHORD = 13; // y of chord names
const LANE_FX = 28; // y of P.M. / let ring / vibrato lane

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

interface Sys {
  system: TabSystem;
  tokens: TabToken[][];
  annos: AnnoItem[];
  stacked: Map<number, number>;
}
interface Measure extends MeasureSpan {
  sys: Sys;
  number: number;
  natural: number;
  x: number;
  scale: number;
  row: number;
}

export interface StaffOptions {
  tuning: Tuning;
  /** Width available for a row, in em. */
  widthEm: number;
  showStringNames: boolean;
  /** Number of the first measure (numbering runs through the song). */
  firstMeasure: number;
  /** Draw time signature / tempo at the start (first tab of the song). */
  timeSig?: string | null;
  tempo?: number | null;
}

const isNote = (t: TabToken) => t.kind === 'fret' || t.kind === 'ghost' || t.kind === 'muted';

function neighbour(tokens: TabToken[], idx: number, dir: -1 | 1): number {
  for (let j = idx + dir; j >= 0 && j < tokens.length; j += dir) {
    const k = tokens[j].kind;
    if (k === 'fret' || k === 'ghost') return j;
    if (k === 'dash' || k === 'bar' || k === 'other') return -1;
  }
  return -1;
}

const tipAttr = (t: string | null) => (t ? ` data-tip="${esc(t)}"` : '');

export function renderStaff(systems: TabSystem[], o: StaffOptions): { html: string; measures: number } {
  const lines = o.tuning.notes.length;
  const labels = [...o.tuning.notes].reverse().map((n, i) => (i === 0 ? n.toLowerCase() : n));
  const lowIndex = (row: number) => lines - 1 - row;

  // ---- measures ----
  const measures: Measure[] = [];
  for (const system of systems) {
    const tokens = system.strings.map(tokenizeTabLine);
    const stacked = new Map<number, number>();
    tokens.forEach((row) => row.forEach((t) => isNote(t) && stacked.set(t.start, (stacked.get(t.start) ?? 0) + 1)));
    const sys: Sys = { system, tokens, annos: parseAnnotations(system.annotations), stacked };
    for (const span of systemMeasures(system.strings)) {
      measures.push({ ...span, sys, number: o.firstMeasure + measures.length, natural: (span.e - span.s) * CW + PAD * 2, x: 0, scale: 1, row: 0 });
    }
  }
  if (!measures.length) return { html: '', measures: 0 };

  // ---- rows (greedy fill, then justify) ----
  const total = Math.max(20, o.widthEm) * U;
  const clefW = 22;
  const sigW = o.timeSig ? 18 : 0;
  const rows: Measure[][] = [];
  let cur: Measure[] = [];
  let used = 0;
  for (const m of measures) {
    const avail = total - clefW - (rows.length === 0 ? sigW : 0);
    if (cur.length && used + m.natural > avail) { rows.push(cur); cur = []; used = 0; }
    cur.push(m);
    used += m.natural;
  }
  if (cur.length) rows.push(cur);

  const svgs = rows.map((row, ri) => {
    const first = ri === 0;
    const startX = clefW + (first ? sigW : 0);
    const natural = row.reduce((a, m) => a + m.natural, 0);
    const avail = total - startX;
    const lastRow = ri === rows.length - 1;
    const fill = natural / avail;
    const scale = !lastRow || fill > 0.6 ? Math.min(avail / natural, 3) : Math.min(avail / natural, 1.4);
    let x = startX;
    for (const m of row) { m.x = x; m.scale = scale; m.row = ri; x += m.natural * scale; }
    const endX = x;
    const width = Math.ceil(first || !lastRow ? total : Math.max(endX + 2, total * 0.4));
    const yS = (r: number) => TOP + r * GAP;
    const bottom = yS(lines - 1);
    const parts: string[] = [];

    // staff lines + system start line
    for (let r = 0; r < lines; r++) parts.push(`<line class="st-line" x1="2" y1="${yS(r)}" x2="${endX}" y2="${yS(r)}"/>`);
    parts.push(`<line class="st-bar" x1="2" y1="${TOP}" x2="2" y2="${bottom}"/>`);

    // clef: string names or T A B
    if (o.showStringNames) {
      labels.forEach((l, r) => {
        const sname = stringName(o.tuning, lowIndex(r));
        parts.push(`<text class="st-sname" x="11" y="${yS(r)}"${tipAttr(`${sname} string`)}>${esc(l)}</text>`);
      });
    } else {
      const mid = (TOP + bottom) / 2;
      ['T', 'A', 'B'].forEach((ch, i) => parts.push(`<text class="st-clef" x="12" y="${mid + (i - 1) * 15}">${ch}</text>`));
    }
    if (first && o.timeSig) {
      const [a, b] = o.timeSig.split('/');
      const mid = (TOP + bottom) / 2;
      parts.push(`<text class="st-sig" x="${clefW + 8}" y="${mid - 9}">${esc(a)}</text><text class="st-sig" x="${clefW + 8}" y="${mid + 15}">${esc(b)}</text>`);
    }

    const colX = (m: Measure, c: number, len = 1) => m.x + PAD * m.scale + (c - m.s + len / 2) * CW * m.scale;
    const measureOf = (sys: Sys, c: number) => row.find((m) => m.sys === sys && c >= m.s && c < m.e);

    row.forEach((m) => {
      const isLastOfAll = m === measures[measures.length - 1];
      const end = m.x + m.natural * m.scale;
      // measure number
      parts.push(`<text class="st-num" x="${m.x + 2}" y="${TOP - 5}">${m.number}</text>`);
      // bar lines
      if (m.startRepeat) {
        parts.push(`<rect class="st-thick" x="${m.x}" y="${TOP}" width="3" height="${bottom - TOP}"/><line class="st-bar" x1="${m.x + 5}" y1="${TOP}" x2="${m.x + 5}" y2="${bottom}"/>`);
        parts.push(`<circle class="st-dot" cx="${m.x + 9}" cy="${(TOP + bottom) / 2 - GAP / 2}" r="1.6"/><circle class="st-dot" cx="${m.x + 9}" cy="${(TOP + bottom) / 2 + GAP / 2}" r="1.6"/>`);
      }
      if (m.endRepeat) {
        parts.push(`<circle class="st-dot" cx="${end - 9}" cy="${(TOP + bottom) / 2 - GAP / 2}" r="1.6"/><circle class="st-dot" cx="${end - 9}" cy="${(TOP + bottom) / 2 + GAP / 2}" r="1.6"/>`);
        parts.push(`<line class="st-bar" x1="${end - 5}" y1="${TOP}" x2="${end - 5}" y2="${bottom}"/><rect class="st-thick" x="${end - 3}" y="${TOP}" width="3" height="${bottom - TOP}"/>`);
      } else if (isLastOfAll) {
        parts.push(`<line class="st-bar" x1="${end - 5}" y1="${TOP}" x2="${end - 5}" y2="${bottom}"/><rect class="st-thick" x="${end - 3}" y="${TOP}" width="3" height="${bottom - TOP}"/>`);
      } else {
        parts.push(`<line class="st-bar" x1="${end}" y1="${TOP}" x2="${end}" y2="${bottom}"/>`);
      }

      // notes and techniques
      m.sys.tokens.forEach((tokens, r) => {
        const sname = stringName(o.tuning, lowIndex(r));
        const y = yS(r);
        tokens.forEach((t, i) => {
          if (t.start < m.s || t.start >= m.e) return;
          const x = colX(m, t.start, t.text.length);
          let tip = describeTabToken(tokens, i, sname);
          const prevKind = tokens[i - 1]?.kind;
          if (isNote(t)) {
            if (prevKind === 'bend' || prevKind === 'release') return; // shown by the bend arrow
            const n = m.sys.stacked.get(t.start) ?? 0;
            if (tip && n > 1) tip += ` — played together with the other ${n - 1} stacked note${n > 2 ? 's' : ''}`;
            const label = t.kind === 'muted' ? 'X' : t.text;
            const w = label.length * 6.8 + 3;
            parts.push(`<g class="st-note"${tipAttr(tip)}><rect class="st-knock" x="${x - w / 2}" y="${y - 6.5}" width="${w}" height="13"/><text class="st-fret" x="${x}" y="${y}">${esc(label)}</text></g>`);
            return;
          }
          const a = neighbour(tokens, i, -1);
          const b = neighbour(tokens, i, 1);
          const xa = a >= 0 && measureOf(m.sys, tokens[a].start) ? colX(measureOf(m.sys, tokens[a].start)!, tokens[a].start, tokens[a].text.length) : x - CW;
          const xb = b >= 0 && measureOf(m.sys, tokens[b].start) ? colX(measureOf(m.sys, tokens[b].start)!, tokens[b].start, tokens[b].text.length) : x + CW;
          switch (t.kind) {
            case 'hammer':
            case 'pull': {
              const top = y - 8;
              const mid = (xa + xb) / 2;
              parts.push(`<g class="st-fx"${tipAttr(tip)}><rect class="st-hit" x="${xa}" y="${top - 12}" width="${Math.max(8, xb - xa)}" height="12"/>
                <path class="st-slur" d="M${xa + 1} ${top} Q${mid} ${top - 7} ${xb - 1} ${top}"/>
                <text class="st-hp" x="${mid}" y="${top - 8}">${t.kind === 'hammer' ? 'H' : 'P'}</text></g>`);
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
              const ay = LANE_FX + 4;
              parts.push(`<g class="st-fx"${tipAttr(tip)}><rect class="st-hit" x="${xa + 2}" y="${ay - 10}" width="16" height="${y - ay + 10}"/>
                <path class="st-bend" d="M${xa + 5} ${y} Q${ax} ${y} ${ax} ${ay + 4}"/>
                <path class="st-arrow" d="M${ax - 3} ${ay + 5} L${ax} ${ay} L${ax + 3} ${ay + 5} Z"/>
                <text class="st-amt" x="${ax}" y="${ay - 3}">${amount}</text></g>`);
              break;
            }
            case 'release': {
              const ay = LANE_FX + 4;
              const rx = b >= 0 ? xb : x + CW;
              parts.push(`<g class="st-fx"${tipAttr(tip)}><rect class="st-hit" x="${rx - 8}" y="${ay}" width="12" height="${y - ay}"/>
                <path class="st-bend" d="M${rx - 6} ${ay + 2} Q${rx} ${ay + 2} ${rx} ${y - 9}"/>
                <path class="st-arrow" d="M${rx - 3} ${y - 13} L${rx} ${y - 8} L${rx + 3} ${y - 13} Z"/></g>`);
              break;
            }
            case 'vibrato': {
              const x0 = colX(m, t.start) - 3;
              const x1 = colX(m, t.start + t.text.length - 1) + 4;
              let d = `M${x0} ${LANE_FX + 8}`;
              for (let k = x0, up = true; k < x1; k += 3, up = !up) d += ` L${Math.min(k + 3, x1)} ${LANE_FX + (up ? 6 : 10)}`;
              parts.push(`<g class="st-fx"${tipAttr(tip)}><rect class="st-hit" x="${x0}" y="${LANE_FX + 3}" width="${x1 - x0}" height="9"/><path class="st-vib" d="${d}"/></g>`);
              break;
            }
            default:
              break;
          }
        });
      });
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
          const tipText = describeAnnotation(it.text);
          parts.push(`<g class="st-fx"${tipAttr(tipText)}><rect class="st-hit" x="${x0}" y="${LANE_FX - 8}" width="${x1 - x0}" height="11"/>
            ${labelHere ? `<text class="st-effect" x="${x0}" y="${LANE_FX}">${name}</text>` : ''}
            <line class="st-dash" x1="${x0 + lw}" y1="${LANE_FX - 3}" x2="${x1}" y2="${LANE_FX - 3}"/>
            ${it.end <= rowEnd ? `<line class="st-tick" x1="${x1}" y1="${LANE_FX - 6}" x2="${x1}" y2="${LANE_FX}"/>` : ''}</g>`);
        }
      }
    }

    // The tempo gets its own line above the first row so it never collides with chord names.
    const dy = first && o.tempo ? 14 : 0;
    const tempo = dy ? `<text class="st-tempo" x="4" y="10">♩ = ${o.tempo}</text>` : '';
    const height = bottom + 12 + dy;
    return `<svg class="staff-row" viewBox="0 0 ${width} ${height}" style="width:${(width / U).toFixed(3)}em" role="img" aria-label="Tab, measures ${row[0].number}–${row[row.length - 1].number}">${tempo}<g transform="translate(0 ${dy})">${parts.join('')}</g></svg>`;
  });

  return { html: `<div class="staff">${svgs.join('')}</div>`, measures: measures.length };
}
