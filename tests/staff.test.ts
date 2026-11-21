import { describe, expect, it } from 'vitest';
import { parseAnnotations, renderStaff, systemMeasures } from '../src/views/tabStaff';
import { STANDARD } from '../src/core/library';
import type { TabSystem } from '../src/core/types';

const sys = (strings: string[], annotations: string[] = []): TabSystem => ({ line: 1, annotations, strings, labelled: true });
const opts = { tuning: STANDARD, widthEm: 40, showStringNames: false, firstMeasure: 1 };

describe('annotations above the staff', () => {
  it('reads chord names, palm mutes across bar lines, and let ring', () => {
    const items = parseAnnotations([' Am          C', ' PM----------|PM----------|', ' let ring----']);
    expect(items).toEqual([
      { col: 1, end: 2, kind: 'chord', text: 'Am' },
      { col: 13, end: 13, kind: 'chord', text: 'C' },
      { col: 1, end: 12, kind: 'pm', text: 'PM' },
      { col: 14, end: 25, kind: 'pm', text: 'PM' },
      { col: 1, end: 12, kind: 'ring', text: 'let ring' },
    ]);
  });
  it('keeps other words as text', () => {
    expect(parseAnnotations(['  x2 slowly'])).toEqual([
      { col: 2, end: 3, kind: 'text', text: 'x2' },
      { col: 5, end: 10, kind: 'text', text: 'slowly' },
    ]);
  });
});

describe('measures', () => {
  it('splits at shared bar lines', () => {
    const m = systemMeasures(Array(6).fill('|--1--|--2--|'));
    expect(m.map((x) => [x.s, x.e])).toEqual([[1, 6], [7, 12]]);
  });
  it('handles tab without leading/trailing bars', () => {
    expect(systemMeasures(Array(6).fill('--1--|--2--')).map((x) => [x.s, x.e])).toEqual([[0, 5], [6, 11]]);
  });
  it('detects repeat signs', () => {
    const lines = ['|:--1--:|', '|:--1--:|', '|---1---|', '|---1---|', '|:--1--:|', '|:--1--:|'];
    expect(systemMeasures(lines)).toEqual([{ s: 2, e: 7, startRepeat: true, endRepeat: true }]);
  });
});

describe('engraved staff', () => {
  const strings = ['|-----0~~-|', '|---------|', '|0h2-5/7--|', '|-7b9r7---|', '|-0p------|', '|3--------|'];
  const out = renderStaff([sys(strings, ['  G', '  PM------'])], { ...opts, timeSig: '4/4', tempo: 95 });

  it('draws six string lines per row and counts measures', () => {
    expect(out.measures).toBe(1);
    expect(out.html.match(/class="st-line"/g)).toHaveLength(6);
  });
  it('draws every technique', () => {
    expect(out.html).toContain('class="st-slur"'); // hammer/pull arcs
    expect(out.html).toContain('>H</text>');
    expect(out.html).toContain('>P</text>');
    expect(out.html).toContain('class="st-slide"');
    expect(out.html).toContain('class="st-bend"');
    expect(out.html).toContain('>full</text>'); // 7b9 = whole step
    expect(out.html).toContain('class="st-vib"');
    expect(out.html).toContain('>P.M.</text>');
    expect(out.html).toContain('class="st-chord"');
  });
  it('hides the bend target fret (shown by the arrow) but keeps the bent note', () => {
    const frets = [...out.html.matchAll(/class="st-fret"[^>]*>([^<]+)</g)].map((m) => m[1]);
    expect(frets).toContain('7');
    expect(frets).not.toContain('9');
  });
  it('shows time signature and tempo only when asked', () => {
    expect(out.html).toContain('♩ = 95');
    expect(out.html.match(/class="st-sig"/g)).toHaveLength(2);
    const plain = renderStaff([sys(strings)], opts);
    expect(plain.html).not.toContain('♩');
    expect(plain.html).not.toContain('st-sig');
  });
  it('continues measure numbers and wraps long systems into rows', () => {
    const long = Array(6).fill('|' + '------------|'.repeat(12));
    const r = renderStaff([sys(long)], { ...opts, widthEm: 30, firstMeasure: 9 });
    expect(r.measures).toBe(12);
    expect(r.html.match(/<svg class="staff-row"/g)!.length).toBeGreaterThan(1);
    expect(r.html).toContain('>9</text>');
    expect(r.html).toContain('>20</text>');
  });
  it('adds tooltips to notes and techniques', () => {
    expect(out.html).toContain('data-tip="Hammer-on from the open string to fret 2');
    expect(out.html).toContain('data-tip="3rd fret on the low E string');
  });
});
