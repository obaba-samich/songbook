/**
 * Guitar Pro files (.gp, .gp5, .gpx …) drawn with alphaTab: real tab with
 * rhythm stems, techniques, every part stacked, and playback with a cursor
 * that follows the notes.
 */
import * as alphaTab from '@coderline/alphatab';
// Bundled by Vite as asset URLs (alphaTab's own Vite plugin is broken in 1.8.4).
import bravuraWoff2 from '@coderline/alphatab/font/Bravura.woff2?url';
import bravuraWoff from '@coderline/alphatab/font/Bravura.woff?url';
import soundFontUrl from '@coderline/alphatab/soundfont/sonivox.sf2?url';

type Score = alphaTab.model.Score;
type Track = alphaTab.model.Track;

export interface GpSong {
  title: string;
  artist: string;
  score: Score;
  bytes: Uint8Array;
}

export const GP_EXT = /\.(gp|gp3|gp4|gp5|gpx)$/i;

/** Read a Guitar Pro file (throws when the file can't be read). */
export function loadGp(bytes: Uint8Array, fileName: string): GpSong {
  const score = alphaTab.importer.ScoreLoader.loadScoreFromBytes(bytes, new alphaTab.Settings());
  // Guitars and bass as tab only (like Songsterr); everything else as normal sheet music.
  for (const t of score.tracks) {
    const tab = isGuitar(t) || isBass(t);
    for (const st of t.staves) {
      st.showTablature = tab;
      st.showStandardNotation = !tab;
      st.showSlash = false;
      st.showNumbered = false;
    }
  }
  // Songsterr exports repeat the section name as its letter ("[Verse 1] Verse 1").
  for (const mb of score.masterBars) if (mb.section && mb.section.marker === mb.section.text) mb.section.marker = '';
  return { title: score.title || fileName.replace(GP_EXT, ''), artist: score.artist || '', score, bytes };
}

/**
 * Clean up track names: "Billie Joe Armstrong | Gibson J-180 | Acoustic Guitar - Acoustic Guitar (steel)"
 * → "Acoustic Guitar"; "Lead Vocals - Tenor Sax" → "Lead Vocals". The part after " - " is the sound used.
 */
export function trackName(t: Track): string {
  const n = (t.name || t.shortName || `Track ${t.index + 1}`).split('|').pop()!.trim();
  return n.split(' - ')[0].trim() || n;
}

/** Track names, with the sound added where two parts share a name ("Lead Guitar (Acoustic Guitar (steel))"). */
function trackLabels(tracks: Track[]): Map<number, string> {
  const names = new Map(tracks.map((t) => [t.index, trackName(t)]));
  const count = new Map<string, number>();
  for (const n of names.values()) count.set(n, (count.get(n) ?? 0) + 1);
  for (const t of tracks) {
    const n = names.get(t.index)!;
    const sound = (t.name || '').split('|').pop()!.split(' - ')[1]?.trim();
    if (count.get(n)! > 1 && sound) names.set(t.index, `${n} (${sound})`);
  }
  return names;
}

const fullName = (t: Track) => `${t.name} ${t.shortName}`;

/**
 * Guitar parts. Songsterr exports give vocals, piano and sax 6-string
 * tunings too, so go by the name; fall back to 6-string tracks.
 */
export function isGuitar(t: Track): boolean {
  if (t.isPercussion || !t.staves[0]?.isStringed) return false;
  if (/bass/i.test(fullName(t))) return false;
  if (/guitar|gtr/i.test(fullName(t))) return true;
  if (/vocal|voice|sax|piano|keys|organ|synth|violin|viola|cello|string|wind|flute|trumpet|horn|harmonica|fiddle/i.test(fullName(t))) return false;
  // No name to go by: use the General MIDI sound (24–31 are the guitars), so "Bird Tweet" isn't one.
  const program = t.playbackInfo?.program;
  if (program !== undefined) return program >= 24 && program <= 31;
  return t.staves[0].tuning.length >= 6;
}

export function isBass(t: Track): boolean {
  return !t.isPercussion && !!t.staves[0]?.isStringed && /bass/i.test(fullName(t)) && !/contrabass|double bass/i.test(fullName(t));
}

/** Tracks that carry lyrics (the vocal line). */
export function hasLyrics(t: Track): boolean {
  return t.staves.some((st) => st.bars.some((b) => b.voices.some((v) => v.beats.some((be) => be.lyrics?.some((l) => !!l)))));
}

/** The vocal line(s): lyric tracks named as vocals, else any non-guitar track with lyrics (Songsterr copies lyrics onto fiddles etc.). */
export function lyricTracks(tracks: Track[]): Track[] {
  const withLyrics = tracks.filter((t) => hasLyrics(t) && !isGuitar(t));
  const vocals = withLyrics.filter((t) => /vocal|voice|sing/i.test(fullName(t)));
  return vocals.length ? vocals : withLyrics.slice(0, 1);
}

/**
 * Part choices: 'sing' (vocal line with lyrics on top, guitars under it),
 * 'guitars' (all guitars stacked), 'all' (every part stacked) or a track index.
 */
export type GpPart = 'sing' | 'guitars' | 'all' | number;

export function parsePart(v: string): GpPart {
  return v === 'sing' || v === 'guitars' || v === 'all' ? v : Number(v);
}

