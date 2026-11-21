import { describe, expect, it } from 'vitest';
import { parseSong } from '../src/core/parser';
import { defaultSettings } from '../src/core/transpose';
import { renderChart, sectionChart } from '../src/views/barChart';
import type { ViewCtx } from '../src/views/common';
import { TAB_HELP_HTML } from '../src/ui/tabHelp';

const ctxFor = (src: string): ViewCtx => {
  const song = parseSong(src).song;
  return { song, settings: defaultSettings(song), showStringNames: false, tabWidthEm: 40 };
};
const chart = (body: string) => {
  const src = `{title: T}\n{artist: A}\n{strum: main = D - D U - U D U}\n{strum: push = D - - - D U D U}\n{section: V}\n${body}`;
  const ctx = ctxFor(src);
  return sectionChart(ctx.song.sections.get('v')!, ctx);
};

describe('bar-by-bar chord chart', () => {
  it('writes the strum once, then % for identical bars and % + chord on a chord change', () => {
    const bars = chart('{use: main x4}\n[G]one two [C]three four');
    expect(bars.map((b) => [b.kind, b.chords.join(' ')])).toEqual([
      ['full', 'G'], ['repeat', 'G'], ['chord', 'C'], ['repeat', 'C'],
    ]);
    expect(bars[0].strokes.join('')).toBe('D-DU-UDU');
  });

  it('writes the strum out again when it changes', () => {
    const bars = chart('{use: main x2, push x2}\n[G]a [C]b [D]c [D]d');
    expect(bars.map((b) => b.kind)).toEqual(['full', 'chord', 'full', 'repeat']);
    expect(bars[2].pattern).toBe('push');
  });

  it('shows both chords when a bar is split', () => {
    const bars = chart('{use: main x2}\n[G]a [C]b [D]c');
    expect(bars.map((b) => b.chords.join(' '))).toEqual(['G', 'C D']);
  });

  it('renders % marks with explanations', () => {
    const html = renderChart(chart('{use: main x3}\n[G]a [G]b [C]c'), '4/4');
    expect(html.match(/class="cb-repeat"/g)).toHaveLength(2);
    expect(html).toContain('Repeat the previous bar');
    expect(html).toContain('change to C');
    expect(html).toContain('<i>&</i>'); // counts under the arrows
  });

  it('uses displayed chord names (capo / transpose)', () => {
    const src = '{title: T}\n{artist: A}\n{key: A}\n{capo: 2}\n{strum: m = D}\n{section: V}\n{use: m x1}\n[G]a';
    const ctx = ctxFor(src);
    ctx.settings = { ...ctx.settings, capo: 0 };
    expect(sectionChart(ctx.song.sections.get('v')!, ctx)[0].chords).toEqual(['A']);
  });
});

describe('how to read tab panel', () => {
  it('draws real icons for every symbol and explains chords and the chart', () => {
    expect(TAB_HELP_HTML.match(/class="help-icon"/g)!.length).toBeGreaterThanOrEqual(25);
    for (const s of ['Hammer-on', 'Pull-off', 'Slide up', 'Bend', 'Vibrato', 'Palm mute', 'Let ring', 'Down strum', 'Up strum', 'quarter note', 'eighth notes', 'Repeat signs', 'How to read chord boxes', 'barre', 'How to read the chord chart', '%'])
      expect(TAB_HELP_HTML, s).toContain(s);
  });
});
