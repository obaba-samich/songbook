/**
 * Turn a section's chords + strum pattern into real tab for the selected
 * guitar, so sections without hand-written tab still show a full staff:
 * each strum stroke becomes stacked fret numbers from that guitar's chord
 * shape, with rhythm, pick strokes, chord names and lyrics attached.
 */
import type { Section, Stroke } from '../core/types';
import { NO_CHORD } from '../core/chords';
import { guitarOf, shapeFor } from '../core/transpose';
import { chordName, strumsFor, type ViewCtx } from './common';
import type { StaffSystem } from './tabStaff';

interface Span { chord: string | null; words: string[]; line: number }

/** Chords of a section in order, each with the lyric words sung over it. */
export function chordSpans(section: Section): Span[] {
  const spans: Span[] = [];
  const pickup: string[] = [];
  let lineNo = -1;
  for (const b of section.body) {
    if (b.kind !== 'lyric') continue;
    if (b.segments.some((x) => x.chord !== null)) lineNo++;
    b.segments.forEach((seg, i) => {
      const words = seg.text.split(/\s+/).filter(Boolean);
      const next = b.segments[i + 1];
      // A chord in the middle of a word: "A[G]mazing" → "A-" + "mazing".
      if (words.length && !/\s$/.test(seg.text) && next && /^\S/.test(next.text)) words[words.length - 1] += '-';
      if (seg.chord !== null) spans.push({ chord: seg.chord === NO_CHORD ? null : seg.chord, words, line: lineNo });
      else if (spans.length) spans[spans.length - 1].words.push(...words);
      else pickup.push(...words);
    });
  }
  if (spans.length && pickup.length) spans[0].words.unshift(...pickup);
  return spans;
}

export function barTicks(time: string): number {
  const [beats, unit] = time.split('/').map(Number);
  return Math.round((beats * 16) / (unit || 4)) || 16;
}

export interface Slot {
  bar: number; stroke: Stroke; ticks: number;
  /** Strum pattern name ('' when none was given). */
  pattern: string;
  /** Fingerpicking: strings picked on this slot (see StrumPattern.picks). */
  pick?: string[];
}

/**
 * Strings (low-first index) a picking slot plays on a chord shape.
 * B = lowest sounding string; A = alternate bass (string 4 when the bass is
 * on 6, else the next sounding string up); numbers are string numbers, 1 = thinnest.
 */
export function pickStrings(pick: string[], frets: (number | null)[]): number[] {
  const n = frets.length;
  const sounding = frets.map((f, i) => (f === null ? -1 : i)).filter((i) => i >= 0);
  if (!sounding.length) return [];
  const bass = sounding[0];
  const alt = bass === 0 && n >= 6 && frets[2] !== null ? 2 : sounding.find((i) => i > bass) ?? bass;
  const out = new Set<number>();
  for (const t of pick) {
    const i = t === 'B' ? bass : t === 'A' ? alt : n - Number(t);
    if (i >= 0 && i < n && frets[i] !== null) out.add(i);
  }
  return [...out].sort((a, b) => a - b);
}

/** Strum strokes for the section, one bar per pattern repeat. */
export function strumBars(section: Section, ctx: ViewCtx, chords: number): Slot[][] {
  const { song } = ctx;
  const bt = barTicks(song.meta.time);
  let refs = strumsFor(section, guitarOf(song, ctx.settings).id);
  if (!refs.length) refs = strumsFor(section, song.guitars[0].id);
  const bars: Slot[][] = [];
  for (const ref of refs) {
    const p = song.strums.get(ref.name);
    if (!p) continue;
    const ticks = Math.max(1, Math.round(bt / p.strokes.length));
    for (let r = 0; r < ref.repeat; r++) bars.push(p.strokes.map((stroke, i) => ({ bar: bars.length, stroke, ticks, pattern: p.name, pick: p.picks?.[i] })));
  }
  if (!bars.length) {
    // No strum given: one ringing strum per chord, a bar each.
    const beats = Number(song.meta.time.split('/')[0]) || 4;
    const ticks = Math.max(1, Math.round(bt / beats));
    for (let i = 0; i < chords; i++) bars.push(Array.from({ length: beats }, (_, k) => ({ bar: i, stroke: (k ? '-' : 'D') as Stroke, ticks, pattern: '' })));
  }
  return bars;
}

