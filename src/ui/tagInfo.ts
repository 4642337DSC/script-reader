import type { ShotTag } from '../model/types';

/** Icon and name of each shot tag on a script card. */
export const TAG_INFO: Record<ShotTag, { icon: string; label: string }> = {
  wide: { icon: '🌄', label: 'Wide' },
  medium: { icon: '🧍', label: 'Medium' },
  closeup: { icon: '🔍', label: 'Close-up' },
  voiceover: { icon: '🎙', label: 'Voiceover' },
};
