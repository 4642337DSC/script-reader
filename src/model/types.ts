export type ShotTag = 'wide' | 'medium' | 'closeup' | 'voiceover';

export interface Section {
  id: string; text: string; location: string | null; done: boolean; updatedAt: number;
  /** The source paragraph exactly as imported; re-import matches on this, not on the (editable) text. */
  originalText?: string;
  /** A place suggested by a filming cue; never applied as a real location automatically. */
  suggestedLocation?: string | null;
  /** How this card is shot: wide, medium, close-up, or voiceover. Absent = not tagged. */
  tag?: ShotTag;
}
export interface Video {
  id: string; title: string; sections: Section[];
  group?: string | null; notes?: string; originalTitle?: string; originalNotes?: string;
}
export interface ScriptDoc { fileId: string; name: string; videos: Video[]; orphans: Section[]; updatedAt: number }
export interface ParsedVideo { title: string; paragraphs: string[] }

export interface ImportedParagraph { source: string; text: string; suggestedLocation?: string | null }
export interface ImportedVideo { title: string; group: string | null; notes: string; paragraphs: ImportedParagraph[] }
