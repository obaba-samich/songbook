import { describe, expect, it } from 'vitest';
import { isBass, isGuitar, trackName } from '../src/ui/gpView';

// Minimal stand-ins for alphaTab tracks (real Guitar Pro files can't live in the public repo).
const track = (name: string, o: { strings?: number; perc?: boolean; stringed?: boolean } = {}) => ({
  name, shortName: '', index: 0, isPercussion: !!o.perc,
  staves: [{ isStringed: o.stringed ?? !o.perc, tuning: Array(o.strings ?? 6).fill(40) }],
}) as never;

describe('Guitar Pro tracks', () => {
  it('cleans up Songsterr-style names', () => {
    expect(trackName(track('Billie Joe Armstrong | Gibson J-180 | Acoustic Guitar - Acoustic Guitar (steel)'))).toBe('Acoustic Guitar');
    expect(trackName(track('Lead Vocals - Tenor Sax'))).toBe('Lead Vocals');
    expect(trackName(track('Electric Guitar (clean)'))).toBe('Electric Guitar (clean)');
  });

  it('finds guitars by name, not by 6-string tuning', () => {
    expect(isGuitar(track('Lead Guitar - Electric Guitar (jazz)'))).toBe(true);
    expect(isGuitar(track('Acoustic Guitar (steel)'))).toBe(true);
    expect(isGuitar(track('Vocals - Tenor Sax'))).toBe(false);
    expect(isGuitar(track('Piano (Upper Staff) - Acoustic Grand Piano'))).toBe(false);
    expect(isGuitar(track('Electric Bass (finger)', { strings: 4 }))).toBe(false);
    expect(isGuitar(track('Drums', { perc: true }))).toBe(false);
    expect(isGuitar(track('Track 1'))).toBe(true);
  });

  it('bass is tab too, contrabass is not', () => {
    expect(isBass(track('Electric Bass (finger)', { strings: 4 }))).toBe(true);
    expect(isBass(track('String Arrangements - Contrabass', { strings: 4 }))).toBe(false);
  });
});
