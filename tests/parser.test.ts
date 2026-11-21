import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { parseSong } from '../src/core/parser';

const HDR = '{title: Test}\n{artist: Tester}\n';

/** Parse and return only errors as "line: message". */
function errors(src: string) {
  return parseSong(src).diagnostics.filter((d) => d.severity === 'error');
}
function warnings(src: string) {
  return parseSong(src).diagnostics.filter((d) => d.severity === 'warning');
}
/** Expect exactly one error on `line` whose message contains `text`. */
function expectError(src: string, line: number, text: string | RegExp) {
  const errs = errors(src);
  const hit = errs.find((e) => e.line === line && (typeof text === 'string' ? e.message.includes(text) : text.test(e.message)));
  expect(hit, `expected error on line ${line} matching ${text}; got ${JSON.stringify(errs)}`).toBeTruthy();
}

const TAB6 = ['e|--0--|', 'B|--1--|', 'G|--0--|', 'D|--2--|', 'A|--3--|', 'E|-----|'];

describe('sample songs', () => {
  const dir = new URL('../songs/', import.meta.url).pathname;
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.gsong'))) {
    it(`${f} parses with no errors or warnings`, () => {
      const r = parseSong(readFileSync(dir + f, 'utf8'));
      expect(r.diagnostics).toEqual([]);
      expect(r.song.order.length).toBeGreaterThan(0);
    });
  }

  it('together the samples use every feature', () => {
    const songs = readdirSync(dir).filter((x) => x.endsWith('.gsong')).map((f) => parseSong(readFileSync(dir + f, 'utf8')).song);
    const bodies = songs.flatMap((s) => [...s.sections.values()].flatMap((x) => x.body));
    const tabText = bodies.flatMap((b) => (b.kind === 'tab' ? b.tab.systems.flatMap((s) => [...s.strings, ...s.annotations]) : [])).join('\n');
    expect(songs.some((s) => s.defines.size > 0)).toBe(true); // custom voicings
    expect(songs.some((s) => s.strums.size >= 2)).toBe(true); // multiple strum patterns
    expect(songs.some((s) => s.meta.capo > 0)).toBe(true); // capo
    expect(songs.some((s) => s.meta.tuning.name !== 'Standard')).toBe(true); // alternate tuning
    expect(songs.some((s) => s.guitars.length > 1)).toBe(true); // multiple guitars
    expect(songs.some((s) => new Set(s.order).size < s.order.length)).toBe(true); // repeated sections
    for (const t of ['h', 'p', '/', '\\', 'b', 'r', '~', 'PM']) expect(tabText, `technique ${t}`).toContain(t);
  });

  it('the complete example in INSTRUCTIONS.md is valid', () => {
    const md = readFileSync(new URL('../INSTRUCTIONS.md', import.meta.url), 'utf8');
    const example = md.split('## 9. Complete example')[1].split('```')[1].replace(/^\n/, '');
    expect(parseSong(example).diagnostics).toEqual([]);
  });
});

