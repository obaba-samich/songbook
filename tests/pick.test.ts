import { describe, expect, it } from 'vitest';
import { parseSong } from '../src/core/parser';
import { chordSystems, pickStrings } from '../src/views/chordTab';
import { sectionChart } from '../src/views/barChart';
import { defaultSettings } from '../src/core/transpose';
import type { ViewCtx } from '../src/views/common';

const SRC = `{title: Pick}
{artist: Test}
{time: 4/4}
{pick: travis = B 3 A 2 B 1 A 2}
{pick: pinch = B+1 - 3 2}
{section: Verse}
{use: travis x2}
[G]one [C]two
`;

const ctxOf = (src: string): ViewCtx => {
  const { song } = parseSong(src);
  return { song, settings: defaultSettings(song), showStringNames: false, tabWidthEm: 60 };
};

describe('fingerpicking patterns', () => {
  it('parses {pick:} and reports bad picks', () => {
    const r = parseSong(SRC);
    expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(r.song.strums.get('travis')!.picks![0]).toEqual(['B']);
    expect(r.song.strums.get('pinch')!.picks![0]).toEqual(['B', '1']);
    expect(r.song.strums.get('pinch')!.strokes[1]).toBe('-');
    const bad = parseSong('{pick: x = B 7}\n');
    expect(bad.diagnostics[0].message).toMatch(/pick "7"/);
  });

  it('resolves bass, alternate bass and string numbers on a shape', () => {
    const G = [3, 2, 0, 0, 0, 3];
    const C = [null, 3, 2, 0, 1, 0];
    expect(pickStrings(['B'], G)).toEqual([0]);
    expect(pickStrings(['A'], G)).toEqual([2]); // bass on 6 -> alternate on 4
    expect(pickStrings(['B'], C)).toEqual([1]);
    expect(pickStrings(['A'], C)).toEqual([2]);
    expect(pickStrings(['B', '1'], C)).toEqual([1, 5]);
    expect(pickStrings(['6'], C)).toEqual([]); // muted string is skipped
  });

  it('generates single picked notes, not strums', () => {
    const ctx = ctxOf(SRC);
    const [sys] = chordSystems(ctx.song.sections.get('verse')!, ctx);
    const low = sys.strings[5];
    const g = sys.strings[2];
    expect(low.startsWith('|3')).toBe(true); // G bass first
    expect(g.replace(/-/g, '').startsWith('|0')).toBe(true); // string 3 open
    expect(sys.strokes).toEqual([]); // no pick-stroke marks for fingerpicking
  });

  it('chart bars carry the picks', () => {
    const ctx = ctxOf(SRC);
    const bars = sectionChart(ctx.song.sections.get('verse')!, ctx);
    expect(bars[0].picks![0]).toEqual(['B']);
    expect(bars[0].kind).toBe('full');
  });
});
