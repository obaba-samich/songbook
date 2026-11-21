/**
 * The "How to read tab" panel. Every symbol is drawn with the same SVG and
 * CSS classes the score uses, so what you see here is exactly what appears
 * in the tab.
 */
import { chordDiagram } from '../views/diagram';
import { renderChart, type ChartBar } from '../views/barChart';
import { lookupChord } from '../core/library';


const svg = (w: number, h: number, body: string) =>
  `<svg class="help-icon" viewBox="0 0 ${w} ${h}" width="${Math.round(w * 1.15)}" height="${Math.round(h * 1.15)}" aria-hidden="true">${body}</svg>`;
const strings = (w: number, ys: number[]) => ys.map((y) => `<line class="st-line" x1="0" y1="${y}" x2="${w}" y2="${y}"/>`).join('');
const note = (x: number, y: number, t: string) => {
  const w = t.length * 6.8 + 3;
  return `<rect class="st-knock" x="${x - w / 2}" y="${y - 6.5}" width="${w}" height="13"/><text class="st-fret" x="${x}" y="${y}">${t}</text>`;
};
/** Three string lines with something on the middle one. */
const on3 = (w: number, body: (y: number) => string, top = 0) => svg(w, 30 + top, strings(w, [3 + top, 16 + top, 29 + top]) + body(16 + top));

const ICONS = {
  fret: on3(34, (y) => note(17, y, '3')),
  open: on3(34, (y) => note(17, y, '0')),
  muted: on3(34, (y) => note(17, y, 'X')),
  stacked: svg(34, 70, strings(34, [3, 16, 29, 42, 55, 68]) + note(17, 3, '0') + note(17, 16, '1') + note(17, 29, '0') + note(17, 42, '2') + note(17, 55, '3')),
  hammer: on3(56, (y) => note(12, y, '2') + note(44, y, '4') + `<path class="st-slur" d="M13 ${y - 8} Q28 ${y - 15} 43 ${y - 8}"/><text class="st-hp" x="28" y="${y - 16}">H</text>`, 12),
  pull: on3(56, (y) => note(12, y, '4') + note(44, y, '2') + `<path class="st-slur" d="M13 ${y - 8} Q28 ${y - 15} 43 ${y - 8}"/><text class="st-hp" x="28" y="${y - 16}">P</text>`, 12),
  slideUp: on3(56, (y) => note(12, y, '5') + note(44, y, '7') + `<line class="st-slide" x1="18" y1="${y + 3}" x2="38" y2="${y - 3}"/>`),
  slideDown: on3(56, (y) => note(12, y, '7') + note(44, y, '5') + `<line class="st-slide" x1="18" y1="${y - 3}" x2="38" y2="${y + 3}"/>`),
  bend: on3(44, (y) => note(12, y, '7') + `<path class="st-bend" d="M17 ${y} Q26 ${y} 26 8"/><path class="st-arrow" d="M23 9 L26 4 L29 9 Z"/><text class="st-amt" x="34" y="7">full</text>`, 14),
  release: on3(56, (y) => note(12, y, '7') + `<path class="st-bend" d="M17 ${y} Q26 ${y} 26 8"/><path class="st-arrow" d="M23 9 L26 4 L29 9 Z"/><path class="st-bend" d="M32 6 Q40 6 40 ${y - 9}"/><path class="st-arrow" d="M37 ${y - 13} L40 ${y - 8} L43 ${y - 13} Z"/>`, 14),
  vibrato: on3(44, (y) => note(12, y, '5') + `<path class="st-vib" d="M8 8 L11 6 L14 10 L17 6 L20 10 L23 6 L26 10 L29 6 L32 10"/>`, 10),
  ghost: on3(40, (y) => note(20, y, '(3)')),
  pm: svg(96, 14, `<text class="st-effect" x="0" y="10">P.M.</text><line class="st-dash" x1="22" y1="7" x2="92" y2="7"/><line class="st-tick" x1="92" y1="4" x2="92" y2="10"/>`),
  ring: svg(96, 14, `<text class="st-effect" x="0" y="10">let ring</text><line class="st-dash" x1="33" y1="7" x2="92" y2="7"/><line class="st-tick" x1="92" y1="4" x2="92" y2="10"/>`),
  bar: on3(40, (y) => note(9, y, '2') + `<line class="st-bar" x1="20" y1="${y - 13}" x2="20" y2="${y + 13}"/>` + note(31, y, '0') + `<text class="st-num" x="22" y="${y - 16}">5</text>`, 8),
  repeat: svg(56, 30, strings(56, [3, 16, 29]) + `<rect class="st-thick" x="4" y="3" width="3" height="26"/><line class="st-bar" x1="9" y1="3" x2="9" y2="29"/><circle class="st-dot" cx="13" cy="10" r="1.7"/><circle class="st-dot" cx="13" cy="22" r="1.7"/><circle class="st-dot" cx="43" cy="10" r="1.7"/><circle class="st-dot" cx="43" cy="22" r="1.7"/><line class="st-bar" x1="47" y1="3" x2="47" y2="29"/><rect class="st-thick" x="49" y="3" width="3" height="26"/>`),
  section: svg(70, 16, `<text class="st-section" x="0" y="12">Verse 1</text>`),
  chordName: svg(50, 36, `<text class="st-chord" x="4" y="10">Am</text>` + strings(50, [20, 33]) + note(9, 20, '0') + note(9, 33, '1')),
  down: svg(20, 14, `<path class="st-pick" d="M7 11 V4 H13 V11"/>`),
  up: svg(20, 14, `<path class="st-pick" d="M7.4 3 L10 11 L12.6 3"/>`),
  quarter: svg(24, 22, `<line class="st-stem" x1="12" y1="2" x2="12" y2="18"/>`),
  half: svg(24, 22, `<line class="st-stem" x1="12" y1="2" x2="12" y2="10"/>`),
  whole: svg(24, 22, `<text class="st-hp" x="12" y="14">—</text>`),
  eighths: svg(36, 22, `<line class="st-stem" x1="8" y1="2" x2="8" y2="18"/><line class="st-stem" x1="28" y1="2" x2="28" y2="18"/><rect class="st-beam" x="8" y="16" width="20" height="2.2"/>`),
  eighth: svg(24, 22, `<line class="st-stem" x1="9" y1="2" x2="9" y2="18"/><path class="st-flag" d="M9 18 q5 -2 6 -8"/>`),
  sixteenths: svg(56, 22, [6, 20, 34, 48].map((x) => `<line class="st-stem" x1="${x}" y1="2" x2="${x}" y2="18"/>`).join('') + `<rect class="st-beam" x="6" y="16" width="42" height="2.2"/><rect class="st-beam" x="6" y="12" width="42" height="2.2"/>`),
  dotted: svg(24, 22, `<line class="st-stem" x1="10" y1="2" x2="10" y2="18"/><circle class="st-dot" cx="14" cy="16" r="1.3"/>`),
};

