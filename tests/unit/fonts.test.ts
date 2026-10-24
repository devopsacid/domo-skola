import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';

const DIR = 'src/assets/fonts';

describe('self-hosted fonts', () => {
  const sums = readFileSync(`${DIR}/SHA256SUMS`, 'utf8')
    .trim()
    .split('\n')
    .map((l) => l.split(/\s+\*?/) as [string, string]);

  it('lists every committed font in SHA256SUMS and nothing else', () => {
    const files = readdirSync(DIR)
      .filter((f) => f.endsWith('.woff2'))
      .sort();
    expect(sums.map(([, f]) => f).sort()).toEqual(files);
    expect(files).toEqual([
      'atkinson-next-italic.woff2',
      'atkinson-next-roman.woff2',
      'fraunces-roman.woff2',
    ]);
  });

  it('matches the committed bytes', () => {
    for (const [sum, file] of sums)
      expect(
        createHash('sha256')
          .update(readFileSync(`${DIR}/${file}`))
          .digest('hex'),
        file,
      ).toBe(sum);
  });

  it('ships the OFL licence next to the served fonts', () => {
    for (const f of ['LICENSE-fraunces.txt', 'LICENSE-atkinson.txt'])
      expect(readFileSync(`public/fonts/${f}`, 'utf8')).toContain(
        'SIL Open Font License, Version 1.1',
      );
  });
});
