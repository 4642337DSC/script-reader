import type { ShotTag } from '../model/types';

/** Name of each shot tag on a script card (the icon is drawn by TagIcon). */
export const TAG_INFO: Record<ShotTag, { label: string }> = {
  wide: { label: 'Wide' },
  medium: { label: 'Medium' },
  closeup: { label: 'Close-up' },
  voiceover: { label: 'Voiceover' },
};
