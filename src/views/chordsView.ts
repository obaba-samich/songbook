/** Chords view: each section once as a bar-by-bar chord chart (strum, chord, % repeats), then diagrams and order. */
import type { Section } from '../core/types';
import { diagramsBlock, guitarId, orderBlock, playedSections, renderStrum, sectionComments, songHeader, strumsFor, type ViewCtx } from './common';
import { renderChart, sectionChart } from './barChart';
import { esc } from './html';

export function renderChordsView(ctx: ViewCtx): string {
  const unique: Section[] = [];
  for (const s of playedSections(ctx.song)) if (!unique.includes(s)) unique.push(s);
  const times = (s: Section) => ctx.song.order.filter((n) => n.toLowerCase() === s.name.toLowerCase()).length;
  const body = unique
    .map((s) => {
      const n = times(s);
      const badge = n > 1 ? ` <span class="played" title="Played ${n} times in the song">played ×${n}</span>` : '';
      return `<section class="sec"><h2 class="sec-label">${esc(s.name)}${badge}</h2>${sectionComments(s)}${pickLegend(ctx, s)}${renderChart(sectionChart(s, ctx), ctx.song.meta.time, ctx.chartPerRow ?? 8, ctx.chartSize ?? 'm')}</section>`;
    })
    .join('');
  return `${songHeader(ctx)}<div class="view-chords">${body}</div>${diagramsBlock(ctx)}${orderBlock(ctx.song)}`;
}

/** Fingerpicking patterns don't fit in a bar: write each one out once above the chart. */
function pickLegend(ctx: ViewCtx, s: Section): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const ref of strumsFor(s, guitarId(ctx))) {
    const p = ctx.song.strums.get(ref.name);
    if (!p?.picks || seen.has(p.name)) continue;
    seen.add(p.name);
    out.push(renderStrum(p, ref, ctx.song.meta.time, true));
  }
  return out.length ? `<div class="strums">${out.join('')}</div>` : '';
}
