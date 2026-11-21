import { describe, expect, it } from 'vitest';
import { parseSong } from '../src/core/parser';
import { defaultSettings } from '../src/core/transpose';
import { renderTabView } from '../src/views/tabView';
import type { ViewCtx } from '../src/views/common';

const SRC = `{title: Two}
{artist: Test}
{time: 4/4}
{strum: main = D - D U - U D U}
{pick: travis = B 3 A 2 B 1 A 2}
{guitar: Rhythm}
{guitar: Picking}
{capo: 2}
{section: Verse}
{guitar: Rhythm}
{use: main x8}
{guitar: Picking}
{use: travis x8}
[G]one [C]two [D]three [G]four
[G]five [C]six [D]seven [G]eight
`;

describe('stacked parts', () => {
  it('draws every guitar in each row with the same row count', () => {
    const { song, diagnostics } = parseSong(SRC);
    expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const ctx: ViewCtx = { song, settings: defaultSettings(song), showStringNames: false, tabWidthEm: 40, stacked: true };
    const html = renderTabView(ctx);
    const rows = html.split('class="stack-row"').length - 1;
    expect(rows).toBeGreaterThan(1);
    expect(html.split('class="stack-part"').length - 1).toBe(rows * 2);
    expect(html).toContain('>Rhythm<');
    expect(html).toContain('>Picking<');
  });

  it('one guitar renders a plain staff', () => {
    const { song } = parseSong(SRC.replace('{guitar: Picking}\n{capo: 2}\n', ''));
    const ctx: ViewCtx = { song, settings: defaultSettings(song), showStringNames: false, tabWidthEm: 40, stacked: true };
    expect(renderTabView(ctx)).not.toContain('stack-row');
  });
});
