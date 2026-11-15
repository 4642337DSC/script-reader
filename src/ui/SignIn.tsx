import { useState } from 'preact/hooks';

export function SignIn({ onSignIn }: { onSignIn: () => Promise<void> }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div class="signin">
      <h1>Script Reader</h1>
      <button class="list-item" disabled={busy} onClick={async () => {
        setBusy(true);
        setError('');
        try { await onSignIn(); } catch { setError("Sign-in didn't complete, try again."); }
        setBusy(false);
      }}>Sign in with Google</button>
      {error && <p class="status">{error}</p>}
    </div>
  );
}
