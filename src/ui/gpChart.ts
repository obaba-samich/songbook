/**
 * Turn a Guitar Pro song into .gsong text, so the Chords and Lyrics views work
 * for it: chord names come from a guitar part (Songsterr exports name every
 * chord change), words from the vocal line's lyrics, and sections from the
 * file's section markers.
 */
import { isGuitar, lyricTracks, type GpSong } from './gpView';

type Track = GpSong['score']['tracks'][number];
type Beat = Track['staves'][number]['bars'][number]['voices'][number]['beats'][number];

interface Ev { bar: number; time: number; chord?: string; syl?: string }

const I_WORDS = /^(I|I'm|I've|I'll|I'd)$/;
const clean = (s: string) => s.replace(/[[\]{}]/g, '').trim();
const chordName = (s: string) => clean(s).replace(/♯/g, '#').replace(/♭/g, 'b').replace(/\s+/g, '');

/**
 * Each chord's shape as played in the tab (the notes under its first appearance),
 * low E → high e like {define:}. Only shapes with 3+ strings.
 */
function shapes(t: Track, bars: number): Map<string, string> {
  const strings = t.staves[0]?.tuning.length ?? 6;
  const found = new Map<string, Map<number, number>>();
  const done = new Set<string>();
  let cur = '';
  for (let i = 0; i < bars; i++) {
    for (const b of beats(t, i)) {
      if (b.chord?.name) {
        if (cur && found.get(cur)?.size) done.add(cur);
        cur = chordName(b.chord.name);
      }
      if (!cur || done.has(cur)) continue;
      const m = found.get(cur) ?? new Map<number, number>();
      found.set(cur, m);
      for (const n of b.notes) if (!n.isDead && n.fret >= 0 && !m.has(n.string)) m.set(n.string, n.fret);
    }
  }
  const out = new Map<string, string>();
  for (const [name, m] of found) {
    if (m.size < 3) continue;
    // alphaTab numbers strings from the lowest (1) up.
    out.set(name, Array.from({ length: strings }, (_, k) => (m.has(k + 1) ? String(m.get(k + 1)) : 'x')).join(' '));
  }
  return out;
}

function beats(t: Track, bar: number): Beat[] {
  const b = t.staves[0]?.bars[bar];
  return b ? b.voices.flatMap((v) => v.beats) : [];
}

/**
 * Where the chord names come from: a guitar part that names chords, preferring the
 * strummed one (most notes per beat) so the shapes are whole chords, not picked notes.
 */
function chordTrack(tracks: Track[]): Track | undefined {
  const all = (t: Track) => t.staves[0]?.bars.flatMap((b) => b.voices.flatMap((v) => v.beats)) ?? [];
  const named = (t: Track) => all(t).filter((be) => be.chord?.name).length;
  const thick = (t: Track) => { const bs = all(t).filter((be) => be.notes.length); return bs.length ? bs.reduce((n, be) => n + be.notes.length, 0) / bs.length : 0; };
  const withNames = tracks.filter((t) => !t.isPercussion && named(t) > 0);
  const guitars = withNames.filter(isGuitar);
  const pool = guitars.length ? guitars : withNames;
  return pool.sort((a, b) => thick(b) - thick(a))[0];
}

