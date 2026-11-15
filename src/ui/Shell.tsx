import { useEffect, useState } from 'preact/hooks';
import type { AuthUser, Client, Repo, RepoError } from '../data/types';
import { parseRoute, useHash } from './useHash';

interface Props { repo: Repo; user: AuthUser; onSignOut: () => void }

export function Shell({ repo, user, onSignOut }: Props) {
  const [hash, go] = useHash();
  const route = parseRoute(hash);
  const [clients, setClients] = useState<Client[] | null>(null);
  const [clientsError, setClientsError] = useState<RepoError | null>(null);

  useEffect(() => repo.watchClients(setClients, setClientsError), [repo]);

  const topbar = (
    <div class="topbar">
      <strong>Script Reader</strong>
      <span class="status">{user.email}</span>
      <button onClick={onSignOut}>Sign out</button>
    </div>
  );

  if (clientsError) return <>{topbar}<p>Couldn't load your clients. Check your connection and reload.</p></>;
  if (!clients) return <>{topbar}<p>Loading…</p></>;

  if (route.name === 'clients') {
    return (
      <>
        {topbar}
        {clients.length === 0 && (
          <p>You don't have access to any clients yet. Ask the admin to add your email ({user.email}).</p>
        )}
        {clients.map((c) => (
          <button class="list-item" key={c.id} onClick={() => go(`#/c/${c.id}`)}>{c.name}</button>
        ))}
      </>
    );
  }
  return <>{topbar}<p>…</p></>;
}
