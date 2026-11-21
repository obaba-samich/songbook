# Writing `.gsong` files — instructions for Claude

Paste this whole file into a chat with Claude, then ask for a song, e.g.
"Make me a .gsong for *Wildwood Flower*."

---

You are generating a song file for a local guitar songbook app. The app parses
the file strictly and reports errors by line number, so the file must follow the
format below exactly. Output **only** the file contents inside one fenced code
block, followed by a short note listing anything you were unsure about.

## 1. The format at a glance

- Plain UTF-8 text, one song per file, extension `.gsong`.
- Based on ChordPro: directives in `{curly braces}`, chords inline in `[square brackets]`.
- One directive per line. A directive line contains nothing but the directive.
- A line starting with `#` is a file comment. It is ignored entirely (not displayed).
- Blank lines are allowed anywhere. Inside a section they show as a gap between lyric lines.
- Directive names are lowercase.
- Don't put anything after a directive on the same line (no trailing `# notes`).

The file has two parts:

1. **Header** — everything before the first `{section:}`: song info, chord
   definitions, strum patterns, comments.
2. **Sections** — each `{section: Name}` starts a section that runs until the
   next `{section:}` or the end of the file. It holds lyrics with inline
   chords, optional strum references, and optional tab blocks.

`{order:}` can go anywhere (usually the very end) and says in which order the
sections are played. A section is written **once** and can appear in the order
many times.

## 2. Header directives

| Directive | Required | Format | Example |
|---|---|---|---|
| `{title: …}` | yes | any text | `{title: Amazing Grace}` |
| `{artist: …}` | yes | any text (`Traditional` for folk songs) | `{artist: John Newton}` |
| `{key: …}` | no | the key the song **sounds** in: root `A`–`G`, optional `#`/`b`, optional `m` | `{key: A}`, `{key: F#m}` |
| `{capo: …}` | no (default 0) | whole number 0–12 | `{capo: 2}` |
| `{tempo: …}` | no | BPM, whole number 20–400 | `{tempo: 92}` |
| `{time: …}` | no (default 4/4) | `beats/note` | `{time: 3/4}`, `{time: 6/8}` |
| `{tuning: …}` | no (default standard) | a name, or 6 note names low → high | `{tuning: Drop D}`, `{tuning: D A D G B E}` |

Header directives (`title`, `artist`, `key`, `capo`, `tempo`, `time`,
`tuning`) **must come before the first `{section:}`** and may each appear only
once.

