import { describe, expect, it } from 'vitest';
import { isValidChordName, normalizeChord, parseChord, transposeChord, transposeKey } from '../src/core/chords';
import { hasChord, lookupChord, parseTuning, shiftShape, TUNINGS } from '../src/core/library';
import { parseSong } from '../src/core/parser';
import { defaultSettings, displayChord, shapeFor, shapesKey, soundingKey } from '../src/core/transpose';

describe('chord names', () => {
  it('parses root, quality and bass', () => {
    expect(parseChord('F#m7')).toEqual({ root: 'F#', quality: 'm7', bass: null });
    expect(parseChord('D/F#')).toEqual({ root: 'D', quality: '', bass: 'F#' });
    expect(parseChord('Bbmaj7')).toEqual({ root: 'Bb', quality: 'maj7', bass: null });
    expect(parseChord('C6/9')).toEqual({ root: 'C', quality: '6/9', bass: null });
  });
  it('rejects nonsense', () => {
    for (const bad of ['H', 'Xm', 'Cq', 'c', 'G/H', '']) expect(isValidChordName(bad), bad).toBe(false);
    for (const ok of ['N.C.', 'Asus2', 'Cadd9', 'E7sus4', 'Bm7b5', 'G°', 'C+', 'Am/G']) expect(isValidChordName(ok), ok).toBe(true);
  });
  it('normalises aliases', () => {
    expect(normalizeChord('Cmin')).toBe('Cm');
    expect(normalizeChord('C-')).toBe('Cm');
    expect(normalizeChord('CM7')).toBe('Cmaj7');
    expect(normalizeChord('C+')).toBe('Caug');
    expect(normalizeChord('Bø')).toBe('Bm7b5');
  });
});

describe('transposition', () => {
  it('moves chords by semitones', () => {
    expect(transposeChord('G', 2)).toBe('A');
    expect(transposeChord('F#m', -1)).toBe('Fm');
    expect(transposeChord('Bb', 1)).toBe('B');
    expect(transposeChord('E7', 12)).toBe('E7');
    expect(transposeChord('Am7', -12)).toBe('Am7');
    expect(transposeChord('B', 1)).toBe('C');
    expect(transposeChord('C', -1)).toBe('B');
  });
  it('keeps the quality and moves the bass', () => {
    expect(transposeChord('Dsus4', 2)).toBe('Esus4');
    expect(transposeChord('D/F#', 2)).toBe('E/G#');
  });
  it('respects sharp/flat preference', () => {
    expect(transposeChord('C', 1, true)).toBe('Db');
    expect(transposeChord('C', 1, false)).toBe('C#');
    expect(transposeChord('Bb', 2)).toBe('C'); // keeps flats by default
    expect(transposeChord('Eb', 1)).toBe('E');
    expect(transposeChord('Db', 2)).toBe('Eb');
  });
  it('leaves N.C. alone', () => expect(transposeChord('N.C.', 3)).toBe('N.C.'));
  it('transposes keys to conventional spellings', () => {
    expect(transposeKey('G', 2)).toBe('A');
    expect(transposeKey('C', 3)).toBe('Eb');
    expect(transposeKey('C', 6)).toBe('F#');
    expect(transposeKey('Am', 1)).toBe('Bbm');
    expect(transposeKey('Am', -2)).toBe('Gm');
    expect(transposeKey('Em', 2)).toBe('F#m');
  });
});

