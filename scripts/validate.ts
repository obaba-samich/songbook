/**
 * Validate .gsong files without opening the app.
 *   npm run validate songs/whatever.gsong [more files…]
 *   npm run validate            (checks every file in songs/ and examples/)
 * Exit code 1 if any file has errors.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseSong } from '../src/core/parser';

const color = process.stdout.isTTY && !process.env.NO_COLOR;
const red = (s: string) => (color ? `\x1b[31m${s}\x1b[0m` : s);
const yellow = (s: string) => (color ? `\x1b[33m${s}\x1b[0m` : s);
const green = (s: string) => (color ? `\x1b[32m${s}\x1b[0m` : s);
const dim = (s: string) => (color ? `\x1b[2m${s}\x1b[0m` : s);

function expand(args: string[]): string[] {
  const targets = args.length ? args : ['songs', 'examples'];
  return targets.flatMap((t) => {
    try {
      if (statSync(t).isDirectory()) return readdirSync(t).filter((f) => f.endsWith('.gsong')).sort().map((f) => join(t, f));
    } catch {
      if (!args.length) return []; // default folder missing: nothing to check
    }
    return [t];
  });
}

let failed = 0;
const files = expand(process.argv.slice(2));
if (!files.length) {
  console.log('No .gsong files found.');
  process.exit(1);
}

for (const file of files) {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch (e) {
    console.log(`${red('✗')} ${file}: can't read file (${(e as Error).message})`);
    failed++;
    continue;
  }
  const { song, diagnostics, lines } = parseSong(text);
  const errors = diagnostics.filter((d) => d.severity === 'error');
  const warnings = diagnostics.filter((d) => d.severity === 'warning');
  const title = song.meta.title ? ` (${song.meta.title})` : '';
  if (!diagnostics.length) {
    const g = song.guitars.length > 1 ? `, ${song.guitars.length} guitars` : '';
    console.log(`${green('✓')} ${file}${title} — ${song.sections.size} sections, ${song.order.length} in order${g}`);
    continue;
  }
  if (errors.length) failed++;
  console.log(`${errors.length ? red('✗') : yellow('!')} ${file}${title} — ${errors.length} error(s), ${warnings.length} warning(s)`);
  for (const d of diagnostics) {
    const tag = d.severity === 'error' ? red('error') : yellow('warning');
    console.log(`  ${file}:${d.line}: ${tag}: ${d.message}`);
    const src = lines[d.line - 1];
    if (src !== undefined && src.trim()) console.log(dim(`    ${String(d.line).padStart(4)} │ ${src}`));
  }
}

if (files.length > 1) console.log(failed ? red(`\n${failed} of ${files.length} files have errors`) : green(`\nAll ${files.length} files are valid`));
process.exit(failed ? 1 : 0);
