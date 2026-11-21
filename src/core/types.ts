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
  strokes: Stroke[];
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
  | { kind: 'tab'; line: number; tab: TabBlock }
  | { kind: 'strum'; line: number; refs: StrumRef[] };

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

export interface SongMeta {
  title: string;
  artist: string;
  key: string | null;
  capo: number;
  tempo: number | null;
  time: string;
  tuning: Tuning;
}

export interface Song {
  meta: SongMeta;
  /** {comment:} lines from the header. */
  comments: string[];
  defines: Map<string, ChordShape>;
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
