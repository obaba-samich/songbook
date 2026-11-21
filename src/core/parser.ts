/**
 * .gsong parser. Never throws: it always returns a Song (best effort) plus a
 * list of diagnostics, each with a 1-based line number and a plain-English
 * message that says what's wrong and how to fix it.
 */
import type {
  BodyLine, ChordShape, Diagnostic, Guitar, LyricSegment, ParseResult, Section, Song, Stroke,
  StrumRef, TabBlock, TabSystem, Tuning,
} from './types';
import { isValidChordName, isValidKey, NO_CHORD, notePc } from './chords';
import { parseTuning, STANDARD } from './library';
import { displayChord, shapeFor } from './transpose';

const HEADER_ONLY = ['title', 'artist', 'key', 'capo', 'tempo', 'time', 'tuning'] as const;
/** Header directives that may be set again inside a {guitar:} block. */
const PER_GUITAR = ['capo', 'tuning', 'define'];
const KNOWN = [...HEADER_ONLY, 'comment', 'c', 'define', 'strum', 'guitar', 'section', 'use', 'tab', 'end_tab', 'order'];

interface GuitarDraft {
  name: string;
  id: string;
  line: number;
  capo?: number;
  tuning?: Tuning;
  own: Map<string, ChordShape>;
}
const ALIASES: Record<string, string> = {
  start_of_tab: 'tab', sot: 'tab', end_of_tab: 'end_tab', eot: 'end_tab', endtab: 'end_tab',
};

const TAB_CHARS = /[^0-9\-|:hpbr~xX()./\\* ]/;
const ORDINAL = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];

function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/** " — did you mean X?" when something close exists. */
function suggest(word: string, options: string[]): string {
  let best = '';
  let bestD = Infinity;
  for (const o of options) {
    const dist = distance(word.toLowerCase(), o.toLowerCase());
    if (dist < bestD) [best, bestD] = [o, dist];
  }
  return best && bestD <= Math.max(2, Math.floor(word.length / 3)) ? ` — did you mean "${best}"?` : '';
}

export function stringName(tuning: Tuning, lowIndex: number): string {
  const n = tuning.notes[lowIndex];
  if (lowIndex === 0) return `low ${n}`;
  if (lowIndex === tuning.notes.length - 1) return `high ${n.toLowerCase()}`;
  return n;
}