const row = (icon: string, name: string, meaning: string) => `<tr><td class="hi">${icon}</td><td><b>${name}</b> — ${meaning}</td></tr>`;

function chartExample(): string {
  const bars: ChartBar[] = [
    { chords: ['G'], pattern: 'main', strokes: ['D', '-', 'D', 'U', '-', 'U', 'D', 'U'], kind: 'full', line: 0 },
    { chords: ['G'], pattern: 'main', strokes: ['D', '-', 'D', 'U', '-', 'U', 'D', 'U'], kind: 'repeat', line: 0 },
    { chords: ['C'], pattern: 'main', strokes: ['D', '-', 'D', 'U', '-', 'U', 'D', 'U'], kind: 'chord', line: 0 },
    { chords: ['D'], pattern: 'push', strokes: ['D', '-', '-', '-', 'D', 'U', 'D', 'U'], kind: 'full', line: 0 },
  ];
  return renderChart(bars, '4/4');
}

export const TAB_HELP_HTML = `
<h2>How to read tab</h2>
<p>Tab is a picture of the guitar neck lying flat. Each of the 6 lines is a string.
<b>The top line is the thinnest string (high e)</b>, the bottom line the thickest (low E) —
upside-down from how you look down at the guitar. Turn on <i>String names</i> in the toolbar to see the names.</p>
<pre class="help-tab">e ──────  ← high e (thinnest)
B ──────
G ──────
D ──────
A ──────
E ──────  ← low E (thickest)</pre>

<h3>Notes</h3>
<table class="tech">
${row(ICONS.fret, 'Fret number', 'hold that fret on that string and pick it. 3 = 3rd fret.')}
${row(ICONS.open, 'Open string', '0 = pick the string without fretting.')}
${row(ICONS.muted, 'Muted note', 'touch the string lightly (don\'t press) and pick: a dead "chk".')}
${row(ICONS.stacked, 'Stacked numbers', 'numbers in the same column are played together — a chord. Strum them all at once.')}
${row(ICONS.ghost, 'Ghost note', 'play it very quietly, or leave it out.')}
</table>
<p class="muted small">Read left to right, like text. Further right = later.</p>

<h3>Techniques</h3>
<table class="tech">
${row(ICONS.hammer, 'Hammer-on (H)', 'pick the first note, then slam a finger down on the second without picking again.')}
${row(ICONS.pull, 'Pull-off (P)', 'pick the first note, then flick that finger off the string so the second note sounds.')}
${row(ICONS.slideUp, 'Slide up', 'pick the first note and slide your finger up to the second, keeping pressure.')}
${row(ICONS.slideDown, 'Slide down', 'same, sliding down the neck.')}
${row(ICONS.bend, 'Bend', 'push the string sideways to raise the pitch. "full" = up a whole step (sounds like 2 frets higher), "½" = a half step.')}
${row(ICONS.release, 'Bend and release', 'bend up, then let the string back down to the normal note without picking.')}
${row(ICONS.vibrato, 'Vibrato', 'wobble the note with small, quick bends.')}
${row(ICONS.pm, 'Palm mute', 'rest the side of your picking hand on the strings right by the bridge, for a chunky muted sound. Keep muting until the line ends.')}
${row(ICONS.ring, 'Let ring', 'let the notes keep sounding into each other; don\'t lift your fingers.')}
</table>

<h3>Strumming</h3>
<table class="tech">
${row(ICONS.down, 'Down strum', 'strum down, from the thick strings towards the thin ones.')}
${row(ICONS.up, 'Up strum', 'strum up; usually just the top 3–4 thin strings.')}
${row(ICONS.chordName, 'Chord name', 'the chord you\'re holding from here on. The boxes at the bottom of the song show how to hold it.')}
</table>

<h3>Rhythm (the stems under the tab)</h3>
<table class="tech">
${row(ICONS.whole, 'No stem', 'hold for the whole bar.')}
${row(ICONS.half, 'Short stem', 'half note: 2 beats.')}
${row(ICONS.quarter, 'Stem', 'quarter note: 1 beat (count "1").')}
${row(ICONS.eighths, 'Two stems joined by a beam', 'eighth notes: half a beat each (count "1 &").')}
${row(ICONS.eighth, 'Stem with a flag', 'a single eighth note: half a beat.')}
${row(ICONS.sixteenths, 'Two beams', 'sixteenth notes: a quarter beat each (count "1 e & a").')}
${row(ICONS.dotted, 'Dot', 'makes the note half as long again (a dotted quarter = 1½ beats).')}
</table>

<h3>Bars and sections</h3>
<table class="tech">
${row(ICONS.bar, 'Bar line', 'the end of a measure (bar). The small number is the measure number.')}
${row(ICONS.repeat, 'Repeat signs', 'play the bars between them twice.')}
${row(ICONS.section, 'Section name', 'where the verse, chorus, etc. starts. A double bar line marks the change.')}
</table>

<h2 class="help-h2">How to read chord boxes</h2>
<div class="help-diagrams">${chordDiagram('G', lookupChord('G'))}${chordDiagram('C#m', lookupChord('C#m'))}</div>
<ul>
  <li><b>Vertical lines are strings</b>: thickest (low E) on the left, thinnest (high e) on the right.</li>
  <li><b>Horizontal lines are frets</b>. The thick line at the top is the nut (the end of the neck).</li>
  <li><b>Dots</b> = where to press. The number in the dot is the finger: 1 index, 2 middle, 3 ring, 4 pinky.</li>
  <li><b>○</b> above a string = play it open. <b>×</b> = don't play that string.</li>
  <li>A <b>long rounded bar</b> = a barre: lay one finger flat across all those strings.</li>
  <li><b>"4fr"</b> on the left (C#m above) = the top line is the 4th fret, not the nut: the shape is further up the neck.</li>
</ul>

<h2 class="help-h2">How to read the chord chart</h2>
<p>The <i>Chords</i> view writes each section bar by bar. <b>Each box is one bar.</b>
Play the strum pattern once per bar, counting along under the arrows.</p>
<div class="help-chart">${chartExample()}</div>
<ul>
  <li><b>↓ ↑</b> = strum down / up. A <b>gap</b> = a rest: keep your hand moving but miss the strings. <b>✕</b> = muted chuck.</li>
  <li><b>%</b> = play the previous bar again: same chord, same strum.</li>
  <li><b>% with a chord name</b> = same strum, but change to that chord.</li>
  <li>When the strum changes, it is written out again (bar 4 above).</li>
  <li>Two chord names in one bar = change halfway through the bar.</li>
</ul>

<p class="muted">Tip: hover over (or tap) anything in the tab or chart to see what it means.</p>
`;
