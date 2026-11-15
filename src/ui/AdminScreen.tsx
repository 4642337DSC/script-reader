import { useState } from 'preact/hooks';
import type { Client, Repo } from '../data/types';
import { AutoSaveText } from './AutoSaveText';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function AdminScreen({ repo, clients }: { repo: Repo; clients: Client[] }) {
  const [error, setError] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setError('');
    try { await fn(); } catch { setError("That didn't work. Check your connection and try again."); }
  };

  return (
    <>
      <h2>Clients and access</h2>
      {error && <p class="status">{error}</p>}
      <div class="topbar">
        <AutoSaveText
          keepOpen
          multiline={false}
          autoFocus={false}
          class="inline-input"
          initial=""
          label="New client name"
          placeholder="New client name"
          onSave={(t) => { void run(() => repo.createClient(t.trim())); }}
        />
      </div>
      {clients.map((c) => (
        <section class="client-card" key={c.id}>
          <div class="topbar">
            {renamingId === c.id ? (
              <AutoSaveText
                multiline={false}
                class="inline-input"
                initial={c.name}
                label="Client name"
                onSave={(t) => { setRenamingId(null); void run(() => repo.renameClient(c.id, t.trim())); }}
                onCancel={() => setRenamingId(null)}
              />
            ) : (
              <h3>{c.name}</h3>
            )}
            <span>
              <button aria-label={`Rename ${c.name}`} onClick={() => setRenamingId(c.id)}>Rename</button>
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
            <AutoSaveText
              keepOpen
              multiline={false}
              autoFocus={false}
              class="inline-input"
              initial=""
              label={`Add member to ${c.name}`}
              placeholder="Member email"
              onSave={(t) => {
                const email = t.trim().toLowerCase();
                if (!EMAIL.test(email)) { setError('Enter a valid email address.'); return false; }
                void run(() => repo.setMembers(c.id, [...c.members, email]));
                return true;
              }}
            />
          </div>
        </section>
      ))}
    </>
  );
}
