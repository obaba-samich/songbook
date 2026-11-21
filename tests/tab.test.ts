import { describe, expect, it } from 'vitest';
import { describeAnnotation, describeTabToken, ordinal, splitSystem, tokenizeTabLine } from '../src/core/tab';
import { splitSegments } from '../src/views/lyricsView';
import { chordDiagram } from '../src/views/diagram';

const tip = (line: string, text: string, string = 'A') => {
  const toks = tokenizeTabLine(line);
  const i = toks.findIndex((t) => t.text === text);
  return describeTabToken(toks, i, string);
};

describe('tab tokenizer', () => {
  it('reads two-digit frets as one token', () => {
    const t = tokenizeTabLine('|-12-3-|');
    expect(t.filter((x) => x.kind === 'fret').map((x) => [x.fret, x.start])).toEqual([[12, 2], [3, 5]]);
  });
  it('recognises every technique', () => {
    const kinds = tokenizeTabLine('0h2p0/5\\3b5r3~~x(4)|:').map((t) => t.kind);
    expect(kinds).toEqual(['fret', 'hammer', 'fret', 'pull', 'fret', 'slideUp', 'fret', 'slideDown', 'fret', 'bend', 'fret', 'release', 'fret', 'vibrato', 'muted', 'ghost', 'bar', 'repeat']);
  });
});

describe('tab tooltips', () => {
  it('describes frets and open strings', () => {
    expect(tip('--3--', '3')).toBe('3rd fret on the A string');
    expect(tip('--0--', '0', 'low E')).toContain('Open low E string');
    expect(tip('--x--', 'x')).toContain('Muted');
  });
  it('describes techniques with their frets', () => {
    expect(tip('2h4', 'h', 'G')).toMatch(/^Hammer-on from fret 2 to fret 4/);
    expect(tip('4p0', 'p')).toMatch(/^Pull-off from fret 4 to the open string/);
    expect(tip('5/7', '/')).toMatch(/^Slide up from fret 5 to fret 7/);
    expect(tip('7\\5', '\\')).toMatch(/^Slide down from fret 7 to fret 5/);
    expect(tip('7b9', 'b')).toContain('sounds like fret 9 (a whole step)');
    expect(tip('7b9r7', 'r')).toContain('fret 7 again');
    expect(tip('5~~', '~~')).toMatch(/^Vibrato/);
    expect(tip('|--', '|')).toMatch(/^Bar line/);
    expect(tip('---', '-')).toBeNull();
  });
  it('describes palm mute', () => {
    expect(describeAnnotation('PM')).toMatch(/^Palm mute/);
    expect(describeAnnotation('let ring')).toMatch(/^Let ring/);
  });
  it('ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd']);
  });
});

describe('tab wrapping', () => {
  const strings = Array.from({ length: 6 }, () => '|' + '-----|'.repeat(6));
  it('leaves short systems alone', () => {
    expect(splitSystem(strings, [], 80)).toHaveLength(1);
  });
  it('wraps at shared bar lines', () => {
    const chunks = splitSystem(strings, [' PM---'], 20);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.strings.every((s) => s.length <= 20)).toBe(true);
      expect(c.strings[0].startsWith('|')).toBe(true);
      expect(c.strings[0].endsWith('|')).toBe(true);
    }
    expect(chunks[0].annotations).toEqual([' PM---']);
    // No content is lost: joining chunks (dropping the duplicated bar) restores the line.
    expect(chunks.map((c, i) => (i ? c.strings[0].slice(1) : c.strings[0])).join('')).toBe(strings[0]);
  });
});

describe('lyric segment splitting', () => {
  it('keeps the chord on the first word only', () => {
    expect(splitSegments([{ chord: 'G', text: 'Take me home ' }])).toEqual([
      { chord: 'G', text: 'Take ' }, { chord: null, text: 'me ' }, { chord: null, text: 'home ' },
    ]);
  });
  it('keeps mid-word chords attached', () => {
    expect(splitSegments([{ chord: null, text: 'A' }, { chord: 'D', text: 'mazing' }])).toEqual([
      { chord: null, text: 'A' }, { chord: 'D', text: 'mazing' },
    ]);
  });
});

describe('chord diagrams', () => {
  it('draws open, muted, barre and position', () => {
    const svg = chordDiagram('F#m', { frets: [2, 4, 4, 2, 2, 2], fingers: [1, 3, 4, 1, 1, 1], source: 'generated' });
    expect(svg).toContain('F#m');
    expect(svg).toContain('<rect class="dg-dot"'); // barre
    const c = chordDiagram('C', { frets: [null, 3, 2, 0, 1, 0], source: 'library' });
    expect(c).toContain('dg-nut');
    expect(c).toContain('×');
    expect(c).toContain('dg-open');
    const high = chordDiagram('E', { frets: [null, 7, 9, 9, 9, 7], source: 'generated' });
    expect(high).toContain('7fr');
    expect(chordDiagram('?', null)).toContain('no shape');
  });
});
