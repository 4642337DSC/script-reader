import type { ParsedVideo, ScriptDoc } from '../model/types';
export type { ParsedVideo, ScriptDoc, Section, Video } from '../model/types';

export interface Client { id: string; name: string; members: string[] }
export interface SectionRow {
  id: string; videoId: string | null; order: number; text: string;
  location: string | null; done: boolean; updatedAt: number; orphaned: boolean;
}
export interface ScriptSummary { id: string; name: string; videoCount: number; updatedAt: number }
export interface ScriptData { doc: ScriptDoc; orders: Record<string, number> } // doc.fileId = script id
export interface SyncState { online: boolean; pending: boolean }
export type Unsub = () => void;
export type RepoError = { code: 'permission-denied' | 'not-found' | 'other'; message: string };

export interface Repo {
  isAdmin(): Promise<boolean>;
  watchClients(cb: (c: Client[]) => void, onError: (e: RepoError) => void): Unsub;
  watchScripts(clientId: string, cb: (s: ScriptSummary[]) => void, onError: (e: RepoError) => void): Unsub;
  watchScript(clientId: string, scriptId: string, cb: (d: ScriptData | null) => void, onError: (e: RepoError) => void): Unsub;
  watchRecents(clientId: string, cb: (list: string[]) => void): Unsub;
  watchSyncState(cb: (s: SyncState) => void): Unsub;
  createClient(name: string): Promise<string>;
  renameClient(id: string, name: string): Promise<void>;
  deleteClient(id: string): Promise<void>;
  setMembers(id: string, emails: string[]): Promise<void>;
  addScript(clientId: string, name: string, parsed: ParsedVideo[]): Promise<{ scriptId: string; reimported: boolean }>;
  deleteScript(clientId: string, scriptId: string): Promise<void>;
  saveScript(clientId: string, scriptId: string, before: ScriptData, after: ScriptDoc): Promise<{ droppedOnReject?: number }>;
  addRecent(clientId: string, location: string): Promise<void>;
}

export interface AuthUser { email: string; name: string }
export interface AuthApi {
  onUser(cb: (u: AuthUser | null) => void): Unsub;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  /** Optional: asks Google for read-only Docs/Drive access, for importing a Google Docs link. */
  getDriveToken?(): Promise<string>;
}