export function gpToGsong(gp: GpSong): string {
  const score = gp.score;
  const tracks = score.tracks;
  const ct = chordTrack(tracks);
  const vt = lyricTracks(tracks)[0];
  const capo = ct?.staves[0]?.capo ?? tracks.find(isGuitar)?.staves[0]?.capo ?? 0;
  const mb0 = score.masterBars[0];

  const out: string[] = [
    `{title: ${clean(gp.title)}}`,
    ...(gp.artist ? [`{artist: ${clean(gp.artist)}}`] : []),
    ...(capo ? [`{capo: ${capo}}`] : []),
    ...(score.tempo ? [`{tempo: ${score.tempo}}`] : []),
    ...(mb0 ? [`{time: ${mb0.timeSignatureNumerator}/${mb0.timeSignatureDenominator}}`] : []),
    ...(ct ? [...shapes(ct, score.masterBars.length)].map(([n, f]) => `{define: ${n} ${f}}`) : []),
    `{comment: Made from the Guitar Pro file${ct ? ' (chords from the guitar part' : ' (no chord names in it'}${vt ? ', words from the vocal line)' : ', no lyrics in it)'}.}`,
    '',
  ];

  const used = new Map<string, number>();
  let line = '';          // lyric line being built
  let words = 0;          // words on it
  let pending: string[] = [];   // chords waiting for the next syllable
  let chordRow: string[] = [];  // bars of a chord-only row
  let lastChord = '';
  let midWord = false;

  /** keepChords: the waiting chords belong to the next line's first word. */
  const flushLine = (keepChords = false) => {
    if (pending.length && !keepChords) { line += pending.map((c) => ` [${c}]`).join(''); pending = []; }
    if (line.trim()) out.push(line.trim());
    line = ''; words = 0; midWord = false;
  };
  const flushRow = () => {
    for (let i = 0; i < chordRow.length; i += 4) out.push(`| ${chordRow.slice(i, i + 4).join(' | ')} |`);
    chordRow = [];
  };
  const section = (name: string) => {
    // A short line that just began ("It's", "So take the") is the pickup into this section.
    const pickup = words > 0 && words <= 4 && lineStartedFresh ? { line, words, midWord } : null;
    if (pickup) { line = ''; words = 0; }
    flushLine(true); flushRow();
    const n = (used.get(name) ?? 0) + 1;
    used.set(name, n);
    out.push('', `{section: ${n > 1 ? `${name} ${n}` : name}}`);
    if (pickup) ({ line, words, midWord } = pickup);
    showChord = true;
  };
  /** The first words of a section show the chord being played, even when it carries over. */
  let showChord = false;
  let lineStartedFresh = false;
  let heldBars = 0;

  const wordsAt = (bar: number) => !!vt && beats(vt, bar).some((b) => !!b.lyrics?.[0]?.trim());
  let started = false;
  let countIn = false;
  for (let i = 0; i < score.masterBars.length; i++) {
    const mb = score.masterBars[i];
    if (mb.section?.text) {
      // The count-in is clicks (and studio chatter), not part of the song.
      countIn = /count.?in/i.test(mb.section.text);
      if (!countIn) section(clean(mb.section.text) || 'Part');
      started = true;
    } else if (!started) { section('Intro'); started = true; }
    if (countIn) continue;
    const evs: Ev[] = [];
    if (ct) for (const b of beats(ct, i)) if (b.chord?.name) evs.push({ bar: i, time: b.playbackStart, chord: chordName(b.chord.name) });
    if (vt) for (const b of beats(vt, i)) { const s = b.lyrics?.[0]; if (s && s.trim()) evs.push({ bar: i, time: b.playbackStart, syl: s.trim() }); }
    evs.sort((a, b) => a.time - b.time || (a.chord ? -1 : 1));
    const hasWords = evs.some((e) => e.syl);
    // A bar without words in the middle of a line (a held note, a breath): its chords wait for the next word.
    if (!hasWords && line && (midWord || wordsAt(i + 1))) {
      for (const e of evs) if (e.chord) { if (e.chord !== lastChord) pending.push(e.chord); lastChord = e.chord; }
      continue;
    }
    if (!hasWords) {
      // Instrumental bar: one cell of a chord-only row (the held chord if nothing changes).
      // A pickup ("So take the") waits through up to 4 bars of break for its line.
      if (line && lineStartedFresh && words <= 4 && heldBars < 4) heldBars++;
      else if (line) flushLine(true);
      const cs = evs.filter((e) => e.chord).map((e) => e.chord!);
      if (pending.length) { cs.unshift(...pending); pending = []; }
      if (cs.length) lastChord = cs[cs.length - 1];
      const cell = (cs.length ? cs : lastChord ? [lastChord] : []).map((c) => `[${c}]`).join(' ');
      if (cell) chordRow.push(cell);
      continue;
    }
    heldBars = 0;
    flushRow();
    for (const e of evs) {
      if (e.chord) { if (e.chord !== lastChord) pending.push(e.chord); lastChord = e.chord; continue; }
      const syl = clean(e.syl!);
      const joins = syl.endsWith('-');
      const text = joins ? syl.slice(0, -1) : syl;
      if (!midWord) {
        const word = text.replace(/^[("'¿¡]+/, '');
        const upper = /^[A-Z]/.test(word);
        const capital = upper && (!I_WORDS.test(word.replace(/[^A-Za-z']/g, '')) || words >= 6);
        const endedSentence = /[.?!]$/.test(line.trim());
        if (words >= 3 && (capital || endedSentence)) { flushLine(true); lineStartedFresh = true; }
        else if (!line) lineStartedFresh = upper;
        if (line) line += ' ';
        words++;
      }
      if (showChord && !pending.length && lastChord && !midWord) pending.push(lastChord);
      showChord = false;
      if (pending.length) {
        // Several changes before one syllable: the earlier ones stand alone just before the word.
        const last = pending.pop()!;
        if (pending.length) line = line.replace(/ ?$/, ' ') + pending.map((c) => `[${c}]`).join(' ') + ' ';
        line += `[${last}]`; pending = [];
      }
      line += text;
      midWord = joins;
    }
  }
  flushLine(); flushRow();
  return out.join('\n') + '\n';
}
