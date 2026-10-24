/** Site settings (src/content/settings/settings.json) for the chrome components. */
import { getEntry } from 'astro:content';

export async function getSettings() {
  const entry = await getEntry('settings', 'settings');
  if (!entry) throw new Error('settings: src/content/settings/settings.json is missing');
  return entry.data;
}

/** The brand name always comes from settings, never from code. */
export async function getBrandName(): Promise<string> {
  const name = (await getSettings()).brandName.value;
  if (!name) throw new Error('settings.brandName.value is empty');
  return name;
}
