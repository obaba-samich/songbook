/** SVG chord-box diagrams. Colours come from CSS (currentColor / classes). */
import type { ChordShape } from '../core/types';
import { esc } from './html';

const STRING_GAP = 14;
const FRET_GAP = 18;
const LEFT = 24;
const TOP = 40;

interface Barre { fret: number; from: number; to: number }

function findBarres(shape: ChordShape): Barre[] {
  const { frets, fingers } = shape;
  const barres: Barre[] = [];
  if (fingers) {
    const byFinger = new Map<string, number[]>();
    frets.forEach((f, i) => {
      const fi = fingers[i];
      if (f && fi) {
        const k = `${fi}@${f}`;
        byFinger.set(k, [...(byFinger.get(k) ?? []), i]);
      }
    });
    for (const [k, strs] of byFinger) {
      if (strs.length < 2) continue;
      const fret = Number(k.split('@')[1]);
      const from = Math.min(...strs);
      const to = Math.max(...strs);
      // Only a real barre if no string in between is open/muted.
      if (frets.slice(from, to + 1).every((f) => f !== null && f >= fret)) barres.push({ fret, from, to });
    }
    return barres;
  }
  const fretted = frets.filter((f): f is number => f !== null && f > 0);
  if (!fretted.length) return barres;
  const min = Math.min(...fretted);
  const first = frets.findIndex((f) => f !== null);
  const last = frets.length - 1;
  if (min > 0 && frets[first] === min && frets[last] === min && frets.slice(first).every((f) => f !== null && f >= min))
    barres.push({ fret: min, from: first, to: last });
  return barres;
}

/** Draw one chord box. `shape` null draws a "no diagram" placeholder. */
export function chordDiagram(name: string, shape: ChordShape | null): string {
  const strings = shape?.frets.length ?? 6;
  const width = LEFT + STRING_GAP * (strings - 1) + 18;
  const title = `<text class="dg-name" x="${LEFT + (STRING_GAP * (strings - 1)) / 2}" y="16" text-anchor="middle">${esc(name)}</text>`;
  if (!shape) {
    return `<figure class="diagram" aria-label="${esc(name)}: no diagram"><svg viewBox="0 0 ${width} 150" width="${width}" height="150">${title}
      <rect x="${LEFT}" y="${TOP}" width="${STRING_GAP * (strings - 1)}" height="${FRET_GAP * 5}" class="dg-missing"/>
      <text x="${LEFT + (STRING_GAP * (strings - 1)) / 2}" y="${TOP + 50}" text-anchor="middle" class="dg-q">?</text></svg>
      <figcaption>no shape</figcaption></figure>`;
  }
  const fretted = shape.frets.filter((f): f is number => f !== null && f > 0);
  const maxF = fretted.length ? Math.max(...fretted) : 0;
  const minF = fretted.length ? Math.min(...fretted) : 1;
  const base = maxF <= 5 ? 1 : minF;
  const rows = Math.max(5, maxF - base + 1);
  const gridW = STRING_GAP * (strings - 1);
  const gridH = FRET_GAP * rows;
  const parts: string[] = [title];

  for (let s = 0; s < strings; s++) {
    const x = LEFT + s * STRING_GAP;
    parts.push(`<line class="dg-line" x1="${x}" y1="${TOP}" x2="${x}" y2="${TOP + gridH}"/>`);
    const f = shape.frets[s];
    if (f === null) parts.push(`<text class="dg-mark" x="${x}" y="${TOP - 7}" text-anchor="middle">×</text>`);
    else if (f === 0) parts.push(`<circle class="dg-open" cx="${x}" cy="${TOP - 11}" r="4"/>`);
  }
  for (let r = 0; r <= rows; r++) {
    const y = TOP + r * FRET_GAP;
    parts.push(`<line class="${r === 0 && base === 1 ? 'dg-nut' : 'dg-line'}" x1="${LEFT}" y1="${y}" x2="${LEFT + gridW}" y2="${y}"/>`);
  }
  if (base > 1) parts.push(`<text class="dg-pos" x="${LEFT - 6}" y="${TOP + FRET_GAP / 2 + 4}" text-anchor="end">${base}fr</text>`);

  const barres = findBarres(shape);
  for (const b of barres) {
    const y = TOP + (b.fret - base + 0.5) * FRET_GAP;
    parts.push(`<rect class="dg-dot" x="${LEFT + b.from * STRING_GAP - 6}" y="${y - 6}" width="${(b.to - b.from) * STRING_GAP + 12}" height="12" rx="6"/>`);
  }
  shape.frets.forEach((f, s) => {
    if (!f) return;
    const covered = barres.some((b) => b.fret === f && s >= b.from && s <= b.to);
    const cx = LEFT + s * STRING_GAP;
    const cy = TOP + (f - base + 0.5) * FRET_GAP;
    if (!covered) parts.push(`<circle class="dg-dot" cx="${cx}" cy="${cy}" r="6"/>`);
    const finger = shape.fingers?.[s];
    if (finger && (!covered || s === barres.find((b) => b.fret === f && s >= b.from && s <= b.to)!.from))
      parts.push(`<text class="dg-finger" x="${cx}" y="${cy + 4}" text-anchor="middle">${finger}</text>`);
  });

  const caption = shape.bassHint ? `<figcaption>bass: ${esc(shape.bassHint)}</figcaption>` : '';
  const height = TOP + gridH + 8;
  const fretsText = shape.frets.map((f) => (f === null ? 'x' : f)).join(' ');
  return `<figure class="diagram" aria-label="${esc(name)}: ${fretsText}"><svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img"><title>${esc(name)} — ${fretsText} (low to high)</title>${parts.join('')}</svg>${caption}</figure>`;
}
