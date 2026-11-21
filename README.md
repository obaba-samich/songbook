# Songbook

Repo: https://github.com/obaba-samich/songbook

A local guitar songbook that runs in the browser. Each song is one `.gsong` text
file (ChordPro-style) that holds everything: metadata, chord voicings, strum
patterns, sections with lyrics + chords, tab, song order, and optionally several
guitar parts. No accounts, no backend.

## Run it

```bash
npm install          # once
npm run dev          # opens http://localhost:5173 with live reload
npm run build        # → dist/index.html, a single file you can double-click (works from file://)
npm test             # unit tests
npm run validate songs/my-song.gsong   # check one file (no argument: all of songs/ and examples/)
```

Put your own `.gsong` files in `songs/`. That folder is git-ignored, so your
songs stay on your machine. They're bundled automatically (in dev,
adding or editing a file reloads the page). If `songs/` is empty the app shows
the public-domain examples from `examples/`. Any other `.gsong` can be opened
with **Open song file**, **Open folder**, or by dragging it onto the page.

### Guitar Pro files

Guitar Pro files (`.gp`, `.gp5`, `.gpx`, `.gp4`, `.gp3`) work too: put them in
`songs/` or open them the same way. They're drawn with
[alphaTab](https://alphatab.net) as real tab — rhythm stems under the numbers,
hammer-ons, slides, bends — and the part picker offers **Lyrics + guitars** (the vocal line with
its lyrics over the guitar tab; the default when the file has lyrics), **All
guitars (stacked)**, or a single guitar or bass part. The tab only shows
guitar-related parts (guitars and bass as tab, the vocal line as sheet music);
the other instruments are still heard. **▶** plays the song with a cursor that
follows the notes (click a note to start there; the slider sets the speed).
Playback needs `npm run dev`; the single-file build draws the tab and ▶
auto-scrolls instead.

A Guitar Pro file and a `.gsong` with the same name (`songs/x.gp` +
`songs/x.gsong`) become one song: Tab shows the Guitar Pro tab, and Chords and
Lyrics come from the `.gsong`. Without a matching `.gsong`, a Guitar Pro song
only has the Tab view.

## Views

- **Tablature** — the whole song as one continuous tab score, like a printed
  tab book: string lines, fret numbers on the strings, measure numbers,
  section names over the bars, chord names, P.M./let ring, slurs, slides,
  bends, vibrato, pick strokes (⊓ down, V up), rhythm stems and beams, and
  lyrics under the notes. Sections without written tab are generated from
  their chords + strum pattern using the selected guitar's chord shapes.
  Hover/tap any number or symbol for an explanation; toggle string names;
  **How to read tab** explains everything.
- **Chords** — each section once, its progression and strum pattern
  (↓ ↑, rests as gaps, ‖: :‖ ×4), then chord diagrams and the song order.
- **Lyrics + Chords** — chords above the exact syllable, strum at the start of
  each section, diagrams at the bottom.

Toolbar: guitar part (when a song has several), transpose, capo (keeps the
pitch, changes the shapes), text size, auto-scroll (space bar toggles), light/
dark, print. Print uses a dedicated black-on-white stylesheet and prints the
current view. Page numbers come from the stylesheet in Chrome/Chromium; in
Firefox, enable "Headers and footers" in the print dialog instead.

## Writing songs

The format is specified in [INSTRUCTIONS.md](INSTRUCTIONS.md). That file is also
meant to be pasted into a chat with Claude so it generates valid files —
it includes a complete example and a checklist. Run `npm run validate` on what
comes back.

## Layout

```
src/core/      parser, chord library, transpose/capo maths, tab tokenizer (no DOM)
src/views/     tab / chords / lyrics views, SVG chord diagrams, strum drawing
src/ui/        app shell, tooltips, tab help
src/styles/    screen and print CSS
scripts/       validate.ts (CLI)
songs/         YOUR songs — git-ignored, never committed
examples/      public-domain example songs (shown when songs/ is empty; used by the tests)
tests/         vitest
```
