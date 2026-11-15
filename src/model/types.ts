export interface Section { id: string; text: string; location: string | null; done: boolean; updatedAt: number }
export interface Video { id: string; title: string; sections: Section[] }
export interface ScriptDoc { fileId: string; name: string; videos: Video[]; orphans: Section[]; updatedAt: number }
export interface ParsedVideo { title: string; paragraphs: string[] }
