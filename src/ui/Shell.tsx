import { useEffect, useState } from 'preact/hooks';
import type { AuthUser, Client, Repo, RepoError } from '../data/types';
import { parseRoute, useHash } from './useHash';
import { ScriptList } from './ScriptList';
import { VideoList } from './VideoList';
import { ReaderRoute } from './ReaderRoute';
import { AdminScreen } from './AdminScreen';
import { OrphansView } from './OrphansView';
import { SyncBadge } from './SyncBadge';
import type { Classifier } from '../ai/classify';
import type { Broller } from '../ai/broll';

interface Props { repo: Repo; user: AuthUser; onSignOut: () => void; getDriveToken?: () => Promise<string>; classify?: Classifier; extractBroll?: Broller }

export function Shell({ repo, user, onSignOut, getDriveToken, classify, extractBroll }: Props) {
  const [hash, go] = useHash();
  const route = parseRoute(hash);
  const [clients, setClients] = useState<Client[] | null>(null);
  const [clientsError, setClientsError] = useState<RepoError | null>(null);
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => repo.watchClients(setClients, setClientsError), [repo]);
  useEffect(() => { void repo.isAdmin().then(setAdmin); }, [repo]);
  useEffect(() => { if (route.name === 'admin' && admin === false) go('#/'); }, [route.name, admin]);

  const onError = (e: RepoError) => {
    if (e.code === 'permission-denied') {
      setNotice('You no longer have access to this client.');
      go('#/');
    } else {
      setClientsError(e);
    }
  };

  const backTo =
    route.name === 'scripts' || route.name === 'admin' ? '#/'
    : route.name === 'videos' ? `#/c/${route.c}`
    : route.name === 'reader' || route.name === 'orphans' ? `#/c/${route.c}/s/${route.s}`
    : null;

  const topbar = (
    <div class="topbar">
      {backTo !== null ? <button onClick={() => go(backTo)}>← Back</button> : <strong>Script Reader</strong>}
      <SyncBadge repo={repo} />
      <button onClick={onSignOut}>Sign out</button>
    </div>
  );
  const noticeBar = notice ? (
    <div class="toast" role="alert">
      <span>{notice}</span>
      <button onClick={() => setNotice('')}>OK</button>
    </div>
  ) : null;

  let body;
  if (clientsError) body = <p>Couldn't load your clients. Check your connection and reload.</p>;
  else if (!clients) body = <p>Loading…</p>;
  else if (route.name === 'clients') {
    body = (
      <>
        <p class="status">{user.email}</p>
        {clients.length === 0 && (
          <p>You don't have access to any clients yet. Ask the admin to add your email ({user.email}).</p>
        )}
        {admin && <button class="list-item" onClick={() => go('#/admin')}>Admin</button>}
        {clients.map((c) => (
          <button class="list-item" key={c.id} onClick={() => go(`#/c/${c.id}`)}>{c.name}</button>
        ))}
      </>
    );
  } else if (route.name === 'admin') {
    body = admin ? <AdminScreen repo={repo} clients={clients} /> : <p>…</p>;
  } else if (route.name === 'scripts') {
    body = <ScriptList repo={repo} clientId={route.c} go={go} onError={onError} isAdmin={!!admin} getDriveToken={getDriveToken} classify={classify} extractBroll={extractBroll} />;
  } else if (route.name === 'videos') {
    body = <VideoList repo={repo} clientId={route.c} scriptId={route.s} go={go} onError={onError} />;
  } else if (route.name === 'orphans') {
    body = <OrphansView repo={repo} clientId={route.c} scriptId={route.s} onError={onError} />;
  } else {
    body = <ReaderRoute repo={repo} clientId={route.c} scriptId={route.s} videoId={route.v} onError={onError} onNotice={setNotice} />;
  }

  return <>{topbar}{body}{noticeBar}</>;
}
