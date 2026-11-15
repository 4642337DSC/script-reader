import { useEffect, useState } from 'preact/hooks';
import type { Repo, SyncState } from '../data/types';

export function SyncBadge({ repo }: { repo: Repo }) {
  const [s, setS] = useState<SyncState>({ online: true, pending: false });
  useEffect(() => repo.watchSyncState(setS), [repo]);
  const text = s.online ? (s.pending ? 'Syncing…' : 'Up to date') : s.pending ? 'Offline · unsynced changes' : 'Offline';
  return <span class="status" role="status">{text}</span>;
}
