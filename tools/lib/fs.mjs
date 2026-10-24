import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** All files under dir (recursive), absolute paths, sorted. */
export function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

/** dist-relative URL path of an html file: /sk/index.html -> /sk/ */
export function urlOf(dist, file) {
  const rel = '/' + relative(dist, file).split(sep).join('/');
  return rel.endsWith('/index.html') ? rel.slice(0, -'index.html'.length) : rel;
}

export function fail(tool, problems) {
  console.error(`${tool}: ${problems.length} problem(s)`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
