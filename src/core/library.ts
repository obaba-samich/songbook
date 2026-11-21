/** Built-in chord shapes, tunings, and chord lookup. */
import type { ChordShape, Frets, Tuning } from './types';
import { normalizeChord, normalizeQuality, notePc, parseChord, NO_CHORD } from './chords';

export const STANDARD: Tuning = { name: 'Standard', notes: ['E', 'A', 'D', 'G', 'B', 'E'] };

export const TUNINGS: Record<string, Tuning> = {
  standard: STANDARD,
  'drop d': { name: 'Drop D', notes: ['D', 'A', 'D', 'G', 'B', 'E'] },
  dadgad: { name: 'DADGAD', notes: ['D', 'A', 'D', 'G', 'A', 'D'] },
  'open g': { name: 'Open G', notes: ['D', 'G', 'D', 'G', 'B', 'D'] },
  'open d': { name: 'Open D', notes: ['D', 'A', 'D', 'F#', 'A', 'D'] },
  'half step down': { name: 'Half step down', notes: ['Eb', 'Ab', 'Db', 'Gb', 'Bb', 'Eb'] },
};

/** Parse a {tuning:} value: a known name or 6 note names low → high. */
export function parseTuning(value: string): Tuning | null {
  const key = value.trim().toLowerCase().replace(/\s+/g, ' ');
  if (key in TUNINGS) return TUNINGS[key];
  const notes = value.trim().split(/[\s,]+/);
  if (notes.length !== 6 || notes.some((n) => notePc(n) === null)) return null;
  const norm = notes.map((n) => n[0].toUpperCase() + n.slice(1));
  const known = Object.values(TUNINGS).find((t) => t.notes.every((n, i) => notePc(n) === notePc(norm[i])));
  return known ?? { name: norm.join(' '), notes: norm };
}

type Raw = [string, string];
const x = null;

/** Open and common shapes: "frets" then "fingers", lowest string first. */
const OPEN: Record<string, Raw> = {
  A: ['x 0 2 2 2 0', '0 0 1 2 3 0'],
  Am: ['x 0 2 2 1 0', '0 0 2 3 1 0'],
  A7: ['x 0 2 0 2 0', '0 0 2 0 3 0'],
  Am7: ['x 0 2 0 1 0', '0 0 2 0 1 0'],
  Amaj7: ['x 0 2 1 2 0', '0 0 2 1 3 0'],
  Asus2: ['x 0 2 2 0 0', '0 0 1 2 0 0'],
  Asus4: ['x 0 2 2 3 0', '0 0 1 2 3 0'],
  A5: ['x 0 2 2 x x', '0 0 1 2 0 0'],
  B7: ['x 2 1 2 0 2', '0 2 1 3 0 4'],
  Bm: ['x 2 4 4 3 2', '0 1 3 4 2 1'],
  C: ['x 3 2 0 1 0', '0 3 2 0 1 0'],
  C7: ['x 3 2 3 1 0', '0 3 2 4 1 0'],
  Cmaj7: ['x 3 2 0 0 0', '0 3 2 0 0 0'],
  Cadd9: ['x 3 2 0 3 3', '0 2 1 0 3 4'],
  D: ['x x 0 2 3 2', '0 0 0 1 3 2'],
  Dm: ['x x 0 2 3 1', '0 0 0 2 3 1'],
  D7: ['x x 0 2 1 2', '0 0 0 2 1 3'],
  Dm7: ['x x 0 2 1 1', '0 0 0 2 1 1'],
  Dmaj7: ['x x 0 2 2 2', '0 0 0 1 1 1'],
  Dsus2: ['x x 0 2 3 0', '0 0 0 1 3 0'],
  Dsus4: ['x x 0 2 3 3', '0 0 0 1 3 4'],
  D5: ['x x 0 2 3 x', '0 0 0 1 3 0'],
  E: ['0 2 2 1 0 0', '0 2 3 1 0 0'],
  Em: ['0 2 2 0 0 0', '0 2 3 0 0 0'],
  E7: ['0 2 0 1 0 0', '0 2 0 1 0 0'],
  Em7: ['0 2 0 0 0 0', '0 2 0 0 0 0'],
  Esus4: ['0 2 2 2 0 0', '0 2 3 4 0 0'],
  E5: ['0 2 2 x x x', '0 1 2 0 0 0'],
  F: ['1 3 3 2 1 1', '1 3 4 2 1 1'],
  Fmaj7: ['x x 3 2 1 0', '0 0 3 2 1 0'],
  G: ['3 2 0 0 0 3', '2 1 0 0 0 3'],
  G7: ['3 2 0 0 0 1', '3 2 0 0 0 1'],
  G5: ['3 5 5 x x x', '1 3 4 0 0 0'],
  Gmaj7: ['3 2 0 0 0 2', '3 2 0 0 0 1'],
  // slash chords
  'G/B': ['x 2 0 0 0 3', '0 1 0 0 0 3'],
  'C/G': ['3 3 2 0 1 0', '3 4 2 0 1 0'],
  'C/E': ['0 3 2 0 1 0', '0 3 2 0 1 0'],
  'D/F#': ['2 x 0 2 3 2', '1 0 0 2 4 3'],
  'Am/G': ['3 0 2 2 1 0', '4 0 2 3 1 0'],
  'Am/E': ['0 0 2 2 1 0', '0 0 2 3 1 0'],
  'F/C': ['x 3 3 2 1 1', '0 3 4 2 1 1'],
  'G/F#': ['2 2 0 0 0 3', '2 1 0 0 0 4'],
  'D/A': ['x 0 0 2 3 2', '0 0 0 1 3 2'],
  'Em/D': ['x x 0 0 0 0', '0 0 0 0 0 0'],
};

