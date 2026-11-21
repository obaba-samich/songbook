import { describe, expect, it } from 'vitest';
import { parseSong } from '../src/core/parser';
import { defaultSettings } from '../src/core/transpose';
import { chordSpans, chordStarts, chordSystems } from '../src/views/chordTab';
import { noteValue, renderStaff } from '../src/views/tabStaff';
import { renderTabView } from '../src/views/tabView';
import type { ViewCtx } from '../src/views/common';

const ctxFor = (src: string, guitar = 0): ViewCtx => {
  const song = parseSong(src).song;
  return { song, settings: defaultSettings(song, guitar), showStringNames: false, tabWidthEm: 40 };
};
const HDR = '{title: T}\n{artist: A}\n{time: 4/4}\n{strum: m = D - D U - U D U}\n';

describe('chord spans', () => {
  it('attaches pickups, mid-word hyphens and line-start words to the right chord', () => {
    const song = parseSong(`${HDR}{section: V}\nThere [Am]is a [C]house in New Or[F]leans\nThey [Am]call A[D]mazing`).song;
    expect(chordSpans(song.sections.get('v')!)).toEqual([
      { chord: 'Am', words: ['There', 'is', 'a'], line: 0 },
      { chord: 'C', words: ['house', 'in', 'New', 'Or-'], line: 0 },
      { chord: 'F', words: ['leans', 'They'], line: 0 },
      { chord: 'Am', words: ['call', 'A-'], line: 1 },
      { chord: 'D', words: ['mazing'], line: 1 },
    ]);
  });
});

describe('chord placement', () => {
  const firstSlots = (bars: number, per: number) => Array.from({ length: bars + 1 }, (_, i) => i * per);
  it('one chord per bar when counts match', () => {
    const spans = [0, 0, 1, 1].map((line) => ({ line }));
    expect(chordStarts(spans, [8, 8, 8, 8], 4, firstSlots(4, 8))).toEqual([0, 8, 16, 24]);
  });
  it('shares bars between lines and splits a crowded line on a beat', () => {
    // two lines, 4 bars: line 0 has 2 chords, line 1 has 3 chords in 2 bars
    const spans = [{ line: 0 }, { line: 0 }, { line: 1 }, { line: 1 }, { line: 1 }];
    const starts = chordStarts(spans, [8, 8, 8, 8], 4, firstSlots(4, 8));
    expect(starts.slice(0, 3)).toEqual([0, 8, 16]);
    expect(starts[3] % 2).toBe(0); // on a beat (2 slots per beat)
    expect(starts[4]).toBeGreaterThan(starts[3]);
  });
});

describe('generated tab', () => {
  const SRC = `${HDR}{section: V}\n{use: m x2}\n[G]Hello [C]there`;
  const sys = chordSystems(parseSong(SRC).song.sections.get('v')!, ctxFor(SRC))[0];

  it('builds six aligned string lines with one bar per pattern repeat', () => {
    expect(sys.strings).toHaveLength(6);
    expect(new Set(sys.strings.map((x) => x.length)).size).toBe(1);
    expect(sys.strings[0].split('|').filter(Boolean)).toHaveLength(2);
  });
  it('uses the chord shapes: G on the low E string is fret 3, C on the A string is fret 3', () => {
    const lowE = sys.strings[5];
    const aString = sys.strings[4];
    expect(lowE.split('|')[1]).toMatch(/^3/);
    expect(aString.split('|')[2]).toMatch(/^3/);
    expect(lowE.split('|')[2]).not.toMatch(/\d/); // C mutes the low E
  });
  it('up strokes play only the top four strings', () => {
    const upCol = sys.strokes!.find((s) => s.dir === 'U')!.col;
    expect(sys.strings[5][upCol]).toBe('-');
    expect(sys.strings[0][upCol]).toMatch(/\d/);
  });
  it('carries chord names, rhythm and lyrics', () => {
    expect(sys.annotations[0].trim().split(/\s+/)).toEqual(['G', 'C']);
    expect(sys.lyrics!.map((l) => l.text)).toEqual(['Hello', 'there']);
    const durs = [...sys.rhythm!.values()].map((r) => r.dur);
    expect(durs.slice(0, 4)).toEqual([4, 2, 4, 2]); // D- D U- U : quarter, eighth, quarter, eighth
  });
  it('without a strum pattern, strums each chord once per bar', () => {
    const src = '{title: T}\n{artist: A}\n{section: V}\n[G]a [C]b';
    const s = chordSystems(parseSong(src).song.sections.get('v')!, ctxFor(src))[0];
    expect([...s.rhythm!.values()].map((r) => r.dur)).toEqual([16, 16]);
  });
  it('follows the selected guitar\'s capo (shapes match that guitar)', () => {
    const src = `{title: T}\n{artist: A}\n{key: A}\n{capo: 2}\n{guitar: One}\n{guitar: Two}\n{capo: 0}\n{section: V}\n[G]la`;
    const two = chordSystems(parseSong(src).song.sections.get('v')!, ctxFor(src, 1))[0];
    expect(two.annotations[0].trim()).toBe('A');
    expect(two.strings[4].split('|')[1]).toMatch(/^0/); // open A string
  });
});

describe('tab view', () => {
  it('shows every section as tab, with section names and no "no tab" fallback', () => {
    const src = `${HDR}{section: Intro}\n{tab}\ne|--0--|\nB|--1--|\nG|--0--|\nD|--2--|\nA|--3--|\nE|-----|\n{end_tab}\n{section: Verse}\n{use: m}\n[G]words`;
    const html = renderTabView(ctxFor(src));
    expect(html).not.toContain('No tab');
    expect(html).toContain('>Intro</text>');
    expect(html).toContain('>Verse</text>');
    expect(html).toContain('class="st-lyric"');
  });
});

describe('rhythm', () => {
  it('maps tick lengths to note values', () => {
    expect(noteValue(16)).toEqual({ base: 16, dotted: false });
    expect(noteValue(6)).toEqual({ base: 4, dotted: true });
    expect(noteValue(2)).toEqual({ base: 2, dotted: false });
    expect(noteValue(1)).toEqual({ base: 1, dotted: false });
  });
  it('reads evenly spaced hand tab as eighth notes and beams them by beat', () => {
    const strings = ['|0-0-0-0-0-0-0-0-|', ...Array(5).fill('|----------------|')];
    const html = renderStaff([{ line: 1, annotations: [], strings, labelled: false }], { tuning: parseSong(HDR).song.meta.tuning, widthEm: 40, showStringNames: false, time: '4/4' }).html;
    expect(html.match(/class="st-beam"/g)).toHaveLength(4); // 4 beats → 4 beamed pairs
    expect(html.match(/class="st-stem"/g)).toHaveLength(8);
  });
});
