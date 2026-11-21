# Songbook

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
npm run validate songs/amazing-grace.gsong   # check one file (or no argument: all of songs/)
```

Songs in `songs/` are bundled automatically (in dev, adding/editing a file
reloads the page). Any other `.gsong` can be opened with **Open .gsong**,
**Open folder**, or by dragging it onto the page.

## Views

- **Tablature** — 6-line tab per section, wrapped at bar lines to fit the
  screen. Hover/tap any number or symbol for an explanation; toggle string
  names; **How to read tab** explains everything. Sections without tab show
  their chords.
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
songs/         sample songs (public domain)
tests/         vitest
```
