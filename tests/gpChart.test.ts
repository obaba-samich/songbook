import { describe, expect, it } from 'vitest';
import { gpToGsong } from '../src/ui/gpChart';
import { parseSong } from '../src/core/parser';

// Stand-ins for alphaTab objects (real Guitar Pro files can't live in the public repo).
type B = { t: number; chord?: string; syl?: string; notes?: [number, number][] };
const beat = (b: B) => ({
  playbackStart: b.t, chord: b.chord ? { name: b.chord } : null, lyrics: b.syl ? [b.syl] : null,
  notes: (b.notes ?? []).map(([string, fret]) => ({ string, fret, isDead: false })),
});
const track = (name: string, index: number, bars: B[][], o: { capo?: number } = {}) => ({
  name, shortName: '', index, isPercussion: false, playbackInfo: { program: name.includes('Guitar') ? 25 : 65 },
  staves: [{ isStringed: true, capo: o.capo ?? 0, tuning: [64, 59, 55, 50, 45, 40], bars: bars.map((bs) => ({ voices: [{ beats: bs.map(beat) }] })) }],
});
const G: [number, number][] = [[1, 3], [2, 2], [3, 0], [4, 0], [5, 3], [6, 3]];
const C: [number, number][] = [[2, 3], [3, 2], [4, 0], [5, 1], [6, 0]];

describe('Guitar Pro → chord chart', () => {
  const gtr = track('Rhythm Guitar', 1, [
    [{ t: 0, chord: 'G', notes: G }],
    [{ t: 0, chord: 'G', notes: G }],
    [{ t: 0, chord: 'C', notes: C }],
    [{ t: 0, notes: C }],
  ], { capo: 2 });
  const vox = track('Vocals', 0, [
    [],
    [{ t: 0, syl: 'Hel-' }, { t: 480, syl: 'lo' }, { t: 960, syl: 'there' }],
    [{ t: 0, syl: 'old' }, { t: 960, syl: 'friend,' }],
    [{ t: 0, syl: 'So' }],
  ]);
  const song = {
    title: 'Test', artist: 'Band', bytes: new Uint8Array(),
    score: {
      tracks: [vox, gtr], tempo: 90,
      masterBars: [
        { section: { text: 'Intro' }, timeSignatureNumerator: 4, timeSignatureDenominator: 4 },
        { section: { text: 'Verse' }, timeSignatureNumerator: 4, timeSignatureDenominator: 4 },
        {}, {},
      ],
    },
  } as never;
  const text = gpToGsong(song);

  it('writes sections, chord rows, chords over words, capo and tab shapes', () => {
    expect(text).toContain('{capo: 2}');
    expect(text).toContain('{define: G 3 2 0 0 3 3}');
    expect(text).toContain('{section: Intro}\n| [G] |');
    expect(text).toContain('{section: Verse}\n[G]Hello there [C]old friend,');
    expect(parseSong(text).diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });
});
