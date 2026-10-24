/** Site settings (src/content/settings/settings.json) for the chrome components. */
import { getEntry } from 'astro:content';
import { isStrictBuild } from '../status/mode';
import { brandNameFor } from './brand';

export async function getSettings() {
  const entry = await getEntry('settings', 'settings');
  if (!entry) throw new Error('settings: src/content/settings/settings.json is missing');
  return entry.data;
}

/** The brand name always comes from settings, never from code (rules: brand.ts). */
export async function getBrandName(): Promise<string> {
  return brandNameFor((await getSettings()).brandName, isStrictBuild());
}