Tuning names understood: `standard` (E A D G B E), `Drop D` (D A D G B E),
`DADGAD`, `Open G` (D G D G B D), `Open D` (D A D F# A D),
`Half step down` (Eb Ab Db Gb Bb Eb). Anything else must be written as 6 note
names, lowest string first.

### Capo and chord names

**Chords in the file are the shapes the player fingers**, relative to the capo.
`{key:}` is the key the song *sounds* in. Example: a song in A played with
G shapes is written `{key: A}`, `{capo: 2}`, and uses `[G]`, `[C]`, `[D]` in the
lyrics. The app shows "Key A · Capo 2 · G shapes".

## 3. Comments shown to the reader

```
{comment: Let the last chord ring}
```
`{c: …}` is a short alias. A comment in the header appears under the song title;
a comment inside a section appears in that spot in the section.

## 4. Chords

### Inline chords

Put the chord in brackets **immediately before the syllable where the change
happens**:

```
[G]Amazing [G7]grace, how [C]sweet the [G]sound
```

- Chord names: root `A`–`G`, optional `#` or `b`, optional quality, optional
  slash bass. Examples: `G`, `Am`, `F#m`, `Bb`, `E7`, `Cmaj7`, `Am7`, `Dsus4`,
  `Asus2`, `Cadd9`, `G/B`, `D/F#`, `Bdim`, `Caug`, `E5`, `A6`, `Dm6`, `E9`.
- `[N.C.]` means "no chord" (stop playing).
- A chord can go mid-word: `A[D]mazing` puts D above "mazing".
- **Chord-only lines** (intros, solos, turnarounds) are just chords separated by
  spaces: `[G] [C] [G] [D]`. Bar lines are fine as text: `| [G] | [C] [D] |`.
- Brackets must be closed on the same line.

### The built-in chord library

You do **not** need to define these. They have diagrams already:

- **Open chords:** A, Am, A7, Am7, Amaj7, Asus2, Asus4, A5, B7, Bm (barre 2), C,
  C7, Cmaj7, Cadd9, D, Dm, D7, Dm7, Dmaj7, Dsus2, Dsus4, D5, E, Em, E7, Em7, Esus4,
  E5, F (barre 1), Fmaj7, G, G7, G5, Gmaj7.
- **Common slash chords:** G/B, C/G, C/E, D/F#, Am/G, Am/E, F/C, G/F#, D/A, Em/D.
- **Any root (A–G with # or b) with these qualities** is generated as a barre
  shape: major, `m`, `7`, `m7`, `maj7`, `sus2`, `sus4`, `5`, `6`, `m6`, `9`,
  `dim`, `dim7`, `aug`, `m7b5`. Example: `C#m`, `Ab7`, `F#m7`, `Bbmaj7`.
- Aliases are understood: `min`/`-` = `m`, `M7`/`maj7`, `+` = `aug`, `°` = `dim`,
  `ø` = `m7b5`.
- Any other slash chord uses its base chord's shape, plus a note to play the bass.

Anything else (e.g. `Cadd11`, `G6/9`, `Esus4add9`, an unusual voicing you want
to show) **must be defined** with `{define:}`.

### Custom voicings: `{define:}`

```
{define: Dsus4 x x 0 2 3 3}
{define: G 3 2 0 0 3 3 fingers 2 1 0 0 3 4}
{define: Bm7 x 2 4 2 3 2 fingers 0 1 3 1 2 1}
```

- Name, then **exactly 6 fret values, lowest string first** (low E → high e in
  standard tuning).
- `x` = muted string, `0` = open string, `1`–`24` = fret number (actual fret, not
  relative). The app works out the diagram position and barres itself.
- Optional: the word `fingers` followed by 6 finger numbers (`0`–`4`, or `x`/`0`
  for strings that aren't fretted). Same finger on several strings at the same
  fret = drawn as a barre.
- A `{define:}` overrides the built-in shape of the same name.
- Defines go in the header. Each name may be defined once.

## 5. Strum patterns

Define named patterns in the header:

```
{strum: main = D - D U - U D U}
{strum: waltz = D - D U D U}
{strum: chuck = D X U X}
```

- Strokes, separated by spaces: `D` = down, `U` = up, `-` = rest (skip that
  beat, hand keeps moving), `X` = muted chuck (strum with the fretting hand
  lightly damping the strings).
- Use one stroke per subdivision: 8 strokes for eighth notes in 4/4, 6 strokes
  for eighth notes in 3/4 or 6/8, 16 for sixteenths in 4/4. The app writes beat
  counts under the arrows (`1 & 2 & …`) when the stroke count fits the time
  signature.
- Pattern names are single words (letters, digits, `-`, `_`), unique per song.

Inside a section, say which pattern to play and how many times:

```
{use: main x4}
{use: intro x2, main x6}
{use: waltz}
```

- `x4` = four times (repeat marker shown as ‖: … :‖ ×4). No count = once.
- `{use:}` must be inside a section and refer to a defined pattern.

## 6. Tab blocks

Tab goes inside a section between `{tab}` and `{end_tab}`:

```
{tab}
e|-----0-----|-----------|
B|---1---1---|---1-------|
G|-2-------2-|-2---2-----|
D|-----------|-----------|
A|0----------|----0h2----|
E|-----------|-----------|
{end_tab}
```

Rules:

- **6 string lines per system, high string on top, low string on the bottom.**
- Each line may start with the string's name (`e B G D A E` in standard, or the
  names for the current tuning, e.g. `e B G D A D` for Drop D) directly before
  the first `|`. Either label every line or none.
- **All 6 lines of a system must be exactly the same length**, so the columns
  line up. Pad with `-`.
- Numbers in the same column on different strings are played together.
- `|` is a bar line (end of a measure). Put bar lines in the same column on all
  6 lines.
- For a long riff, write several systems, separated by **one blank line**. Each
  system is 6 lines.
- Allowed characters in string lines: digits, `-`, `|`, `:` (for `|:` `:|`
  repeats), `h`, `p`, `/`, `\`, `b`, `r`, `~`, `x`, `(`, `)`, `.`, `*`, and spaces.

Techniques:

| Symbol | Meaning | Example |
|---|---|---|
| `0` | open string | `--0--` |
| `x` | muted / dead note | `--x--` |
| `h` | hammer-on | `2h4` |
| `p` | pull-off | `4p2` |
| `/` | slide up | `5/7` |
| `\` | slide down | `7\5` |
| `b` | bend (target fret after it) | `7b9` |
| `r` | release a bend | `7b9r7` |
| `~` | vibrato | `5~~` |
| `(n)` | ghost / optional note | `(3)` |

**Annotation lines** go directly above the 6 string lines of a system. They
must start with `PM` or a space, and line up with the columns below (count the
string label too, so text over the first note starts in the column after `|`).
The app draws them above the staff:

- **Chord names** (`G5`, `Am`, `Csus2`…) sit above the note where the chord
  starts. Put one over the first note of each measure where the chord changes.
- `PM----` = palm mute, `let ring----` = let ring; the dashes show how long it
  lasts and are drawn as a dashed line.
- Any other word is shown as small text.

Use one annotation line for chord names and another for PM / let ring:

```
{tab}
  G5           Csus2        D5
  let ring---------------------------------
e|------------|------------|------------|
B|---3--------|---3--------|---3--------|
G|-0---0---0--|-0---0---0--|-2---2---2--|
D|0-----------|0-----------|0-----------|
A|------------|3-----------|------------|
E|3-----------|------------|------------|
{end_tab}
```

```
{tab}
  PM----------|
e|------------|
B|------------|
G|------------|
D|------------|
A|------------|
E|0-0-0-0-0-0-|
{end_tab}
```

A section can have lyrics, tab, or both. **A section without tab is still
drawn as tab:** the app turns its chords and strum pattern into stacked notes
(using the guitar's chord shapes), writes the rhythm under the staff and puts
the lyrics under the notes. For that to come out right:

- Give each section a `{use:}` whose repeat count is the **number of bars**
  (one pattern = one bar), e.g. a 4-line verse of 4 bars each → `{use: main x16}`.
- Treat **each lyric line as one phrase**: the bars are shared equally between
  the lines, and each chord on a line gets whole bars when there are enough
  (two chords on a 4-bar line → 2 bars each). Extra chords on a line split
  its bars on the beat.
- Put the chord exactly where it changes (`A[G]mazing`) — the lyrics are
  spread over the strums of that chord.

Only write `{tab}` for parts that aren't plain strummed chords: riffs,
melodies, arpeggios, solos.

## 7. Sections and song order

```
{section: Verse 1}
{section: Chorus}
{section: Bridge}
```

- Names are free text, unique per song (case doesn't matter: `chorus` = `Chorus`).
- Write a repeated section (usually the chorus) **once** and list it in the
  order several times. If verses have different lyrics, they are different
  sections (`Verse 1`, `Verse 2`).

```
{order: Intro, Verse 1, Chorus, Verse 2, Chorus, Bridge, Chorus, Outro}
```

- Comma-separated section names. Every name must match a `{section:}`.
- Only one `{order:}` per file. If it is missing, sections play in the order they
  are written.

## 8. Multiple guitar parts (optional)

When a song has more than one guitar (e.g. a strummed rhythm part and a picked
or lead part), declare each one in the header with `{guitar:}`. The app shows a
guitar picker; the Chords and Lyrics views show the chords and strum for the
chosen guitar, and the Tablature view shows that guitar's tab.

```
# song-wide default capo and a voicing every guitar inherits
{capo: 2}
{define: G 3 2 0 0 3 3}

# Rhythm inherits capo 2
{guitar: Rhythm}

# Lead plays without a capo, in Drop D, with its own A voicing
{guitar: Lead}
{capo: 0}
{tuning: Drop D}
{define: A x 0 2 2 2 x}
```

- Everything after a `{guitar:}` line and before the next `{guitar:}` (or the
  first section) belongs to that guitar. Only `{capo:}`, `{tuning:}` and
  `{define:}` can be set per guitar; `title`, `artist`, `key`, `tempo`, `time`
  must come **before the first `{guitar:}`**.
- The first guitar declared is the default.
- **Chord names in the lyrics are always written as shapes for the song-wide
  `{capo:}`.** For a guitar with a different capo the app re-works the chord
  names and diagrams so they match what that guitar actually fingers (song in A,
  default capo 2 writes `[G]`; the "Lead" guitar at capo 0 sees `A`). So a
  guitar's `{define:}` must use the name *that guitar* sees (`A` above, not `G`),
  and its voicings should match the shapes its tab plays.
- Inside a section, `{guitar: Lead}` switches which guitar the following
  `{use:}` and `{tab}` lines belong to. Each new section starts on the first
  (default) guitar again. `{tab: Lead}` is a shortcut for one tab block.

```
{section: Verse 1}
# Rhythm (the default guitar) strums
{use: main x4}
# Lead plays a riff
# (Lead is in Drop D, so its lowest tab line is labelled D)
{tab: Lead}
e|-----0-----|
B|---1---1---|
G|-2-------2-|
D|-----------|
A|0----------|
D|-----------|
{end_tab}
[G]Lyrics with [C]chords
```

A guitar with no tab in a section shows that section's chords (in its own
shapes) instead.

## 9. Tab from memory may be approximate

You are often writing tab and voicings from memory. That is fine, but **say so**:
if any tab, riff, voicing, or chord placement is a guess or simplified, put a
comment at the very top of the header:

```
{comment: Tab is approximate (written from memory) — check the intro riff by ear.}
```

Be specific about which parts are uncertain. Never present a guessed riff as
exact. For songs still under copyright, do not reproduce the full lyrics; write
the chord chart with only the first line of each section or a placeholder like
`[G]Verse 1 lyrics… [C]` and say so in a comment.

## 10. Complete example

```
# Example song showing every feature. Lines starting with # are ignored.
{title: Lantern on the Hill}
{artist: Example Writer}
{key: A}
{capo: 2}
{tempo: 96}
{time: 4/4}
{tuning: standard}
{comment: Tab is approximate — the intro riff is simplified.}

{define: Cadd9 x 3 2 0 3 3 fingers 0 2 1 0 3 4}
{define: Dsus4 x x 0 2 3 3}

{strum: main = D - D U - U D U}
{strum: push = D - D - D U D U}

{section: Intro}
{use: main x2}
[G] [Cadd9] [G] [D]
{tab}
e|-----3-----3---|-----3-------3-|
B|---0---0-----0-|---3---3-------|
G|-0-------0-----|-0-------0h2---|
D|---------------|---------------|
A|---------------|-3-------------|
E|-3-------------|---------------|
{end_tab}

{section: Verse 1}
{use: main x4}
[G]There's a lantern [Cadd9]on the hill
[G]Burning when the [D]night is still

{section: Verse 2}
{use: main x4}
[G]Every stranger [Cadd9]passing through
[G]Sees it shining [D]like I do

{section: Chorus}
{use: push x4}
{comment: Hit the first chord hard}
[Cadd9]Carry me [G]home
[Em]Don't leave me a[Dsus4]lone [D]

{section: Solo}
{tab}
  PM------|
e|--------|-----3/5-|
B|--------|-3-------|
G|--------|---------|
D|--------|---------|
A|--------|---------|
E|3-3-3-3-|---------|

e|-5b7r5---|-3~~----|
B|-------3-|--------|
G|---------|--------|
D|---------|--------|
A|---------|--------|
E|---------|--------|
{end_tab}

{section: Outro}
{use: main x1}
[G] [Cadd9] [G]
{comment: Let the last G ring}

{order: Intro, Verse 1, Chorus, Verse 2, Chorus, Solo, Chorus, Outro}
```

Note how the solo's first system has a palm-mute annotation line above the 6
string lines, and the two systems are separated by one blank line.

## 11. Checklist — run this before giving me the file

Go through each item and fix the file if any fails:

1. `{title:}` and `{artist:}` are present, and all header directives come
   before the first `{section:}`.
2. **Every chord used** in `[brackets]` is either in the built-in library
   (section 4) or defined with `{define:}` in the header. Each define has
   exactly 6 fret values (lowest string first) and an optional `fingers` list of
   6.
3. Every `{use:}` is inside a section and names a pattern defined with
   `{strum:}`. Strum patterns contain only `D`, `U`, `-`, `X`, one bar per
   pattern, and the `xN` count equals the number of bars in the section.
4. **Every section in `{order:}` exists** as a `{section:}` (spelling matches),
   and there is only one `{order:}`.
5. No two sections have the same name.
6. **Every tab system has exactly 6 string lines**, high string on top, and all
   6 lines are the **same length**, with bar lines in the same columns. Labels,
   if used, match the tuning and are on every line or none.
7. Every `{tab}` has a matching `{end_tab}`, inside a section. Only blank
   lines and annotation lines (starting with `PM` or a space) are mixed in.
   Chord names over the tab sit above the first note of their measure.
8. Every `[` has a closing `]` on the same line.
9. If anything is from memory or simplified, there's a `{comment:}` at the top
   saying so and which part.
10. The file uses only directives from this document: `title`, `artist`, `key`,
    `capo`, `tempo`, `time`, `tuning`, `comment`/`c`, `define`, `strum`,
    `section`, `use`, `tab`, `end_tab`, `order`, `guitar`.
11. If there are several guitars: each is declared in the header, every
    `{guitar: X}` / `{tab: X}` inside a section names a declared guitar, each
    guitar's `{define:}` uses the chord name that guitar sees at its own capo,
    and its voicings match the shapes its tab actually plays.

The user can check the result with `npm run validate songs/<file>.gsong`.
