import { useState } from 'preact/hooks';
import type { Client, Repo } from '../data/types';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function AdminScreen({ repo, clients }: { repo: Repo; clients: Client[] }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const run = async (fn: () => Promise<unknown>) => {
    setError('');
    try { await fn(); } catch { setError("That didn't work. Check your connection and try again."); }
  };

  return (
    <>
      <h2>Clients and access</h2>
      {error && <p class="status">{error}</p>}
      <div class="topbar">
        <input class="inline-input" placeholder="New client name" value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
        <button disabled={!name.trim()} onClick={() => run(async () => { await repo.createClient(name.trim()); setName(''); })}>Add client</button>
      </div>
      {clients.map((c) => (
        <section class="client-card" key={c.id}>
          <div class="topbar">
            <h3>{c.name}</h3>
            <span>
              <button aria-label={`Rename ${c.name}`} onClick={() => {
                const n = window.prompt('New name', c.name)?.trim();
                if (n) void run(() => repo.renameClient(c.id, n));
              }}>Rename</button>
              <button aria-label={`Delete ${c.name}`} onClick={() => {
                if (window.confirm(`Delete ${c.name} and all its scripts for everyone?`)) void run(() => repo.deleteClient(c.id));
              }}>Delete</button>
            </span>
          </div>
          {c.members.length === 0 && <p class="status">No members yet.</p>}
          {c.members.map((m) => (
            <div class="topbar" key={m}>
              <span>{m}</span>
              <button aria-label={`Remove ${m}`} onClick={() => run(() => repo.setMembers(c.id, c.members.filter((x) => x !== m)))}>Remove</button>
            </div>
          ))}
          <div class="topbar">
            <input
              class="inline-input"
              aria-label={`Add member to ${c.name}`}
              placeholder="Member email"
              value={drafts[c.id] ?? ''}
              onInput={(e) => setDrafts({ ...drafts, [c.id]: (e.target as HTMLInputElement).value })}
            />
            <button onClick={() => {
              const email = (drafts[c.id] ?? '').trim().toLowerCase();
              if (!EMAIL.test(email)) { setError('Enter a valid email address.'); return; }
              void run(async () => { await repo.setMembers(c.id, [...c.members, email]); setDrafts({ ...drafts, [c.id]: '' }); });
            }}>Add member</button>
          </div>
        </section>
      ))}
    </>
  );
}
