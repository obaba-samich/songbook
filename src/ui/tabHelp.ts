/** The "How to read tab" panel. */
export const TAB_HELP_HTML = `
<h2>How to read tab</h2>
<p>Tab is a picture of the guitar neck, lying flat. Each of the 6 lines is a string.</p>

<h3>The strings</h3>
<pre class="tab help-tab">e|---------  ← thinnest string (high e), nearest the floor
B|---------
G|---------
D|---------
A|---------
E|---------  ← thickest string (low E), nearest your face</pre>
<p><b>High e is on top, low E on the bottom</b> — upside-down from how you look down at the guitar.
Turn on <i>String names</i> in the toolbar to see the names on every line.</p>

<h3>The numbers</h3>
<ul>
  <li>A number is the <b>fret</b> to hold down on that string: <code>3</code> = 3rd fret.</li>
  <li><code>0</code> = play the string <b>open</b> (don't fret it).</li>
  <li><code>x</code> = <b>muted</b>: touch the string lightly so it just clicks.</li>
  <li>Read left to right. <b>Numbers stacked in the same column are played together</b> (a chord).</li>
  <li><code>|</code> is a bar line: the end of a measure.</li>
  <li>Dashes <code>-</code> are just the string with nothing to play; more dashes roughly means more time.</li>
</ul>
<pre class="tab help-tab">e|-----0-----|   ← open high e
B|---1---1---|   ← 1st fret on B
G|-2-------2-|
D|-----------|
A|0----------|   ← open A, played first
E|-----------|</pre>

<h3>Techniques</h3>
<table class="tech">
  <tr><td><code>2h4</code></td><td><b>Hammer-on</b>: pick fret 2, then slam a finger onto fret 4 without picking.</td></tr>
  <tr><td><code>4p2</code></td><td><b>Pull-off</b>: pick fret 4, flick that finger off so fret 2 sounds.</td></tr>
  <tr><td><code>5/7</code></td><td><b>Slide up</b> from 5 to 7, keeping pressure.</td></tr>
  <tr><td><code>7\\5</code></td><td><b>Slide down</b> from 7 to 5.</td></tr>
  <tr><td><code>7b9</code></td><td><b>Bend</b> fret 7 until it sounds like fret 9 (push the string sideways).</td></tr>
  <tr><td><code>7b9r7</code></td><td>Bend, then <b>release</b> back down to 7 without picking.</td></tr>
  <tr><td><code>5~~</code></td><td><b>Vibrato</b>: wobble the note with small, quick bends.</td></tr>
  <tr><td><code>PM---</code></td><td><b>Palm mute</b> (written above the tab): rest the side of your picking hand on the strings by the bridge. The dashes show how long.</td></tr>
  <tr><td><code>(3)</code></td><td><b>Ghost note</b>: very quiet, or optional.</td></tr>
</table>

<p class="muted">Tip: hover over (or tap) any number or symbol in the tab to see exactly what it means.</p>
`;