describe('valid files', () => {
  it('reads header metadata', () => {
    const { song, diagnostics } = parseSong(`${HDR}{key: F#m}\n{capo: 3}\n{tempo: 120}\n{time: 6/8}\n{tuning: Drop D}\n{section: A}\n[F#m]la`);
    expect(diagnostics).toEqual([]);
    expect(song.meta).toMatchObject({ title: 'Test', artist: 'Tester', key: 'F#m', capo: 3, tempo: 120, time: '6/8' });
    expect(song.meta.tuning.notes).toEqual(['D', 'A', 'D', 'G', 'B', 'E']);
  });

  it('defaults to standard tuning, 4/4, capo 0', () => {
    const { song } = parseSong(`${HDR}{section: A}\nla`);
    expect(song.meta.tuning.name).toBe('Standard');
    expect(song.meta.time).toBe('4/4');
    expect(song.meta.capo).toBe(0);
  });

  it('accepts a tuning written as six notes', () => {
    const { song, diagnostics } = parseSong(`${HDR}{tuning: C G C F A D}\n{section: A}\nla`);
    expect(diagnostics).toEqual([]);
    expect(song.meta.tuning.notes).toEqual(['C', 'G', 'C', 'F', 'A', 'D']);
  });

  it('splits lyrics into chord segments, including mid-word chords', () => {
    const { song } = parseSong(`${HDR}{section: V}\nA[G]mazing [C]grace`);
    const line = song.sections.get('v')!.body[0];
    expect(line).toMatchObject({ kind: 'lyric', segments: [{ chord: null, text: 'A' }, { chord: 'G', text: 'mazing ' }, { chord: 'C', text: 'grace' }] });
  });

  it('parses chord-only lines and N.C.', () => {
    const { song, diagnostics } = parseSong(`${HDR}{section: I}\n[G] [C] [N.C.]`);
    expect(diagnostics).toEqual([]);
    const segs = (song.sections.get('i')!.body[0] as { segments: { chord: string | null }[] }).segments;
    expect(segs.map((s) => s.chord)).toEqual(['G', 'C', 'N.C.']);
  });

  it('parses defines with fingers and the ChordPro base-fret form', () => {
    const { song, diagnostics } = parseSong(`${HDR}{define: Dsus4 x x 0 2 3 3}\n{define: Bm7 x 2 4 2 3 2 fingers 0 1 3 1 2 1}\n{define: Hi base-fret 5 frets 1 3 3 2 1 1}\n{section: A}\nla`);
    expect(diagnostics.filter((d) => !d.message.includes('Hi'))).toEqual([]);
    expect(song.defines.get('Dsus4')!.frets).toEqual([null, null, 0, 2, 3, 3]);
    expect(song.defines.get('Bm7')!.fingers).toEqual([0, 1, 3, 1, 2, 1]);
  });

  it('converts base-fret defines to absolute frets', () => {
    const { song, diagnostics } = parseSong(`${HDR}{define: A base-fret 5 frets 1 3 3 2 1 1}\n{section: A}\nla`);
    expect(diagnostics).toEqual([]);
    expect(song.defines.get('A')!.frets).toEqual([5, 7, 7, 6, 5, 5]);
  });

  it('parses strum patterns, compact form, and {use} with repeats', () => {
    const { song, diagnostics } = parseSong(`${HDR}{strum: main = D - D U - U D U}\n{strum: c = DUDX}\n{section: V}\n{use: main x4, c}\nla`);
    expect(diagnostics).toEqual([]);
    expect(song.strums.get('main')!.strokes).toEqual(['D', '-', 'D', 'U', '-', 'U', 'D', 'U']);
    expect(song.strums.get('c')!.strokes).toEqual(['D', 'U', 'D', 'X']);
    const use = song.sections.get('v')!.body[0];
    expect(use).toMatchObject({ kind: 'strum', refs: [{ name: 'main', repeat: 4 }, { name: 'c', repeat: 1 }] });
  });

  it('parses tab with labels, annotations and multiple systems', () => {
    const src = `${HDR}{section: S}\n{tab}\n  PM--|\n${TAB6.join('\n')}\n\n${TAB6.join('\n')}\n{end_tab}`;
    const { song, diagnostics } = parseSong(src);
    expect(diagnostics).toEqual([]);
    const tab = song.sections.get('s')!.body[0];
    if (tab.kind !== 'tab') throw new Error('expected tab');
    expect(tab.tab.systems).toHaveLength(2);
    expect(tab.tab.systems[0].strings[0]).toBe('|--0--|');
    expect(tab.tab.systems[0].annotations).toEqual([' PM--|']);
    expect(tab.tab.systems[0].labelled).toBe(true);
  });

  it('accepts unlabelled tab', () => {
    const src = `${HDR}{section: S}\n{tab}\n${TAB6.map((l) => l.slice(1)).join('\n')}\n{end_tab}`;
    expect(errors(src)).toEqual([]);
  });

  it('checks tab labels against the tuning (Drop D)', () => {
    const lines = [...TAB6.slice(0, 5), 'D|-----|'];
    expect(errors(`{title: T}\n{artist: A}\n{tuning: Drop D}\n{section: S}\n{tab}\n${lines.join('\n')}\n{end_tab}`)).toEqual([]);
  });

  it('uses {order} with repeated sections, case-insensitively', () => {
    const { song, diagnostics } = parseSong(`${HDR}{section: Verse}\nla\n{section: Chorus}\nla\n{order: verse, CHORUS, Verse, chorus}`);
    expect(diagnostics).toEqual([]);
    expect(song.order).toEqual(['Verse', 'Chorus', 'Verse', 'Chorus']);
  });

  it('defaults the order to file order', () => {
    expect(parseSong(`${HDR}{section: B}\nx\n{section: A}\ny`).song.order).toEqual(['B', 'A']);
  });

  it('ignores # comment lines and keeps {comment}s', () => {
    const { song, diagnostics } = parseSong(`# file note\n${HDR}{comment: approx}\n{section: A}\n{c: softly}\nla`);
    expect(diagnostics).toEqual([]);
    expect(song.comments).toEqual(['approx']);
    expect(song.sections.get('a')!.body[0]).toMatchObject({ kind: 'comment', text: 'softly' });
  });

  it('handles CRLF line endings and a BOM', () => {
    expect(errors('﻿{title: T}\r\n{artist: A}\r\n{section: S}\r\n[G]la\r\n')).toEqual([]);
  });

  it('warns about sections that are never played', () => {
    const w = warnings(`${HDR}{section: A}\nx\n{section: B}\ny\n{order: A}`);
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ line: 5 });
    expect(w[0].message).toContain('never played');
  });
});