type Template = { offs: (number | null)[]; fingers?: number[] };

/** Movable barre templates: offsets from the root fret. E-shape: root on string 1 (low). */
const E_SHAPE: Record<string, Template> = {
  '': { offs: [0, 2, 2, 1, 0, 0], fingers: [1, 3, 4, 2, 1, 1] },
  m: { offs: [0, 2, 2, 0, 0, 0], fingers: [1, 3, 4, 1, 1, 1] },
  '7': { offs: [0, 2, 0, 1, 0, 0], fingers: [1, 3, 1, 2, 1, 1] },
  m7: { offs: [0, 2, 0, 0, 0, 0], fingers: [1, 3, 1, 1, 1, 1] },
  maj7: { offs: [0, x, 1, 1, 0, x], fingers: [1, 0, 3, 4, 2, 0] },
  sus4: { offs: [0, 2, 2, 2, 0, 0], fingers: [1, 2, 3, 4, 1, 1] },
  '5': { offs: [0, 2, 2, x, x, x], fingers: [1, 3, 4, 0, 0, 0] },
};

/** A-shape: root on string 2, low string muted. */
const A_SHAPE: Record<string, Template> = {
  '': { offs: [x, 0, 2, 2, 2, 0], fingers: [0, 1, 3, 3, 3, 1] },
  m: { offs: [x, 0, 2, 2, 1, 0], fingers: [0, 1, 3, 4, 2, 1] },
  '7': { offs: [x, 0, 2, 0, 2, 0], fingers: [0, 1, 3, 1, 4, 1] },
  m7: { offs: [x, 0, 2, 0, 1, 0], fingers: [0, 1, 3, 1, 2, 1] },
  maj7: { offs: [x, 0, 2, 1, 2, 0], fingers: [0, 1, 3, 2, 4, 1] },
  sus2: { offs: [x, 0, 2, 2, 0, 0], fingers: [0, 1, 3, 4, 1, 1] },
  sus4: { offs: [x, 0, 2, 2, 3, 0], fingers: [0, 1, 2, 3, 4, 1] },
  '5': { offs: [x, 0, 2, 2, x, x], fingers: [0, 1, 3, 4, 0, 0] },
  '6': { offs: [x, 0, 2, 2, 2, 2], fingers: [0, 1, 3, 3, 3, 3] },
  m6: { offs: [x, 0, 2, 2, 1, 2], fingers: [0, 1, 3, 3, 2, 4] },
  '9': { offs: [x, 0, -1, 0, 0, 0], fingers: [0, 2, 1, 3, 3, 3] },
  dim: { offs: [x, 0, 1, 2, 1, x], fingers: [0, 1, 2, 4, 3, 0] },
  dim7: { offs: [x, 0, 1, 2, 1, 2] },
  m7b5: { offs: [x, 0, 1, 0, 1, x] },
  aug: { offs: [x, 0, 3, 2, 2, 1] },
};

/** Qualities the generator can build on any root (documented in INSTRUCTIONS.md). */
export const GENERATED_QUALITIES = [...new Set([...Object.keys(E_SHAPE), ...Object.keys(A_SHAPE)])];
export const OPEN_CHORD_NAMES = Object.keys(OPEN);

function parseFretList(s: string): Frets {
  return s.split(/\s+/).map((t) => (t === 'x' ? null : Number(t)));
}

const OPEN_SHAPES = new Map<string, ChordShape>(
  Object.entries(OPEN).map(([name, [f, fi]]) => [
    name,
    { frets: parseFretList(f), fingers: parseFretList(fi), source: 'library' as const },
  ]),
);