/**
 * First slot of each chord. Bars are shared out between lyric lines (a line
 * is usually a phrase of equal length); inside a line each chord gets whole
 * bars when there are enough; extra chords share the line's last bars, split
 * on the beat (5 chords in 4 bars → Em | D | G | Gsus4 G).
 */
export function chordStarts(spans: { line: number }[], barLens: number[], beats: number, firstSlotOfBar: number[]): number[] {
  const B = barLens.length;
  const lineIds = [...new Set(spans.map((s) => s.line))];
  const L = lineIds.length;
  const starts: number[] = [];
  lineIds.forEach((id, li) => {
    const idx = spans.map((s, i) => (s.line === id ? i : -1)).filter((i) => i >= 0);
    const b0 = L <= B ? Math.floor((li * B) / L) : Math.min(B - 1, Math.floor((li * B) / L));
    const b1 = L <= B ? Math.floor(((li + 1) * B) / L) : Math.max(b0 + 1, Math.floor(((li + 1) * B) / L));
    const nb = Math.max(1, b1 - b0);
    const k = idx.length;
    if (nb >= k) {
      idx.forEach((si, j) => (starts[si] = firstSlotOfBar[b0 + Math.floor((j * nb) / k)]));
    } else if (k <= nb * 2) {
      // More chords than bars: early chords keep whole bars, the last bars are
      // shared by two chords, split on the beat nearest the middle.
      const whole = nb * 2 - k;
      let j = 0;
      for (let bar = 0; bar < nb; bar++) {
        const b = b0 + bar;
        const len = barLens[b] ?? beats;
        starts[idx[j++]] = firstSlotOfBar[b];
        if (bar >= whole && j < k) {
          const perBeat = Math.max(1, Math.round(len / beats));
          const half = Math.max(perBeat, Math.min(len - 1, Math.round(len / 2 / perBeat) * perBeat));
          starts[idx[j++]] = firstSlotOfBar[b] + half;
        }
      }
    } else {
      const s0 = firstSlotOfBar[b0];
      const s1 = firstSlotOfBar[Math.min(B, b0 + nb)];
      const perBeat = Math.max(1, Math.round((barLens[b0] ?? beats) / beats));
      const total = s1 - s0;
      idx.forEach((si, j) => {
        const raw = Math.floor((j * total) / k);
        starts[si] = s0 + Math.min(total - 1, Math.round(raw / perBeat) * perBeat);
      });
    }
  });
  // Keep starts strictly increasing.
  for (let i = 1; i < starts.length; i++) if (starts[i] <= starts[i - 1]) starts[i] = starts[i - 1] + 1;
  return starts;
}

const colsFor = (text: string, perChar: number) => Math.ceil(text.length * perChar) + 1;

export interface SectionLayout {
  spans: Span[];
  bars: Slot[][];
  slots: Slot[];
  /** First slot of each bar, plus the total slot count at the end. */
  firstSlotOfBar: number[];
  /** First slot of each chord span. */
  starts: number[];
  /** Index of the chord span sounding at a slot. */
  chordAt: (slot: number) => number;
}

/** Which chord sounds on which strum of which bar — shared by the tab and the chord chart. */
export function sectionLayout(section: Section, ctx: ViewCtx): SectionLayout | null {
  const spans = chordSpans(section);
  if (!spans.length) return null;
  const bars = strumBars(section, ctx, spans.length);
  const slots = bars.flat();
  const k = spans.length;
  const firstSlotOfBar = bars.map((_, i) => bars.slice(0, i).reduce((a, b) => a + b.length, 0));
  firstSlotOfBar.push(slots.length);
  const starts = chordStarts(spans, bars.map((b) => b.length), Number(ctx.song.meta.time.split('/')[0]) || 4, firstSlotOfBar);
  const chordAt = (s: number) => { let c = 0; for (let i = 0; i < k; i++) if (starts[i] <= s) c = i; return c; };
  return { spans, bars, slots, firstSlotOfBar, starts, chordAt };
}