describe('multiple guitars', () => {
  const SRC = `${HDR}{key: A}\n{capo: 2}\n{define: G 3 2 0 0 3 3}\n{strum: s = D U}\n{guitar: Rhythm}\n{guitar: Lead}\n{capo: 0}\n{define: A x 0 2 2 2 x}\n{section: V}\n{use: s}\n{tab: Lead}\n${TAB6.join('\n')}\n{end_tab}\n{guitar: Lead}\n{use: s x2}\n[G]la`;

  it('declares guitars with their own capo and defines', () => {
    const { song, diagnostics } = parseSong(SRC);
    expect(diagnostics).toEqual([]);
    expect(song.guitars.map((g) => [g.name, g.capo])).toEqual([['Rhythm', 2], ['Lead', 0]]);
    expect(song.guitars[0].defines.has('G')).toBe(true); // inherits song-wide defines
    expect(song.guitars[1].defines.get('A')!.frets).toEqual([null, 0, 2, 2, 2, null]);
    expect(song.guitars[0].defines.has('A')).toBe(false);
  });

  it('assigns tab and strum lines to guitars', () => {
    const body = parseSong(SRC).song.sections.get('v')!.body;
    expect(body.map((b) => ('guitar' in b ? `${b.kind}:${b.guitar}` : b.kind))).toEqual(['strum:rhythm', 'tab:lead', 'strum:lead', 'lyric']);
  });

  it('creates one default guitar when none are declared', () => {
    const { song } = parseSong(`${HDR}{capo: 3}\n{section: A}\nla`);
    expect(song.guitars).toHaveLength(1);
    expect(song.guitars[0]).toMatchObject({ name: 'Guitar', capo: 3 });
  });

  it('checks tab against each guitar\'s own tuning', () => {
    const lines = [...TAB6.slice(0, 5), 'D|-----|'];
    const src = `${HDR}{guitar: One}\n{guitar: Two}\n{tuning: Drop D}\n{section: S}\n{tab: Two}\n${lines.join('\n')}\n{end_tab}\n{tab: One}\n${lines.join('\n')}\n{end_tab}`;
    const errs = errors(src);
    expect(errs).toHaveLength(1);
    expect(errs[0].message).toContain('labelled "D"');
  });

  it('errors on an unknown guitar in a section', () => expectError(`${HDR}{guitar: Lead}\n{guitar: Rhythm}\n{section: S}\n{guitar: Leed}`, 6, 'did you mean "Lead"'));
  it('errors on a duplicate guitar', () => expectError(`${HDR}{guitar: Lead}\n{guitar: lead}\n{section: S}\nx`, 4, 'declared twice'));
  it('errors on a song-wide directive inside a guitar block', () => expectError(`${HDR.replace('{artist: Tester}\n', '')}{guitar: Lead}\n{artist: X}\n{section: S}\nx`, 3, 'song-wide'));
  it('errors when a chord has no shape at a guitar\'s capo', () =>
    expectError(`${HDR}{define: Fadd11 x 3 3 2 1 0}\n{guitar: A}\n{guitar: B}\n{capo: 2}\n{section: S}\n[Fadd11]la`, 8, /Fadd11.*becomes.*guitar "B"/));
  it('lets a moveable custom voicing follow a capo change', () =>
    expect(errors(`${HDR}{define: Fadd11 1 3 3 2 1 1}\n{guitar: A}\n{guitar: B}\n{capo: 2}\n{section: S}\n[Fadd11]la`)).toEqual([]));
});