describe('chord lookup', () => {
  it('finds open chords', () => {
    expect(lookupChord('C')!.frets).toEqual([null, 3, 2, 0, 1, 0]);
    expect(lookupChord('G')!.frets).toEqual([3, 2, 0, 0, 0, 3]);
    expect(lookupChord('Em')!.frets).toEqual([0, 2, 2, 0, 0, 0]);
    expect(lookupChord('D/F#')!.frets).toEqual([2, null, 0, 2, 3, 2]);
  });
  it('generates barre chords at the lowest position', () => {
    expect(lookupChord('F#m')!.frets).toEqual([2, 4, 4, 2, 2, 2]); // E-shape, 2nd fret
    expect(lookupChord('Bb')!.frets).toEqual([null, 1, 3, 3, 3, 1]); // A-shape, 1st fret
    expect(lookupChord('C#m')!.frets).toEqual([null, 4, 6, 6, 5, 4]);
    expect(lookupChord('Ab7')!.frets).toEqual([4, 6, 4, 5, 4, 4]);
    expect(lookupChord('C9')!.frets).toEqual([null, 3, 2, 3, 3, 3]);
    expect(lookupChord('Bdim')!.frets).toEqual([null, 2, 3, 4, 3, null]);
  });
  it('generated barre shapes have fingers', () => {
    expect(lookupChord('F#m')!.fingers).toEqual([1, 3, 4, 1, 1, 1]);
  });
  it('understands aliases', () => {
    expect(lookupChord('Cmin')!.frets).toEqual(lookupChord('Cm')!.frets);
    expect(lookupChord('AM7')!.frets).toEqual(lookupChord('Amaj7')!.frets);
  });
  it('fits slash-chord basses or gives a hint', () => {
    expect(lookupChord('A/C#')!.frets).toEqual([null, 4, 2, 2, 2, 0]);
    const odd = lookupChord('Bbm7/Ab');
    expect(odd).not.toBeNull();
  });
  it('prefers song defines', () => {
    const defines = new Map([['G', { frets: [3, 2, 0, 0, 3, 3], source: 'defined' as const }]]);
    expect(lookupChord('G', { defines })!.frets).toEqual([3, 2, 0, 0, 3, 3]);
  });
  it('returns null for unknown chords', () => {
    expect(lookupChord('Cadd11')).toBeNull();
    expect(lookupChord('N.C.')).toBeNull();
    expect(hasChord('Cadd11')).toBe(false);
    expect(hasChord('N.C.')).toBe(true);
  });
  it('re-frets library shapes for alternate tunings', () => {
    const dropD = TUNINGS['drop d'];
    expect(lookupChord('F', { tuning: dropD })!.frets).toEqual([3, 3, 3, 2, 1, 1]);
    expect(lookupChord('D', { tuning: dropD })!.frets).toEqual([null, null, 0, 2, 3, 2]);
  });
  it('parses tunings by name or notes', () => {
    expect(parseTuning('drop d')!.name).toBe('Drop D');
    expect(parseTuning('D A D G B E')!.name).toBe('Drop D');
    expect(parseTuning('E A D G B')).toBeNull();
  });
  it('shifts closed shapes but not open ones', () => {
    expect(shiftShape({ frets: [1, 3, 3, 2, 1, 1], source: 'defined' }, 2)!.frets).toEqual([3, 5, 5, 4, 3, 3]);
    expect(shiftShape({ frets: [null, 3, 2, 0, 1, 0], source: 'defined' }, 2)).toBeNull();
  });
});

describe('capo, transpose and guitars', () => {
  const SRC = `{title: T}\n{artist: A}\n{key: A}\n{capo: 2}\n{define: G 3 2 0 0 3 3}\n{define: Fadd9 1 3 3 2 1 3}\n{guitar: Main}\n{guitar: Open}\n{capo: 0}\n{section: S}\n[G]la [Fadd9]la [Em]la`;
  const song = parseSong(SRC).song;

  it('shows the file chords at the file capo', () => {
    const s = defaultSettings(song, 0);
    expect(s.capo).toBe(2);
    expect(displayChord('G', song, s)).toBe('G');
    expect(shapeFor('G', song, s)!.frets).toEqual([3, 2, 0, 0, 3, 3]); // custom voicing
    expect(soundingKey(song, s)).toBe('A');
    expect(shapesKey(song, s)).toBe('G');
  });
  it('changing the capo keeps the pitch and changes the shapes', () => {
    const s = { ...defaultSettings(song, 0), capo: 0 };
    expect(displayChord('G', song, s)).toBe('A');
    expect(displayChord('Em', song, s)).toBe('F#m');
    expect(soundingKey(song, s)).toBe('A');
    expect(shapeFor('G', song, s)!.frets).toEqual([null, 0, 2, 2, 2, 0]); // library A: open custom G can't slide
    expect(shapeFor('Fadd9', song, s)!.frets).toEqual([3, 5, 5, 4, 3, 5]); // closed custom voicing moves
  });
  it('each guitar sees shapes for its own capo', () => {
    const s = defaultSettings(song, 1);
    expect(s.capo).toBe(0);
    expect(displayChord('G', song, s)).toBe('A');
    expect(shapeFor('Em', song, s)!.frets).toEqual([2, 4, 4, 2, 2, 2]);
  });
  it('transposing changes the sounding key and the chords', () => {
    const s = { ...defaultSettings(song, 0), transpose: 1 };
    expect(soundingKey(song, s)).toBe('Bb');
    expect(displayChord('G', song, s)).toBe('Ab');
    expect(shapeFor('G', song, s)!.frets).toEqual(lookupChord('Ab')!.frets);
  });
  it('capo + transpose combine', () => {
    const s = { transpose: 2, capo: 4, guitar: 0 }; // shapes move by 2 - (4 - 2) = 0
    expect(displayChord('G', song, s)).toBe('G');
    expect(soundingKey(song, s)).toBe('B');
  });
});
