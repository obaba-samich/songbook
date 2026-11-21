/** Lyrics + Chords view: chord names sit exactly above the syllable where they change. */
import type { LyricSegment, Section } from '../core/types';
import { chordChip, chordName, diagramsBlock, orderBlock, playedSections, renderStrums, songHeader, type ViewCtx } from './common';
import { esc } from './html';
import { NO_CHORD } from '../core/chords';

/**
 * Break segments so only the first word of each carries the chord. That lets
 * long lines wrap between words while the chord stays pinned to its syllable.
 */
export function splitSegments(segments: LyricSegment[]): LyricSegment[] {
  const out: LyricSegment[] = [];
  for (const seg of segments) {
    const m = /^(\S*\s*)([\s\S]*)$/.exec(seg.text)!;
    out.push({ chord: seg.chord, text: m[1] });
    for (const w of m[2].match(/\S+\s*/g) ?? []) out.push({ chord: null, text: w });
  }
  return out;
}

function lyricLine(ctx: ViewCtx, segments: LyricSegment[]): string {
  const hasChords = segments.some((s) => s.chord);
  const hasText = segments.some((s) => s.text.trim());
  if (!hasText) {
    // Chord-only line: intros, turnarounds.
    return `<div class="chord-line">${segments.filter((s) => s.chord).map((s) => chordChip(ctx, s.chord!)).join('')}</div>`;
  }
  if (!hasChords) return `<div class="lyric plain">${esc(segments.map((s) => s.text).join(''))}</div>`;
  const parts = splitSegments(segments);
  const html = parts
    .map((s, i) => {
      const chord = s.chord ? (s.chord === NO_CHORD ? 'N.C.' : chordName(ctx, s.chord)) : '';
      // Mid-word change ("A[D]mazing"): join with no gap so the word reads whole.
      const midWord = s.text !== '' && !/\s$/.test(s.text) && parts[i + 1]?.chord && /^\S/.test(parts[i + 1].text);
      const text = s.text === '' ? ' ' : esc(s.text).replace(/ /g, ' ');
      return `<span class="seg${midWord ? ' mid' : ''}"><span class="ch">${esc(chord) || ' '}</span><span class="ly">${text}</span></span>`;
    })
    .join('');
  return `<div class="lyric">${html}</div>`;
}

function renderSection(ctx: ViewCtx, s: Section): string {
  const lines = s.body
    .map((b) => {
      if (b.kind === 'lyric') return lyricLine(ctx, b.segments);
      if (b.kind === 'comment') return `<p class="sec-comment">${esc(b.text)}</p>`;
      if (b.kind === 'blank') return '<div class="gap"></div>';
      return '';
    })
    .join('');
  return `<section class="sec"><h2 class="sec-label">${esc(s.name)}</h2>${renderStrums(ctx, s, true)}<div class="lyrics">${lines}</div></section>`;
}

export function renderLyricsView(ctx: ViewCtx): string {
  const body = playedSections(ctx.song).map((s) => renderSection(ctx, s)).join('');
  return `${songHeader(ctx)}<div class="view-lyrics">${body}</div>${diagramsBlock(ctx)}${orderBlock(ctx.song)}`;
}
