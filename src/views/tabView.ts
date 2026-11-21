/** Tablature view: engraved tab staff per section, chords as a fallback. */
import { guitarOf } from '../core/transpose';
import {
  diagramsBlock, guitarId, orderBlock, playedSections, progressionRows, renderStrums, sectionComments, songHeader,
  tabsFor, type ViewCtx,
} from './common';
import { esc } from './html';
import { renderStaff } from './tabStaff';

export function renderTabView(ctx: ViewCtx): string {
  const gid = guitarId(ctx);
  const tuning = guitarOf(ctx.song, ctx.settings).tuning;
  let measure = 1;
  let first = true;
  const sections = playedSections(ctx.song)
    .map((s) => {
      const systems = tabsFor(s, gid).flatMap((t) => t.systems);
      let body: string;
      if (systems.length) {
        const staff = renderStaff(systems, {
          tuning,
          widthEm: ctx.tabWidthEm,
          showStringNames: ctx.showStringNames,
          firstMeasure: measure,
          timeSig: first ? ctx.song.meta.time : null,
          tempo: first ? ctx.song.meta.tempo : null,
        });
        measure += staff.measures;
        first = false;
        body = staff.html;
      } else {
        body = `<div class="tab-fallback"><p class="muted small">No tab for this section — chords:</p>${progressionRows(ctx, s)}</div>`;
      }
      return `<section class="sec"><h2 class="sec-label">${esc(s.name)}</h2>${sectionComments(s)}${renderStrums(ctx, s, true)}${body}</section>`;
    })
    .join('');
  return `${songHeader(ctx)}<div class="view-tab">${sections}</div>${diagramsBlock(ctx)}${orderBlock(ctx.song)}`;
}
