/** Tab tokenizing, plain-English descriptions for tooltips, and line wrapping. */

export type TabTokenKind =
  | 'fret' | 'ghost' | 'muted' | 'hammer' | 'pull' | 'slideUp' | 'slideDown'
  | 'bend' | 'release' | 'vibrato' | 'bar' | 'repeat' | 'dash' | 'other';

export interface TabToken {
  kind: TabTokenKind;
  /** Column (0-based) in the string content. */
  start: number;
  text: string;
  fret?: number;
}

/** Split one string line of tab into tokens. Two-digit frets are one token. */
export function tokenizeTabLine(line: string): TabToken[] {
  const out: TabToken[] = [];
  let i = 0;
  const single: Record<string, TabTokenKind> = {
    h: 'hammer', p: 'pull', '/': 'slideUp', '\\': 'slideDown', b: 'bend', r: 'release',
    '~': 'vibrato', '|': 'bar', ':': 'repeat', '-': 'dash', x: 'muted', X: 'muted',
  };
  while (i < line.length) {
    const ch = line[i];
    const ghost = /^\((\d{1,2})\)/.exec(line.slice(i));
    if (ghost) {
      out.push({ kind: 'ghost', start: i, text: ghost[0], fret: Number(ghost[1]) });
      i += ghost[0].length;
      continue;
    }
    if (/\d/.test(ch)) {
      const m = /^\d{1,2}/.exec(line.slice(i))!;
      out.push({ kind: 'fret', start: i, text: m[0], fret: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (ch === '~') {
      const m = /^~+/.exec(line.slice(i))!;
      out.push({ kind: 'vibrato', start: i, text: m[0] });
      i += m[0].length;
      continue;
    }
    out.push({ kind: single[ch] ?? 'other', start: i, text: ch });
    i++;
  }
  return out;
}

export function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
  return n + (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
}

function nearFret(tokens: TabToken[], idx: number, dir: -1 | 1): number | null {
  for (let j = idx + dir; j >= 0 && j < tokens.length; j += dir) {
    const t = tokens[j];
    if (t.kind === 'fret' || t.kind === 'ghost') return t.fret!;
    if (t.kind === 'dash' || t.kind === 'bar') return null;
  }
  return null;
}

const fretWord = (f: number | null) => (f === null ? 'the previous note' : f === 0 ? 'the open string' : `fret ${f}`);

/**
 * Tooltip text for a token. `stringLabel` is e.g. "A" or "high e".
 * Returns null for plain dashes and spaces (no tooltip).
 */
export function describeTabToken(tokens: TabToken[], idx: number, stringLabel: string): string | null {
  const t = tokens[idx];
  const prev = nearFret(tokens, idx, -1);
  const next = nearFret(tokens, idx, 1);
  const on = `on the ${stringLabel} string`;
  switch (t.kind) {
    case 'fret':
      return t.fret === 0
        ? `Open ${stringLabel} string — pick it without fretting (0 = open)`
        : `${ordinal(t.fret!)} fret ${on}`;
    case 'ghost': return `Ghost note: fret ${t.fret} ${on}, played very quietly (or left out)`;
    case 'muted': return `Muted note ${on} — rest a finger lightly on the string and pick for a percussive "chk"`;
    case 'hammer': return `Hammer-on from ${fretWord(prev)} to ${fretWord(next)} — pick the first note, then hammer a finger down onto the second without picking again`;
    case 'pull': return `Pull-off from ${fretWord(prev)} to ${fretWord(next)} — pick the first note, then flick that finger off the string so the second note sounds`;
    case 'slideUp':
      if (prev !== null && next !== null && next < prev) return `Slide down from fret ${prev} to fret ${next} — pick once and keep pressure while sliding`;
      return `Slide up from ${fretWord(prev)} to ${fretWord(next)} — pick once and keep pressure while sliding`;
    case 'slideDown':
      if (prev !== null && next !== null && next > prev) return `Slide up from fret ${prev} to fret ${next} — pick once and keep pressure while sliding`;
      return `Slide down from ${fretWord(prev)} to ${fretWord(next)} — pick once and keep pressure while sliding`;
    case 'bend': {
      if (prev === null) return 'Bend — push the string sideways to raise the pitch';
      if (next === null) return `Bend fret ${prev} — push the string sideways to raise the pitch`;
      const steps = next - prev;
      const amount = steps === 1 ? ' (a half step)' : steps === 2 ? ' (a whole step)' : '';
      return `Bend fret ${prev} up until it sounds like fret ${next}${amount} — push the string sideways`;
    }
    case 'release': return `Release the bend — let the string back down so it sounds like ${fretWord(next)} again, without picking`;
    case 'vibrato': return 'Vibrato — wobble the note by bending it slightly up and down, quickly and evenly';
    case 'bar': return 'Bar line — the end of one measure and start of the next';
    case 'repeat': return 'Repeat sign — play the bars between |: and :| again';
    default: return null;
  }
}

/** Tooltip for a word in an annotation line above the tab. */
export function describeAnnotation(word: string): string | null {
  const w = word.replace(/[-|]+$/, '').toLowerCase().replace(/\s+/g, ' ');
  if (w === 'pm' || w === 'p.m.' || w === 'p.m') return 'Palm mute (PM) — rest the edge of your picking hand on the strings right by the bridge for a muted, chunky sound. The dashes show how long to keep muting.';
  if (w === 'let ring') return 'Let ring — keep the notes sounding into each other';
  if (w === 'nh' || w === 'n.h.' || w === 'n.h') return 'Natural harmonic — touch the string lightly right over the fret wire, don\'t press';
  return null;
}

export interface TabChunk {
  annotations: string[];
  strings: string[];
}

/**
 * Wrap a system that is wider than `maxCols` at bar lines shared by all
 * strings, so it fits the page without horizontal scrolling. Each chunk after
 * the first begins with the bar line that ended the previous one.
 */
export function splitSystem(strings: string[], annotations: string[], maxCols: number): TabChunk[] {
  const len = Math.max(...strings.map((s) => s.length));
  if (len <= maxCols || maxCols < 8) return [{ strings, annotations }];
  const bars: number[] = [];
  for (let c = 1; c < len - 1; c++) if (strings.every((s) => s[c] === '|')) bars.push(c);
  const chunks: TabChunk[] = [];
  let start = 0;
  while (len - start > maxCols) {
    const fits = bars.filter((b) => b > start && b < start + maxCols);
    const cut = fits.length ? fits[fits.length - 1] : start + maxCols - 1;
    const end = cut + 1;
    chunks.push({
      strings: strings.map((s) => s.slice(start, end)),
      annotations: annotations.map((a) => a.slice(start, end)),
    });
    start = fits.length ? cut : end;
  }
  chunks.push({ strings: strings.map((s) => s.slice(start)), annotations: annotations.map((a) => a.slice(start)) });
  return chunks.map((c) => ({ ...c, annotations: c.annotations.filter((a) => a.trim()) }));
}
