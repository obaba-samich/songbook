/**
 * Tablature view: the whole song as one continuous tab score. Sections with
 * hand-written tab use it; every other section is turned into tab from its
 * chords and strum pattern, with the lyrics under the notes.
 */
import { guitarOf } from '../core/transpose';
import { chordSystems } from './chordTab';
import { diagramsBlock, guitarId, orderBlock, playedSections, songHeader, tabsFor, type ViewCtx } from './common';
import { renderStaff, type StaffSystem } from './tabStaff';

export function renderTabView(ctx: ViewCtx): string {
  const gid = guitarId(ctx);
  const tuning = guitarOf(ctx.song, ctx.settings).tuning;
  const systems: StaffSystem[] = [];
  for (const s of playedSections(ctx.song)) {
    const written = tabsFor(s, gid).flatMap((t) => t.systems);
    const sys: StaffSystem[] = written.length ? written.map((x) => ({ ...x })) : chordSystems(s, ctx);
    if (!sys.length) continue;
    const comments = s.body.flatMap((b) => (b.kind === 'comment' ? [b.text] : []));
    sys[0] = { ...sys[0], section: s.name, sectionTip: comments.join(' · ') || undefined };
    systems.push(...sys);
  }
  const staff = renderStaff(systems, {
    tuning,
    widthEm: ctx.tabWidthEm,
    showStringNames: ctx.showStringNames,
    time: ctx.song.meta.time,
    showTimeSig: true,
    tempo: ctx.song.meta.tempo,
  });
  return `${songHeader(ctx)}<div class="view-tab">${staff.html}</div>${diagramsBlock(ctx)}${orderBlock(ctx.song)}`;
}