export function parseSong(text: string): ParseResult {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const diagnostics: Diagnostic[] = [];
  const error = (line: number, message: string) => diagnostics.push({ line, severity: 'error', message });
  const warn = (line: number, message: string) => diagnostics.push({ line, severity: 'warning', message });

  const song: Song = {
    meta: { title: '', artist: '', key: null, capo: 0, tempo: null, time: '4/4', tuning: STANDARD },
    comments: [],
    defines: new Map(),
    guitars: [],
    strums: new Map(),
    sections: new Map(),
    order: [],
  };

  const drafts: GuitarDraft[] = [];
  let scope: GuitarDraft | null = null; // header: which {guitar:} block we're in
  let current = ''; // section: id of the guitar whose tab/strum lines come next
  const finalizeGuitars = () => {
    if (song.guitars.length) return;
    const base = (d: GuitarDraft | null): Guitar => ({
      name: d?.name ?? 'Guitar',
      id: d?.id ?? 'guitar',
      line: d?.line ?? 1,
      capo: d?.capo ?? song.meta.capo,
      tuning: d?.tuning ?? song.meta.tuning,
      defines: new Map([...song.defines, ...(d?.own ?? [])]),
    });
    song.guitars = drafts.length ? drafts.map(base) : [base(null)];
  };

  const seenHeader = new Map<string, number>();
  const chordUses: { name: string; line: number }[] = [];
  const strumUses: StrumRef[] = [];
  let orderLine = 0;
  let orderNames: string[] | null = null;
  let section: Section | null = null;
  let tab: { start: number; rows: { text: string; line: number }[]; keep: boolean; guitar: string } | null = null;

  const finishTab = () => {
    if (!tab) return;
    const g = song.guitars.find((x) => x.id === tab!.guitar);
    const block = buildTab(tab.start, tab.rows, g?.tuning ?? song.meta.tuning, error);
    if (tab.keep && section && block) section.body.push({ kind: 'tab', line: tab.start, guitar: tab.guitar, tab: block });
    tab = null;
  };
  /** Resolve a guitar name used inside a section; reports unknown names. */
  const resolveGuitar = (nm: string, n: number): string | null => {
    const id = nm.toLowerCase();
    if (song.guitars.some((g) => g.id === id)) return id;
    const names = song.guitars.map((g) => g.name);
    error(n, drafts.length
      ? `guitar "${nm}" isn't declared${suggest(nm, names)} — guitars: ${names.join(', ')}. Declare it in the header with {guitar: ${nm}}`
      : `guitar "${nm}" isn't declared — add {guitar: ${nm}} to the header (before the first {section:})`);
    return null;
  };

  for (let i = 0; i < lines.length; i++) {
    const n = i + 1;
    const raw = lines[i];
    const trimmed = raw.trim();
    const isDirective = trimmed.startsWith('{');

    if (tab) {
      const dm = /^\{\s*([A-Za-z_]+)\s*\}$/.exec(trimmed);
      const dname = dm ? ALIASES[dm[1].toLowerCase()] ?? dm[1].toLowerCase() : '';
      if (dname === 'end_tab') { finishTab(); continue; }
      if (!isDirective) { tab.rows.push({ text: raw, line: n }); continue; }
      error(n, `directive inside a tab block — close the tab that starts on line ${tab.start} with {end_tab} first`);
      finishTab();
    }

    if (trimmed === '') {
      if (section && section.body.length && section.body[section.body.length - 1].kind !== 'blank')
        section.body.push({ kind: 'blank', line: n });
      continue;
    }
    if (trimmed.startsWith('#')) continue;

    if (!isDirective) {
      if (!section) {
        error(n, 'lyrics or chords before the first {section:} — add a line like {section: Verse 1} above this');
        continue;
      }
      const segments = parseLyric(raw, n, error, chordUses);
      section.body.push({ kind: 'lyric', line: n, segments });
      continue;
    }

    if (!trimmed.endsWith('}')) { error(n, 'directive is missing its closing "}"'); continue; }
    const m = /^\{\s*([A-Za-z_]+)\s*(?::([\s\S]*))?\}$/.exec(trimmed);
    if (!m) { error(n, 'can\'t read this directive — expected {name: value}, e.g. {title: Amazing Grace}'); continue; }
    let name = m[1].toLowerCase();
    name = ALIASES[name] ?? name;
    const value = (m[2] ?? '').trim();
    const hasValue = m[2] !== undefined;

    if (!KNOWN.includes(name)) { error(n, `unknown directive {${m[1]}}${suggest(name, KNOWN)}`); continue; }

    if ((HEADER_ONLY as readonly string[]).includes(name) || name === 'define') {
      if (section || song.guitars.length) { error(n, `{${name}} must come before the first {section:} (it's a header directive)`); continue; }
      if (scope && !PER_GUITAR.includes(name)) {
        error(n, `{${name}} is song-wide — move it above the first {guitar:} (only capo, tuning and define can be set per guitar)`);
        continue;
      }
    }
    if ((HEADER_ONLY as readonly string[]).includes(name)) {
      const seenKey = `${scope?.id ?? ''}:${name}`;
      const where = scope ? ` for guitar "${scope.name}"` : '';
      if (seenHeader.has(seenKey)) { error(n, `{${name}} appears twice${where} (first on line ${seenHeader.get(seenKey)})`); continue; }
      seenHeader.set(seenKey, n);
      if (!value) { error(n, `{${name}} needs a value, e.g. {${name}: ${exampleFor(name)}}`); continue; }
    }

    switch (name) {
      case 'title': song.meta.title = value; break;
      case 'artist': song.meta.artist = value; break;
      case 'key':
        if (!isValidKey(value)) error(n, `key "${value}" isn't valid — use a note A–G, optional # or b, optional m (e.g. A, F#m, Bb)`);
        else song.meta.key = value;
        break;
      case 'capo': {
        const c = /^\d+$/.test(value) ? Number(value) : NaN;
        if (!(c >= 0 && c <= 12)) error(n, `capo "${value}" isn't valid — use a whole number from 0 to 12`);
        else if (scope) scope.capo = c;
        else song.meta.capo = c;
        break;
      }
      case 'tempo': {
        const t = /^\d+$/.test(value) ? Number(value) : NaN;
        if (!(t >= 20 && t <= 400)) error(n, `tempo "${value}" isn't valid — use beats per minute, a whole number from 20 to 400`);
        else song.meta.tempo = t;
        break;
      }
      case 'time': {
        const tm = /^(\d{1,2})\/(\d{1,2})$/.exec(value);
        if (!tm || Number(tm[1]) < 1 || ![1, 2, 4, 8, 16].includes(Number(tm[2])))
          error(n, `time signature "${value}" isn't valid — use beats/note, e.g. 4/4, 3/4, 6/8`);
        else song.meta.time = value;
        break;
      }
      case 'tuning': {
        const t = parseTuning(value);
        if (!t) error(n, `tuning "${value}" isn't recognised — use standard, Drop D, DADGAD, Open G, Open D, Half step down, or 6 note names low → high like "D A D G B E"`);
        else if (scope) scope.tuning = t;
        else song.meta.tuning = t;
        break;
      }
      case 'guitar': {
        if (!value) { error(n, '{guitar:} needs a name, e.g. {guitar: Lead}'); break; }
        if (section) { const id = resolveGuitar(value, n); if (id) current = id; break; }
        const id = value.toLowerCase();
        const prev = drafts.find((d) => d.id === id);
        if (prev) { error(n, `guitar "${value}" is declared twice (first on line ${prev.line})`); break; }
        scope = { name: value, id, line: n, own: new Map() };
        drafts.push(scope);
        break;
      }
      case 'comment':
      case 'c':
        if (!value) { warn(n, 'empty {comment:}'); break; }
        if (section) section.body.push({ kind: 'comment', line: n, text: value });
        else song.comments.push(value);
        break;
      case 'define': parseDefine(value, n, scope ? scope.own : song.defines, error); break;
      case 'strum': parseStrum(value, n, song, error); break;
      case 'section': {
        finalizeGuitars();
        current = song.guitars[0].id;
        if (!value) { error(n, '{section:} needs a name, e.g. {section: Chorus}'); break; }
        const key = value.toLowerCase();
        const prev = song.sections.get(key);
        if (prev) { error(n, `section "${value}" is already defined on line ${prev.line} — give it a different name, or reuse it in {order}`); section = null; break; }
        section = { name: value, line: n, body: [] };
        song.sections.set(key, section);
        break;
      }
      case 'use': {
        if (!section) { error(n, '{use:} must be inside a section'); break; }
        if (!value) { error(n, '{use:} needs a strum pattern name, e.g. {use: main x4}'); break; }
        const refs: StrumRef[] = [];
        for (const part of value.split(',').map((p) => p.trim())) {
          const um = /^([A-Za-z0-9_-]+?)(?:\s*[x×*]\s*(\d+))?$/.exec(part);
          if (!um) { error(n, `can't read "${part}" in {use:} — expected a pattern name with an optional count, e.g. main x4`); continue; }
          const repeat = um[2] ? Number(um[2]) : 1;
          if (repeat < 1 || repeat > 99) { error(n, `repeat count in "${part}" must be between 1 and 99`); continue; }
          refs.push({ name: um[1], repeat, line: n });
        }
        strumUses.push(...refs);
        if (refs.length) section.body.push({ kind: 'strum', line: n, guitar: current, refs });
        break;
      }
      case 'tab': {
        if (!section) error(n, '{tab} must be inside a section — add a {section: Name} line above it');
        let g = current;
        if (section && hasValue && value) g = resolveGuitar(value, n) ?? current;
        tab = { start: n, rows: [], keep: !!section, guitar: g };
        break;
      }
      case 'end_tab':
        error(n, '{end_tab} without a matching {tab} above it');
        break;
      case 'order': {
        if (orderNames) { error(n, `{order:} appears twice (first on line ${orderLine}) — keep only one`); break; }
        orderLine = n;
        orderNames = value.split(',').map((s) => s.trim());
        if (!value || orderNames.some((s) => !s)) {
          error(n, '{order:} has an empty entry — list section names separated by commas, e.g. {order: Verse 1, Chorus}');
          orderNames = orderNames.filter(Boolean);
        }
        break;
      }
    }
  }

  if (tab) {
    error((tab as { start: number }).start, '{tab} is never closed — add {end_tab} after the last tab line');
    finishTab();
  }

  // ---- whole-file checks ----
  finalizeGuitars();
  if (!song.meta.title) error(1, 'missing {title: …} in the header');
  if (!song.meta.artist) error(1, 'missing {artist: …} in the header (use "Traditional" for folk songs)');
  if (!song.sections.size) error(lines.length || 1, 'the song has no sections — add at least one {section: Name}');

  // Every chord needs a shape for every guitar, at that guitar's own capo.
  const reported = new Set<string>();
  for (const use of chordUses) {
    if (use.name === NO_CHORD) continue;
    song.guitars.forEach((g, gi) => {
      const key = `${use.line}:${use.name}:${gi}`;
      if (reported.has(key)) return;
      const settings = { transpose: 0, capo: g.capo, guitar: gi };
      if (shapeFor(use.name, song, settings)) return;
      reported.add(key);
      const shown = displayChord(use.name, song, settings);
      if (song.guitars.length === 1 || shown === use.name)
        error(use.line, `chord "${shown}" isn't in the built-in library — add {define: ${shown} x x x x x x} to the header${song.guitars.length > 1 ? ` (under {guitar: ${g.name}})` : ''} with its frets`);
      else
        error(use.line, `chord "${use.name}" becomes "${shown}" for guitar "${g.name}" (capo ${g.capo}), which isn't in the built-in library — add {define: ${shown} …} under {guitar: ${g.name}}`);
    });
  }
  for (const d of drafts)
    if (d.capo === undefined && d.tuning === undefined && !d.own.size && drafts.length === 1)
      warn(d.line, `guitar "${d.name}" is the only guitar — {guitar:} is only needed for songs with more than one part`);
  const patternNames = [...song.strums.keys()];
  for (const ref of strumUses) {
    if (!song.strums.has(ref.name))
      error(ref.line, `strum pattern "${ref.name}" isn't defined${suggest(ref.name, patternNames)} — add {strum: ${ref.name} = D - D U - U D U} to the header`);
  }

  const sectionNames = [...song.sections.values()].map((s) => s.name);
  if (orderNames) {
    for (const nm of orderNames) {
      const s = song.sections.get(nm.toLowerCase());
      if (s) song.order.push(s.name);
      else error(orderLine, `section "${nm}" in {order} doesn't exist${suggest(nm, sectionNames)} (sections: ${sectionNames.join(', ') || 'none'})`);
    }
    const played = new Set((orderNames as string[]).map((x) => x.toLowerCase()));
    for (const s of song.sections.values())
      if (!played.has(s.name.toLowerCase())) warn(s.line, `section "${s.name}" is never played — it isn't listed in {order}`);
  } else {
    song.order = sectionNames;
  }

  for (const s of song.sections.values())
    while (s.body.length && s.body[s.body.length - 1].kind === 'blank') s.body.pop();

  diagnostics.sort((a, b) => a.line - b.line);
  return { song, diagnostics, lines };
}