describe('error cases (line number + message)', () => {
  it('missing title', () => expectError('{artist: A}\n{section: S}\nx', 1, 'missing {title'));
  it('missing artist', () => expectError('{title: A}\n{section: S}\nx', 1, 'missing {artist'));
  it('no sections', () => expectError(HDR, 3, 'no sections'));
  it('unknown directive with suggestion', () => expectError(`${HDR}{tittle: X}\n{section: S}\nx`, 3, 'did you mean "title"'));
  it('directive missing closing brace', () => expectError(`${HDR}{capo: 2\n{section: S}\nx`, 3, 'closing "}"'));
  it('unreadable directive', () => expectError(`${HDR}{12: x}\n{section: S}\nx`, 3, "can't read this directive"));
  it('header directive after a section', () => expectError(`${HDR}{section: S}\n{capo: 2}`, 4, 'must come before the first {section:}'));
  it('define after a section', () => expectError(`${HDR}{section: S}\n{define: Amaj9 x x 0 2 3 3}`, 4, 'must come before'));
  it('duplicate header directive', () => expectError(`${HDR}{title: Again}\n{section: S}\nx`, 3, 'appears twice (first on line 1)'));
  it('empty header value', () => expectError(`${HDR}{key:}\n{section: S}\nx`, 3, 'needs a value'));
  it('invalid key', () => expectError(`${HDR}{key: H}\n{section: S}\nx`, 3, 'key "H"'));
  it('invalid capo', () => expectError(`${HDR}{capo: 13}\n{section: S}\nx`, 3, 'capo "13"'));
  it('non-numeric capo', () => expectError(`${HDR}{capo: two}\n{section: S}\nx`, 3, 'capo "two"'));
  it('invalid tempo', () => expectError(`${HDR}{tempo: 5}\n{section: S}\nx`, 3, 'tempo "5"'));
  it('invalid time signature', () => expectError(`${HDR}{time: 4/5}\n{section: S}\nx`, 3, 'time signature "4/5"'));
  it('unknown tuning', () => expectError(`${HDR}{tuning: weird}\n{section: S}\nx`, 3, 'tuning "weird"'));
  it('define with wrong fret count', () => expectError(`${HDR}{define: Amaj9 x 0 2}\n{section: S}\nx`, 3, 'has 3 fret values but needs exactly 6'));
  it('define with a bad fret value', () => expectError(`${HDR}{define: Amaj9 x 0 2 2 q 0}\n{section: S}\nx`, 3, 'fret value "q"'));
  it('define with too few fingers', () => expectError(`${HDR}{define: Amaj9 x 0 2 2 2 0 fingers 1 2}\n{section: S}\nx`, 3, '"fingers"'));
  it('define with a bad finger', () => expectError(`${HDR}{define: Amaj9 x 0 2 2 2 0 fingers 0 0 1 2 7 0}\n{section: S}\nx`, 3, 'finger "7"'));
  it('define with a bad chord name', () => expectError(`${HDR}{define: Hm x 0 2 2 2 0}\n{section: S}\nx`, 3, 'chord name "Hm"'));
  it('define with nothing after the name', () => expectError(`${HDR}{define: Am}\n{section: S}\nx`, 3, 'incomplete'));
  it('duplicate define', () => expectError(`${HDR}{define: Amaj9 x 0 2 2 2 0}\n{define: Amaj9 x 0 2 2 2 0}\n{section: S}\nx`, 4, 'defined twice'));
  it('strum without "="', () => expectError(`${HDR}{strum: main D U}\n{section: S}\nx`, 3, 'name = D'));
  it('strum with a bad stroke', () => expectError(`${HDR}{strum: m = D Q}\n{section: S}\nx`, 3, 'stroke "Q"'));
  it('strum with no strokes', () => expectError(`${HDR}{strum: m =}\n{section: S}\nx`, 3, 'no strokes'));
  it('duplicate strum', () => expectError(`${HDR}{strum: m = D}\n{strum: m = U}\n{section: S}\nx`, 4, 'defined twice'));
  it('{use} outside a section', () => expectError(`${HDR}{strum: m = D}\n{use: m}\n{section: S}\nx`, 4, 'inside a section'));
  it('{use} of an unknown pattern', () => expectError(`${HDR}{strum: main = D}\n{section: S}\n{use: mian x2}`, 5, 'did you mean "main"'));
  it('{use} with a bad repeat', () => expectError(`${HDR}{strum: m = D}\n{section: S}\n{use: m x0}`, 5, 'between 1 and 99'));
  it('{use} unreadable', () => expectError(`${HDR}{strum: m = D}\n{section: S}\n{use: m twice}`, 5, "can't read"));
  it('empty section name', () => expectError(`${HDR}{section:}\nx`, 3, 'needs a name'));
  it('duplicate section', () => expectError(`${HDR}{section: Chorus}\nx\n{section: chorus}\ny`, 5, 'already defined on line 3'));
  it('lyrics before any section', () => expectError(`${HDR}[G]hello`, 3, 'before the first {section:}'));
  it('unclosed chord bracket', () => expectError(`${HDR}{section: S}\nhello [G there`, 4, 'column 7 is never closed'));
  it('stray closing bracket', () => expectError(`${HDR}{section: S}\nhello G] there`, 4, 'no matching "["'));
  it('empty chord', () => expectError(`${HDR}{section: S}\n[]hi`, 4, 'empty chord'));
  it('unreadable chord name', () => expectError(`${HDR}{section: S}\n[Xm7]hi`, 4, 'chord name "Xm7"'));
  it('chord not in the library', () => expectError(`${HDR}{section: S}\n[Cadd11]hi`, 4, 'isn\'t in the built-in library'));
  it('{tab} outside a section', () => expectError(`${HDR}{tab}\n${TAB6.join('\n')}\n{end_tab}\n{section: S}\nx`, 3, 'inside a section'));
  it('{tab} never closed', () => expectError(`${HDR}{section: S}\n{tab}\n${TAB6.join('\n')}`, 4, 'never closed'));
  it('{end_tab} without {tab}', () => expectError(`${HDR}{section: S}\n{end_tab}`, 4, 'without a matching {tab}'));
  it('directive inside a tab', () => expectError(`${HDR}{section: S}\n{tab}\n${TAB6.join('\n')}\n{section: T}\nx`, 11, 'inside a tab block'));
  it('empty tab', () => expectError(`${HDR}{section: S}\n{tab}\n{end_tab}`, 4, 'empty'));
  it('tab with 5 strings', () => expectError(`${HDR}{section: S}\n{tab}\n${TAB6.slice(0, 5).join('\n')}\n{end_tab}`, 5, 'has 5 string lines, expected 6'));
  it('tab with 7 strings hints at a blank line', () => expectError(`${HDR}{section: S}\n{tab}\n${[...TAB6, TAB6[0]].join('\n')}\n{end_tab}`, 5, 'separate it with one blank line'));
  it('misaligned tab line', () => {
    const lines = [...TAB6];
    lines[3] = 'D|--2---|';
    expectError(`${HDR}{section: S}\n{tab}\n${lines.join('\n')}\n{end_tab}`, 8, 'all 6 lines must be the same length');
  });
  it('bar lines in different columns', () => {
    const lines = [...TAB6];
    lines[2] = 'G|-0|--|';
    expectError(`${HDR}{section: S}\n{tab}\n${lines.join('\n')}\n{end_tab}`, 7, 'not in the same columns');
  });
  it('bad character in tab', () => {
    const lines = [...TAB6];
    lines[1] = 'B|--q--|';
    expectError(`${HDR}{section: S}\n{tab}\n${lines.join('\n')}\n{end_tab}`, 6, 'unexpected "q" at column 5');
  });
  it('wrong string label', () => {
    const lines = [...TAB6];
    lines[2] = 'A|--0--|';
    expectError(`${HDR}{section: S}\n{tab}\n${lines.join('\n')}\n{end_tab}`, 7, 'labelled "A" but the 3rd string from the top is G');
  });
  it('labels on some lines only', () => {
    const lines = [...TAB6];
    lines[4] = '|--3--|';
    expectError(`${HDR}{section: S}\n{tab}\n${lines.join('\n')}\n{end_tab}`, 9, 'label every line');
  });
  it('annotation between string lines', () => {
    const lines = [...TAB6.slice(0, 3), '  PM-|', ...TAB6.slice(3)];
    expectError(`${HDR}{section: S}\n{tab}\n${lines.join('\n')}\n{end_tab}`, 8, 'must go above');
  });
  it('{order} names a missing section, with suggestion', () => expectError(`${HDR}{section: Chorus}\nx\n{order: Chorus, Chrous}`, 5, 'did you mean "Chorus"'));
  it('{order} twice', () => expectError(`${HDR}{section: A}\nx\n{order: A}\n{order: A}`, 6, 'appears twice'));
  it('{order} with an empty entry', () => expectError(`${HDR}{section: A}\nx\n{order: A,,A}`, 5, 'empty entry'));

  it('reports every error, not just the first, sorted by line', () => {
    const errs = errors(`{title: T}\n{capo: 99}\n{tempo: x}\n{section: S}\n[Q]hi\n{order: S, Nope}`);
    expect(errs.map((e) => e.line)).toEqual([1, 2, 3, 5, 6]);
  });

  it('never throws on garbage input', () => {
    for (const junk of ['', '}{', '{', '[[[', '{tab}\n{tab}', '\u0000\u0001', '{section: x}\n{tab}\n|||\n{end_tab}'])
      expect(() => parseSong(junk)).not.toThrow();
  });
});
