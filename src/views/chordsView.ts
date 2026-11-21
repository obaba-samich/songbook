/** Chords view: each section once, its progression and strum, then diagrams and order. */
import type { Section } from '../core/types';
import { diagramsBlock, orderBlock, playedSections, progressionRows, renderStrums, sectionComments, songHeader, type ViewCtx } from './common';
import { esc } from './html';

export function renderChordsView(ctx: ViewCtx): string {
  const unique: Section[] = [];
  for (const s of playedSections(ctx.song)) if (!unique.includes(s)) unique.push(s);
  const times = (s: Section) => ctx.song.order.filter((n) => n.toLowerCase() === s.name.toLowerCase()).length;
  const body = unique
    .map((s) => {
      const n = times(s);
      const badge = n > 1 ? ` <span class="played" title="Played ${n} times in the song">played ×${n}</span>` : '';
      return `<section class="sec"><h2 class="sec-label">${esc(s.name)}${badge}</h2>${sectionComments(s)}${renderStrums(ctx, s)}${progressionRows(ctx, s)}</section>`;
    })
    .join('');
  return `${songHeader(ctx)}<div class="view-chords">${body}</div>${diagramsBlock(ctx)}${orderBlock(ctx.song)}`;
}