function exampleFor(name: string): string {
  return ({ title: 'Amazing Grace', artist: 'Traditional', key: 'G', capo: '2', tempo: '90', time: '4/4', tuning: 'standard' } as Record<string, string>)[name];
}

function parseLyric(raw: string, n: number, error: (l: number, m: string) => void, uses: { name: string; line: number }[]): LyricSegment[] {
  const segments: LyricSegment[] = [];
  let pos = 0;
  let chord: string | null = null;
  let text = '';
  const line = raw.replace(/\s+$/, '');
  while (pos < line.length) {
    const ch = line[pos];
    if (ch === '[') {
      const close = line.indexOf(']', pos);
      const nextOpen = line.indexOf('[', pos + 1);
      if (close === -1 || (nextOpen !== -1 && nextOpen < close)) {
        error(n, `"[" at column ${pos + 1} is never closed with "]"`);
        text += line.slice(pos);
        break;
      }
      if (chord !== null || text) segments.push({ chord, text });
      const name = line.slice(pos + 1, close).trim();
      text = '';
      if (!name) { error(n, `empty chord "[]" at column ${pos + 1}`); chord = null; }
      else if (!isValidChordName(name)) { error(n, `can't read chord name "${name}" at column ${pos + 1} — expected something like G, Am, F#m7, Cadd9, D/F#`); chord = name; }
      else { chord = name; uses.push({ name, line: n }); }
      pos = close + 1;
      continue;
    }
    if (ch === ']') error(n, `"]" at column ${pos + 1} has no matching "["`);
    else text += ch;
    pos++;
  }
  if (chord !== null || text) segments.push({ chord, text });
  return segments;
}

