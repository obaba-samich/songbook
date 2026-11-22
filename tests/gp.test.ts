import { describe, expect, it } from 'vitest';
import { defaultPart, isBass, isGuitar, lyricTracks, partOptions, playableTracks, trackName } from '../src/ui/gpView';

// Minimal stand-ins for alphaTab tracks (real Guitar Pro files can't live in the public repo).
const track = (name: string, o: { strings?: number; perc?: boolean; stringed?: boolean; lyrics?: boolean; index?: number; program?: number } = {}) => ({
  name, shortName: '', index: o.index ?? 0, isPercussion: !!o.perc, playbackInfo: o.program === undefined ? undefined : { program: o.program },
  staves: [{ isStringed: o.stringed ?? !o.perc, tuning: Array(o.strings ?? 6).fill(40), bars: [{ voices: [{ beats: [{ lyrics: o.lyrics ? ['la'] : null }] }] }] }],
}) as never;
const song = (...tracks: never[]) => ({ title: '', artist: '', bytes: new Uint8Array(), score: { tracks } }) as never;

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

  it('puts the vocal line with lyrics over the guitars by default', () => {
    const s = song(
      track('Vocals - Cello', { lyrics: true, index: 0 }),
      track('Rhythm Guitar - Acoustic Guitar (steel)', { index: 1 }),
      track('Fiddle - Fiddle', { lyrics: true, index: 2 }),
    );
    expect(defaultPart(s)).toBe('sing');
    expect(partOptions(s)[0]).toEqual({ value: 'sing', label: 'Lyrics + guitar' });
    expect(lyricTracks((s as { score: { tracks: never[] } }).score.tracks).map((t: { name: string }) => t.name)).toEqual(['Vocals - Cello']);
  });

  it('no lyrics: guitars only', () => {
    const s = song(track('Acoustic Guitar 1', { index: 0 }), track('Acoustic Guitar 2', { index: 1 }));
    expect(defaultPart(s)).toBe('guitars');
    expect(partOptions(s).some((o) => o.value === 'sing')).toBe(false);
  });

  it('tab picker offers guitar-related parts only; every part can still play', () => {
    const s = song(
      track('Vocals - Cello', { lyrics: true, index: 0 }),
      track('Rhythm Guitar - Acoustic Guitar (steel)', { index: 1 }),
      track('Lead Guitar - Electric Guitar (clean)', { index: 2 }),
      track('Bass - Electric Bass (finger)', { strings: 4, index: 3 }),
      track('Fiddle - Fiddle', { index: 4 }),
      track('Drums', { perc: true, index: 5 }),
    );
    expect(partOptions(s).map((o) => o.value)).toEqual(['sing', 'guitars', '1', '2', '3']);
    expect(playableTracks(s).map((t) => t.label)).toEqual(['Vocals', 'Rhythm Guitar', 'Lead Guitar', 'Bass', 'Fiddle', 'Drums']);
  });

  it('tells apart two parts with the same name by their sound', () => {
    const s = song(
      track('Noel Gallagher | Takamine | Lead Guitar - Acoustic Guitar (steel)', { index: 0 }),
      track('Noel Gallagher | Fender Stratocaster | Lead Guitar - Electric Guitar (clean)', { index: 1 }),
    );
    expect(partOptions(s).slice(1).map((o) => o.label)).toEqual(['Lead Guitar (Acoustic Guitar (steel))', 'Lead Guitar (Electric Guitar (clean))']);
  });
});
