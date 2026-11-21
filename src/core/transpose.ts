/**
 * Transpose and capo maths.
 *
 * Chords in a file are the shapes played with the file's capo; {key} is the
 * key the song sounds in. Transposing changes the sounding pitch; changing the
 * capo keeps the pitch and changes the shapes.
 */
import type { ChordShape, Song } from './types';
import { keyUsesFlats, NO_CHORD, transposeChord, transposeKey } from './chords';
import { lookupChord, shiftShape } from './library';

export interface PlaySettings {
  /** Semitones to move the sounding pitch. */
  transpose: number;
  /** Capo fret the player uses. */
  capo: number;
}

/** How many semitones the fingered shapes move relative to the file. */
export function shapeShift(song: Song, s: PlaySettings): number {
  return s.transpose - (s.capo - song.meta.capo);
}

export function soundingKey(song: Song, s: PlaySettings): string | null {
  return song.meta.key ? transposeKey(song.meta.key, s.transpose) : null;
}

/** Key of the shapes the player fingers (sounding key minus capo). */
export function shapesKey(song: Song, s: PlaySettings): string | null {
  const k = soundingKey(song, s);
  return k ? transposeKey(k, -s.capo) : null;
}

/** Whether displayed chord names should use flats. */
export function preferFlats(song: Song, s: PlaySettings): boolean | null {
  return keyUsesFlats(shapesKey(song, s));
}

/** The chord name to display for a chord written in the file. */
export function displayChord(name: string, song: Song, s: PlaySettings): string {
  const shift = shapeShift(song, s);
  if (name === NO_CHORD || shift === 0) return name;
  return transposeChord(name, shift, preferFlats(song, s));
}

/**
 * Shape for a chord as displayed. A custom {define} moves with the chord when
 * that's physically possible; otherwise the library shape for the new name.
 */
export function shapeFor(name: string, song: Song, s: PlaySettings): ChordShape | null {
  const shift = shapeShift(song, s);
  const opts = { defines: song.defines, tuning: song.meta.tuning };
  if (shift === 0) return lookupChord(name, opts);
  const shown = displayChord(name, song, s);
  if (song.defines.has(shown)) return song.defines.get(shown)!;
  const custom = song.defines.get(name);
  if (custom) {
    const moved = shiftShape(custom, ((shift % 12) + 12) % 12);
    if (moved) return moved;
  }
  return lookupChord(shown, { tuning: song.meta.tuning });
}