function parseFretToken(t: string, max: number): number | null | undefined {
  if (/^[xX-]$/.test(t)) return null;
  if (!/^\d+$/.test(t)) return undefined;
  const v = Number(t);
  return v <= max ? v : undefined;
}

function parseDefine(value: string, n: number, target: Map<string, ChordShape>, error: (l: number, m: string) => void) {
  const toks = value.split(/\s+/).filter(Boolean);
  const usage = 'expected {define: Name f f f f f f} with 6 frets lowest string first, e.g. {define: Dsus4 x x 0 2 3 3}';
  if (toks.length < 2) { error(n, `{define:} is incomplete — ${usage}`); return; }
  const name = toks[0];
  if (!isValidChordName(name)) { error(n, `can't read chord name "${name}" in {define:}`); return; }
  let rest = toks.slice(1);
  let base = 1;
  if (rest[0] === 'base-fret') {
    base = Number(rest[1]);
    if (!(base >= 1 && base <= 24)) { error(n, `base-fret "${rest[1]}" must be a number from 1 to 24`); return; }
    rest = rest.slice(2);
    if (rest[0] === 'frets') rest = rest.slice(1);
  }
  const fi = rest.indexOf('fingers');
  const fretToks = fi === -1 ? rest : rest.slice(0, fi);
  const fingerToks = fi === -1 ? null : rest.slice(fi + 1);
  if (fretToks.length !== 6) {
    error(n, `{define: ${name}} has ${fretToks.length} fret value${fretToks.length === 1 ? '' : 's'} but needs exactly 6 (lowest string first)`);
    return;
  }
  const frets: (number | null)[] = [];
  for (const t of fretToks) {
    const v = parseFretToken(t, 24);
    if (v === undefined) { error(n, `fret value "${t}" in {define: ${name}} isn't valid — use x (muted), 0 (open) or 1–24`); return; }
    frets.push(v === null || v === 0 || base === 1 ? v : v + base - 1);
  }
  const shape: ChordShape = { frets, source: 'defined' };
  if (fingerToks) {
    if (fingerToks.length !== 6) { error(n, `"fingers" in {define: ${name}} has ${fingerToks.length} values but needs exactly 6`); return; }
    const fingers: (number | null)[] = [];
    for (const t of fingerToks) {
      const v = parseFretToken(t, 4);
      if (v === undefined) { error(n, `finger "${t}" in {define: ${name}} isn't valid — use 1–4 for fingers, 0 or x for none`); return; }
      fingers.push(v);
    }
    shape.fingers = fingers;
  }
  if (target.has(name)) { error(n, `chord "${name}" is defined twice`); return; }
  target.set(name, shape);
}