export function chordSystems(section: Section, ctx: ViewCtx): StaffSystem[] {
  const layout = sectionLayout(section, ctx);
  if (!layout) return [];
  const { spans, slots, starts, chordAt } = layout;
  const guitar = guitarOf(ctx.song, ctx.settings);
  const lines = guitar.tuning.notes.length;
  const k = spans.length;

  // Lyric words spread over the sounding strokes of their chord.
  const lyricAt = new Map<number, string>();
  spans.forEach((sp, i) => {
    if (!sp.words.length) return;
    const end = i + 1 < k ? starts[i + 1] : slots.length;
    let sounding: number[] = [];
    for (let s = starts[i]; s < end; s++) if (slots[s].stroke !== '-') sounding.push(s);
    if (!sounding.length) sounding = [starts[i]];
    sp.words.forEach((w, j) => {
      const s = sounding[Math.min(sounding.length - 1, Math.floor((j * sounding.length) / sp.words.length))];
      lyricAt.set(s, lyricAt.has(s) ? `${lyricAt.get(s)} ${w}` : w);
    });
  });

  const shapes = spans.map((sp) => (sp.chord ? shapeFor(sp.chord, ctx.song, ctx.settings) : null));
  const rows: string[] = Array(lines).fill('|');
  let anno = ' ';
  const rhythm = new Map<number, { tick: number; dur: number }>();
  let tickInBar = 0;
  const lyrics: { col: number; text: string }[] = [];
  const strokes: { col: number; dir: 'D' | 'U' }[] = [];

  slots.forEach((slot, s) => {
    const ci = chordAt(s);
    const shape = shapes[ci];
    const frets = shape?.frets ?? [];
    const sounding = frets.map((f, i) => (f === null ? -1 : i)).filter((i) => i >= 0);
    let play: number[] = [];
    if (slot.pick) play = pickStrings(slot.pick, frets);
    else if (slot.stroke === 'D' || slot.stroke === 'X') play = sounding;
    else if (slot.stroke === 'U') play = sounding.slice(-4);
    const cell = (low: number) => (play.includes(low) ? (slot.stroke === 'X' ? 'x' : String(frets[low])) : '');
    const isChordStart = starts[ci] === s && spans[ci].chord;
    const name = isChordStart ? chordName(ctx, spans[ci].chord!) : '';
    const lyric = lyricAt.get(s) ?? '';
    const w = Math.max(3, ...frets.map((f) => (f === null ? 0 : String(f).length + 1)), lyric ? colsFor(lyric, 0.72) : 0, name ? colsFor(name, 0.95) : 0);
    const col = rows[0].length;
    for (let r = 0; r < lines; r++) rows[r] += cell(lines - 1 - r).padEnd(w, '-');
    if (name) anno = anno.padEnd(col) + name;
    if (lyric) lyrics.push({ col, text: lyric });
    if (play.length) {
      let rest = 0;
      for (let j = s + 1; j < slots.length && slots[j].bar === slot.bar && slots[j].stroke === '-'; j++) rest++;
      rhythm.set(col, { tick: tickInBar, dur: slot.ticks * (1 + rest) });
      if (slot.stroke !== 'X' && !slot.pick) strokes.push({ col, dir: slot.stroke as 'D' | 'U' });
    }
    tickInBar += slot.ticks;
    const lastInBar = s + 1 >= slots.length || slots[s + 1].bar !== slot.bar;
    if (lastInBar) {
      for (let r = 0; r < lines; r++) rows[r] += '|';
      tickInBar = 0;
    }
  });

  return [{
    line: section.line,
    annotations: anno.trim() ? [anno] : [],
    strings: rows,
    labelled: false,
    rhythm,
    lyrics,
    strokes,
    generated: true,
  }];
}
