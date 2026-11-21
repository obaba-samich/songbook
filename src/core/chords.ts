/** Chord-name parsing, normalisation and transposition. */

const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export const NO_CHORD = 'N.C.';

/** Pitch class (0-11) of a note name like "F#", "Bb", "e". Null if invalid. */
export function notePc(note: string): number | null {
  const m = /^([A-Ga-g])([#b]?)$/.exec(note.trim());
  if (!m) return null;
  let pc = LETTER_PC[m[1].toUpperCase()];
  if (m[2] === '#') pc += 1;
  if (m[2] === 'b') pc -= 1;
  return (pc + 12) % 12;
}

export function pcName(pc: number, flats: boolean): string {
  return (flats ? FLATS : SHARPS)[((pc % 12) + 12) % 12];
}

export interface ParsedChord {
  root: string;
  /** Quality suffix as written, e.g. "m7", "sus4", "". */
  quality: string;
  bass: string | null;
}

const QUALITY_RE = /^(?:m|maj|min|dim|aug|sus|add|M|\+|°|ø|Δ|-|\d|#|b|\(|\)|\/(?=\d))*$/;

/** Parse a chord name. Returns null when it can't be read as a chord. */
export function parseChord(name: string): ParsedChord | null {
  const m = /^([A-G][#b]?)(.*?)(?:\/([A-G][#b]?))?$/.exec(name.trim());
  if (!m) return null;
  const [, root, quality, bass] = m;
  if (!QUALITY_RE.test(quality)) return null;
  return { root, quality, bass: bass ?? null };
}

export function isValidChordName(name: string): boolean {
  return name === NO_CHORD || parseChord(name) !== null;
}

/** Map quality aliases onto the canonical names the library uses. */
export function normalizeQuality(q: string): string {
  const table: Record<string, string> = {
    '': '', maj: '', M: '',
    min: 'm', '-': 'm', mi: 'm',
    M7: 'maj7', Δ: 'maj7', Δ7: 'maj7', ma7: 'maj7', 'maj7': 'maj7',
    min7: 'm7', '-7': 'm7',
    '+': 'aug', '°': 'dim', o: 'dim', '°7': 'dim7', o7: 'dim7',
    ø: 'm7b5', ø7: 'm7b5', 'm7-5': 'm7b5', 'min7b5': 'm7b5',
    sus: 'sus4', '7sus': '7sus4',
    min6: 'm6', '-6': 'm6',
  };
  return q in table ? table[q] : q;
}

/** Canonical form of a chord name ("Cmin" → "Cm", "Bbmaj7" stays). */
export function normalizeChord(name: string): string {
  if (name === NO_CHORD) return name;
  const p = parseChord(name);
  if (!p) return name;
  return p.root + normalizeQuality(p.quality) + (p.bass ? '/' + p.bass : '');
}

const FLAT_KEYS = new Set(['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb', 'Dm', 'Gm', 'Cm', 'Fm', 'Bbm', 'Ebm', 'Abm']);

/** Whether a key is conventionally spelled with flats. */
export function keyUsesFlats(key: string | null): boolean | null {
  if (!key) return null;
  return FLAT_KEYS.has(key.trim());
}

/** Transpose a single note name. */
export function transposeNote(note: string, semitones: number, flats: boolean): string {
  const pc = notePc(note);
  if (pc === null) return note;
  return pcName(pc + semitones, flats);
}

/** Transpose a key like "A" or "F#m". */
export function transposeKey(key: string, semitones: number): string {
  const m = /^([A-G][#b]?)(m?)$/.exec(key.trim());
  if (!m) return key;
  const minor = m[2];
  // Pick whichever spelling is a "real" key signature; prefer sharps on a tie.
  const sharp = transposeNote(m[1], semitones, false) + minor;
  const flat = transposeNote(m[1], semitones, true) + minor;
  if (sharp === flat) return sharp;
  return FLAT_KEYS.has(flat) ? flat : sharp;
}

/**
 * Transpose a chord name by `semitones`. `flats` picks the spelling for
 * accidentals; when null, keep whatever accidental style the chord used.
 */
export function transposeChord(name: string, semitones: number, flats: boolean | null = null): string {
  if (name === NO_CHORD || semitones % 12 === 0) return name;
  const p = parseChord(name);
  if (!p) return name;
  const useFlats = flats ?? (p.root.includes('b') || (p.bass?.includes('b') ?? false));
  const root = transposeNote(p.root, semitones, useFlats);
  const bass = p.bass ? '/' + transposeNote(p.bass, semitones, useFlats) : '';
  return root + p.quality + bass;
}

/** Is a key string valid ("A", "F#m", "Bb")? */
export function isValidKey(key: string): boolean {
  return /^[A-G][#b]?m?$/.test(key.trim());
}