function parseStrum(value: string, n: number, song: Song, error: (l: number, m: string) => void) {
  const m = /^([A-Za-z0-9_-]+)\s*=\s*(.*)$/.exec(value);
  if (!m) { error(n, 'expected {strum: name = D - D U - U D U} (a one-word name, "=", then strokes)'); return; }
  const [, name, body] = m;
  let toks = body.split(/\s+/).filter(Boolean);
  if (toks.length === 1 && toks[0].length > 1 && /^[DUXdux-]+$/.test(toks[0])) toks = toks[0].split('');
  if (!toks.length) { error(n, `strum pattern "${name}" has no strokes`); return; }
  const strokes: Stroke[] = [];
  for (const t of toks) {
    const s = t.toUpperCase();
    if (s !== 'D' && s !== 'U' && s !== '-' && s !== 'X') {
      error(n, `strum stroke "${t}" in pattern "${name}" isn't valid — use D (down), U (up), - (rest) or X (muted chuck), separated by spaces`);
      return;
    }
    strokes.push(s);
  }
  if (song.strums.has(name)) { error(n, `strum pattern "${name}" is defined twice (first on line ${song.strums.get(name)!.line})`); return; }
  song.strums.set(name, { name, strokes, line: n });
}

/** A string-name label: a note name directly followed by a bar line ("e|", "Eb |"). */
const LABEL_RE = /^\s*([A-Ga-g][#b]?)\s*(?=[|:])/;

function buildTab(start: number, rows: { text: string; line: number }[], tuning: Tuning, error: (l: number, m: string) => void): TabBlock | null {
  const groups: { text: string; line: number }[][] = [[]];
  for (const r of rows) {
    if (r.text.trim() === '') { if (groups[groups.length - 1].length) groups.push([]); }
    else groups[groups.length - 1].push(r);
  }
  if (!groups[groups.length - 1].length) groups.pop();
  if (!groups.length) { error(start, 'tab block is empty'); return null; }

  const count = tuning.notes.length;
  const highFirst = [...tuning.notes].reverse();
  const systems: TabSystem[] = [];
  let ok = true;

  for (const g of groups) {
    const annotations: string[] = [];
    const strs: { text: string; line: number }[] = [];
    for (const r of g) {
      const isAnno = /^(\s|PM)/.test(r.text) && !LABEL_RE.test(r.text);
      if (isAnno) {
        if (strs.length) { error(r.line, 'annotation line (PM, let ring…) must go above the 6 string lines, not between them'); ok = false; }
        annotations.push(r.text.replace(/\s+$/, ''));
      } else strs.push(r);
    }
    const first = g[0].line;
    if (strs.length !== count) {
      const extra = strs.length > count ? ' — if this is a second system, separate it with one blank line' : '';
      error(first, `tab system has ${strs.length} string line${strs.length === 1 ? '' : 's'}, expected ${count} (high string on top)${extra}`);
      ok = false;
      continue;
    }
    const labels = strs.map((s) => LABEL_RE.exec(s.text));
    const labelled = labels.filter(Boolean).length;
    if (labelled && labelled !== count) {
      const bad = strs[labels.findIndex((l) => !l)];
      error(bad.line, 'this tab line has no string name but others do — label every line (e|, B|, …) or none');
      ok = false;
      continue;
    }
    const contents: string[] = [];
    let sysOk = true;
    strs.forEach((s, idx) => {
      const lab = labels[idx];
      if (lab && notePc(lab[1]) !== notePc(highFirst[idx])) {
        error(s.line, `tab line ${idx + 1} is labelled "${lab[1]}" but the ${ORDINAL[idx]} string from the top is ${highFirst[idx]} in ${tuning.name} tuning`);
        sysOk = false;
      }
      const offset = lab ? lab[0].length : 0;
      const content = s.text.slice(offset).replace(/\s+$/, '');
      const bad = TAB_CHARS.exec(content);
      if (bad) {
        error(s.line, `unexpected "${bad[0]}" at column ${offset + bad.index + 1} in tab — allowed: fret numbers, - | h p / \\ b r ~ x ( )`);
        sysOk = false;
      }
      contents.push(content);
    });
    if (!sysOk) { ok = false; continue; }
    const len = contents[0].length;
    for (let k = 1; k < contents.length; k++) {
      if (contents[k].length !== len) {
        error(strs[k].line, `tab line is ${contents[k].length} characters long but the top line is ${len} — all ${count} lines must be the same length so the columns line up`);
        sysOk = false;
      }
    }
    if (sysOk) {
      const bars = (c: string) => [...c].map((ch, i) => (ch === '|' ? i : -1)).filter((i) => i >= 0).join(',');
      const ref = bars(contents[0]);
      for (let k = 1; k < contents.length; k++) {
        if (bars(contents[k]) !== ref) {
          error(strs[k].line, 'bar lines "|" on this tab line are not in the same columns as the top line');
          sysOk = false;
          break;
        }
      }
    }
    if (!sysOk) { ok = false; continue; }
    // Annotations are aligned to the source columns; drop the label width so
    // they line up with the label-stripped string contents.
    const shift = labels[0] ? labels[0][0].length : 0;
    const aligned = annotations.map((a) => a.slice(Math.min(shift, a.length - a.trimStart().length)));
    systems.push({ line: first, annotations: aligned, strings: contents, labelled: labelled === count });
  }
  return ok || systems.length ? { line: start, systems } : null;
}

export type { BodyLine };