/** What the tab can show: guitar-related parts only (guitars, bass, the lyric line over them). Other instruments are only heard. */
export function partOptions(song: GpSong): { value: string; label: string }[] {
  const tracks = song.score.tracks;
  const guitars = tracks.filter(isGuitar);
  const opts: { value: string; label: string }[] = [];
  if (lyricTracks(tracks).length && guitars.length) opts.push({ value: 'sing', label: `Lyrics + guitar${guitars.length > 1 ? 's' : ''}` });
  if (guitars.length > 1) opts.push({ value: 'guitars', label: `All guitars (${guitars.length}, stacked)` });
  const shown = tracks.filter((t) => isGuitar(t) || isBass(t));
  // A file with no guitar or bass at all: show every part rather than nothing.
  if (!shown.length) opts.push({ value: 'all', label: `Every part (${tracks.length}, stacked)` });
  const labels = trackLabels(tracks);
  shown.forEach((t) => opts.push({ value: String(t.index), label: labels.get(t.index)! }));
  return opts;
}

/** Every part, for the "instruments that play" checkboxes. */
export function playableTracks(song: GpSong): { index: number; label: string }[] {
  const labels = trackLabels(song.score.tracks);
  return song.score.tracks.map((t) => ({ index: t.index, label: labels.get(t.index)! }));
}

export function defaultPart(song: GpSong): GpPart {
  const guitars = song.score.tracks.filter(isGuitar);
  if (guitars.length && lyricTracks(song.score.tracks).length) return 'sing';
  return guitars.length > 1 ? 'guitars' : guitars.length ? guitars[0].index : 'all';
}

function tracksFor(song: GpSong, part: GpPart): Track[] {
  const all = song.score.tracks;
  if (part === 'all') return all;
  if (part === 'guitars') return all.filter(isGuitar);
  if (part === 'sing') return [...lyricTracks(all), ...all.filter(isGuitar)];
  return [all[part] ?? all[0]];
}

export interface GpViewOptions {
  dark: boolean;
  /** 1 = default size. */
  scale: number;
  showStringNames: boolean;
  /** Track indexes that stay silent during playback. */
  muted?: ReadonlySet<number>;
  onPlayState?: (playing: boolean) => void;
  onReady?: () => void;
}

const COLORS = {
  light: { ink: '#1c1c1c', line: '#9a9a9a', soft: '#777777' },
  dark: { ink: '#ececec', line: '#6d6d6d', soft: '#a8a8a8' },
};

/** One mounted score. Create a new one per song; call destroy() when done. */
export class GpView {
  private api: alphaTab.AlphaTabApi;
  private song: GpSong;
  private muted: Set<number>;
  playing = false;

  constructor(el: HTMLElement, song: GpSong, part: GpPart, o: GpViewOptions) {
    this.song = song;
    this.muted = new Set(o.muted ?? []);
    const c = o.dark ? COLORS.dark : COLORS.light;
    const settings = {
      core: {
        smuflFontSources: new Map([[alphaTab.FontFileFormat.Woff2, bravuraWoff2], [alphaTab.FontFileFormat.Woff, bravuraWoff]]),
        // Render on the page (no worker files to serve; works from file:// too).
        useWorkers: false,
      },
      display: {
        // Rhythm stems under the tab numbers.
        // Each staff's own flags decide (set in loadGp): tab for guitars/bass, notation for the rest.
        staveProfile: alphaTab.StaveProfile.Default,
        layoutMode: alphaTab.LayoutMode.Page,
        scale: o.scale,
        resources: {
          mainGlyphColor: c.ink, secondaryGlyphColor: c.soft, scoreInfoColor: c.ink,
          staffLineColor: c.line, barSeparatorColor: c.line, barNumberColor: c.soft,
        },
      },
      notation: {
        rhythmMode: alphaTab.TabRhythmMode.ShowWithBars,
        elements: new Map<alphaTab.NotationElement, boolean>([
          [alphaTab.NotationElement.GuitarTuning, o.showStringNames],
          [alphaTab.NotationElement.ScoreWordsAndMusic, false],
        ]),
      },
      player: {
        playerMode: alphaTab.PlayerMode.EnabledSynthesizer,
        soundFont: soundFontUrl,
        scrollElement: document.scrollingElement as HTMLElement,
        enableCursor: true,
        enableAnimatedBeatCursor: true,
        enableUserInteraction: true,
      },
    } as unknown as alphaTab.json.SettingsJson;
    this.api = new alphaTab.AlphaTabApi(el, settings);
    this.api.playerStateChanged.on((e) => {
      this.playing = e.state === alphaTab.synth.PlayerState.Playing;
      o.onPlayState?.(this.playing);
    });
    if (o.onReady) this.api.renderFinished.on(() => o.onReady!());
    this.api.renderScore(song.score, tracksFor(song, part).map((t) => t.index));
  }

  /** Turn one instrument's sound on or off (the tab shown doesn't change). */
  setMuted(index: number, muted: boolean) {
    if (muted) this.muted.add(index); else this.muted.delete(index);
    const t = this.song.score.tracks[index];
    if (t) this.api.changeTrackMute([t], muted);
  }

  private applyMutes() {
    const tracks = this.song.score.tracks;
    this.api.changeTrackMute(tracks.filter((t) => !this.muted.has(t.index)), false);
    this.api.changeTrackMute(tracks.filter((t) => this.muted.has(t.index)), true);
  }

  setPart(part: GpPart) {
    this.api.renderTracks(tracksFor(this.song, part));
  }

  /** Play/pause. False when playback isn't available (the single-file build has no audio worker). */
  playPause(): boolean {
    if (!this.api.isReadyForPlayback) return false;
    // Re-sent on every start: mutes set before the audio loaded don't stick (and alphaTab 1.8.4's midiLoaded event recurses forever).
    this.applyMutes();
    this.api.playPause();
    return true;
  }

  set speed(v: number) {
    this.api.playbackSpeed = v;
  }

  destroy() {
    try { this.api.stop(); } catch { /* not ready */ }
    this.api.destroy();
  }
}
