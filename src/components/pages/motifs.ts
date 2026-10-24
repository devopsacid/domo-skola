/** Decorative motif per pillar and per day aspect (art/Motif.astro). */
import type { MotifName } from '../art/Motif.astro';
import type { DAY_ASPECTS } from './content';

export const PILLAR_MOTIF: Record<'montessori' | 'respectful' | 'constructivist' | 'hejny', MotifName> = {
  montessori: 'blocks',
  respectful: 'circles',
  constructivist: 'arch',
  hejny: 'triangle',
};

export const ASPECT_MOTIF: Record<(typeof DAY_ASPECTS)[number], MotifName> = {
  rhythm: 'sunrise',
  independent_guided: 'beads',
  outdoor: 'leaf',
  creative: 'paper',
  rest: 'window',
  social: 'ring',
  math_language: 'numberline',
  reflection: 'steps',
};
