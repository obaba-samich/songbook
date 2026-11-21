/** Shared data model for a parsed .gsong file. */

export type Severity = 'error' | 'warning';

export interface Diagnostic {
  /** 1-based line number in the source file. */
  line: number;
  severity: Severity;
  message: string;
}

/** Fret per string, lowest string first. null = muted, 0 = open. */
export type Frets = (number | null)[];

export interface ChordShape {
  frets: Frets;
  /** Finger per string (1-4), 0/null = none. Optional. */
  fingers?: (number | null)[];
  /** Where the shape came from, for display/debug. */
  source: 'defined' | 'library' | 'generated' | 'shifted';
  /** Set when a slash chord's bass couldn't be fitted into the shape. */
  bassHint?: string;
}

export interface Tuning {
  name: string;
  /** Note names, lowest string first, e.g. ['E','A','D','G','B','E']. */
  notes: string[];
}

export type Stroke = 'D' | 'U' | '-' | 'X';

export interface StrumPattern {
  name: string;
  /** For a picking pattern: 'D' where something is picked, '-' for a rest. */
  strokes: Stroke[];
  /**
   * Set for a fingerpicking pattern ({pick:}): per slot, the strings picked
   * together — 'B' = the chord's bass string, 'A' = alternate bass,
   * '1'-'6' = string number (1 = thinnest). Empty = rest.
   */
  picks?: string[][];
  line: number;
}

export interface StrumRef {
  name: string;
  repeat: number;
  line: number;
}

export interface LyricSegment {
  /** Chord placed above the start of `text`, or null. */
  chord: string | null;
  text: string;
}

export type BodyLine =
  | { kind: 'lyric'; line: number; segments: LyricSegment[] }
  | { kind: 'comment'; line: number; text: string }
  | { kind: 'blank'; line: number }
  /** `guitar` is the lower-cased name of the guitar the tab/strum belongs to. */
  | { kind: 'tab'; line: number; guitar: string; tab: TabBlock }
  | { kind: 'strum'; line: number; guitar: string; refs: StrumRef[] };

/** One 6-string system (plus optional annotation lines above it). */
export interface TabSystem {
  line: number;
  annotations: string[];
  /** String contents, HIGH string first (as written), with labels stripped. */
  strings: string[];
  /** True when the source lines carried string-name labels. */
  labelled: boolean;
}

export interface TabBlock {
  line: number;
  systems: TabSystem[];
}

export interface Section {
  name: string;
  line: number;
  body: BodyLine[];
}

/**
 * One guitar part. Every song has at least one. Capo, tuning and voicings
 * can differ per guitar; chord names in the lyrics are written as shapes for
 * the song's default capo and get re-worked for each guitar's own capo.
 */
export interface Guitar {
  name: string;
  /** Lower-cased name, used as the key in body lines. */
  id: string;
  line: number;
  capo: number;
  tuning: Tuning;
  /** Song-wide defines merged with this guitar's own (guitar wins). */
  defines: Map<string, ChordShape>;
}

export interface SongMeta {
  title: string;
  artist: string;
  key: string | null;
  /** Default capo: chord names in the file are shapes for this capo. */
  capo: number;
  tempo: number | null;
  time: string;
  tuning: Tuning;
}

export interface Song {
  meta: SongMeta;
  /** {comment:} lines from the header. */
  comments: string[];
  /** Song-wide {define}s (before any {guitar:}). */
  defines: Map<string, ChordShape>;
  /** Guitar parts in declaration order; [0] is the default. Never empty. */
  guitars: Guitar[];
  strums: Map<string, StrumPattern>;
  /** Keyed by lower-cased section name, in file order. */
  sections: Map<string, Section>;
  /** Canonical section names in play order. */
  order: string[];
}

export interface ParseResult {
  song: Song;
  diagnostics: Diagnostic[];
  /** Source lines, for showing excerpts next to errors. */
  lines: string[];
}