function fromTemplate(t: Template, root: number): ChordShape | null {
  let r = root;
  if (t.offs.some((o) => o !== null && o + r < 0)) r += 12;
  const frets = t.offs.map((o) => (o === null ? null : o + r));
  // At the open position the "barre" finger becomes open strings.
  const fingers = t.fingers?.map((f, i) => (frets[i] === null ? 0 : r === 0 && t.offs[i] === 0 ? 0 : f));
  return { frets, fingers: r === 0 ? undefined : fingers, source: 'generated' };
}

function generate(rootPc: number, quality: string): ChordShape | null {
  const candidates: { r: number; t: Template; order: number }[] = [];
  if (quality in E_SHAPE) candidates.push({ r: (rootPc - 4 + 12) % 12, t: E_SHAPE[quality], order: 0 });
  if (quality in A_SHAPE) candidates.push({ r: (rootPc - 9 + 12) % 12, t: A_SHAPE[quality], order: 1 });
  if (!candidates.length) return null;
  const effective = (c: (typeof candidates)[number]) => (c.t.offs.some((o) => o !== null && o + c.r < 0) ? c.r + 12 : c.r);
  candidates.sort((a, b) => effective(a) - effective(b) || a.order - b.order);
  return fromTemplate(candidates[0].t, candidates[0].r);
}

/** Re-fret a standard-tuning shape so it sounds the same notes in another tuning. */
function retune(shape: ChordShape, tuning: Tuning): ChordShape {
  if (tuning === STANDARD || tuning.notes.every((n, i) => notePc(n) === notePc(STANDARD.notes[i]))) return shape;
  const frets = shape.frets.map((f, i) => {
    if (f === null) return null;
    let diff = ((notePc(tuning.notes[i])! - notePc(STANDARD.notes[i])! + 18) % 12) - 6; // -6..5
    const nf = f - diff;
    return nf < 0 ? null : nf;
  });
  return { ...shape, frets, fingers: undefined };
}

/** Try to put a slash chord's bass note on string 1 or 2 of `shape`. */
function fitBass(shape: ChordShape, bassPc: number, tuning: Tuning): ChordShape {
  const fretted = shape.frets.filter((f): f is number => f !== null && f > 0);
  const lo = fretted.length ? Math.min(...fretted) : 1;
  const hi = fretted.length ? Math.max(...fretted) : 1;
  for (const s of [0, 1]) {
    const open = notePc(tuning.notes[s])!;
    for (let f = 0; f <= Math.max(hi + 1, 4); f++) {
      if ((open + f) % 12 !== bassPc) continue;
      const span = Math.max(hi, f) - Math.min(lo, f > 0 ? f : lo);
      if (f > 0 && span > 3) continue;
      const frets = [...shape.frets];
      frets[s] = f;
      if (s === 1) frets[0] = null;
      return { frets, source: 'generated' };
    }
  }
  return { ...shape, bassHint: undefined };
}

export interface LookupOptions {
  defines?: Map<string, ChordShape>;
  tuning?: Tuning;
}

/** Find a shape for a chord name: song defines → open library → generated barre. */
export function lookupChord(name: string, opts: LookupOptions = {}): ChordShape | null {
  if (name === NO_CHORD) return null;
  const tuning = opts.tuning ?? STANDARD;
  const defined = opts.defines?.get(name) ?? opts.defines?.get(normalizeChord(name));
  if (defined) return defined;
  const norm = normalizeChord(name);
  const open = OPEN_SHAPES.get(norm);
  if (open) return retune(open, tuning);
  const p = parseChord(norm);
  if (!p) return null;
  const rootPc = notePc(p.root)!;
  const quality = normalizeQuality(p.quality);
  let base: ChordShape | null = OPEN_SHAPES.get(p.root + quality) ?? null;
  if (!base) base = generate(rootPc, quality);
  if (!base) return null;
  base = retune(base, tuning);
  if (!p.bass || notePc(p.bass) === rootPc) return base;
  const fitted = fitBass(base, notePc(p.bass)!, tuning);
  if (fitted.frets.every((f, i) => f === base!.frets[i])) return { ...base, bassHint: p.bass };
  return fitted;
}

/** Whether a chord is playable from the library or the song's defines. */
export function hasChord(name: string, defines?: Map<string, ChordShape>): boolean {
  return name === NO_CHORD || lookupChord(name, { defines }) !== null;
}

/** Move a whole shape up/down the neck. Null if it has open strings or goes below fret 1. */
export function shiftShape(shape: ChordShape, semitones: number): ChordShape | null {
  if (semitones === 0) return shape;
  for (const n of [semitones, semitones + 12, semitones - 12]) {
    const ok = shape.frets.every((f) => f === null || (f > 0 && f + n >= 1 && f + n <= 15));
    if (ok) return { ...shape, frets: shape.frets.map((f) => (f === null ? null : f + n)), source: 'shifted' };
  }
  return null;
}
