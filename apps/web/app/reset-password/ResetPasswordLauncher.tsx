'use client';

import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';

import { passwordValidationError, resetTokenFromSearch } from './reset-password-flow';

type ApiErrorBody = {
  readonly message?: string;
};

async function errorMessage(response: Response) {
  const body: unknown = await response.json().catch(() => null);
  if (body && typeof body === 'object' && 'message' in body) {
    const { message } = body as ApiErrorBody;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return 'No pudimos actualizar la contraseña. Inténtalo nuevamente.';
}

export function ResetPasswordLauncher() {
  const searchParams = useSearchParams();
  const [token] = useState(() => resetTokenFromSearch(searchParams.get('token')));
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    if (!token) return;
    window.history.replaceState(window.history.state, '', '/reset-password');
  }, [token]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const validationError = passwordValidationError(password, confirmation);
    if (validationError) {
      setMessage(validationError);
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch('/api/password-recovery/reset', {
        body: JSON.stringify({ password, token }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      if (!response.ok) {
        setMessage(await errorMessage(response));
        return;
      }
      setCompleted(true);
    } catch {
      setMessage('No pudimos conectar con Nava. Inténtalo nuevamente.');
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <Screen>
        <p style={styles.eyebrow}>NAVA</p>
        <h1 style={styles.title}>Enlace no válido</h1>
        <p style={styles.description}>
          Este enlace no contiene una recuperación válida. Solicita un correo nuevo desde la aplicación Nava.
        </p>
      </Screen>
    );
  }

  if (completed) {
    return (
      <Screen>
        <p style={styles.eyebrow}>NAVA</p>
        <h1 style={styles.title}>Contraseña actualizada</h1>
        <p style={styles.description}>
          Ya puedes iniciar sesión en Nava con tu nueva contraseña.
        </p>
      </Screen>
    );
  }

  return (
    <Screen>
      <p style={styles.eyebrow}>NAVA</p>
      <h1 style={styles.title}>Crea una nueva contraseña</h1>
      <p style={styles.description}>
        Usa al menos 12 caracteres. Este enlace vence en 30 minutos.
      </p>
      {message ? <p aria-live="polite" style={styles.notice}>{message}</p> : null}
      <form onSubmit={submit} style={styles.form}>
        <label style={styles.field}>
          <span style={styles.label}>Nueva contraseña</span>
          <input
            autoComplete="new-password"
            maxLength={72}
            minLength={12}
            onChange={(event) => setPassword(event.target.value)}
            required
            style={styles.input}
            type="password"
            value={password}
          />
        </label>
        <label style={styles.field}>
          <span style={styles.label}>Confirmar contraseña</span>
          <input
            autoComplete="new-password"
            maxLength={72}
            minLength={12}
            onChange={(event) => setConfirmation(event.target.value)}
            required
            style={styles.input}
            type="password"
            value={confirmation}
          />
        </label>
        <button disabled={busy} style={styles.primary} type="submit">
          {busy ? 'Actualizando…' : 'Actualizar contraseña'}
        </button>
      </form>
    </Screen>
  );
}

function Screen({ children }: { readonly children: React.ReactNode }) {
  return (
    <main style={styles.screen}>
      <section style={styles.card}>{children}</section>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  card: {
    background: '#FFFFFF',
    border: '1px solid #E4E1DA',
    borderRadius: 28,
    boxShadow: '0 16px 44px rgba(28, 28, 28, 0.08)',
    maxWidth: 440,
    padding: 30,
    width: '100%',
  },
  description: { color: '#555A63', fontSize: 16, lineHeight: 1.55, margin: 0 },
  eyebrow: {
    color: '#956816',
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: '0.14em',
  },
  field: { display: 'grid', gap: 6 },
  form: { display: 'grid', gap: 16, marginTop: 24 },
  input: {
    backgroundColor: '#FFFFFF',
    border: '1px solid #C9C5BC',
    borderRadius: 10,
    caretColor: '#1C1C1C',
    color: '#1C1C1C',
    fontSize: 16,
    minHeight: 48,
    padding: '12px 13px',
    WebkitTextFillColor: '#1C1C1C',
    width: '100%',
  },
  label: { color: '#30343A', fontSize: 14, fontWeight: 700 },
  notice: {
    background: '#FFF5DE',
    borderRadius: 10,
    color: '#6F4C0C',
    fontSize: 14,
    lineHeight: 1.45,
    margin: '18px 0 0',
    padding: 12,
  },
  primary: {
    background: '#C79532',
    border: 0,
    borderRadius: 14,
    color: '#FFFFFF',
    cursor: 'pointer',
    fontSize: 16,
    fontWeight: 800,
    padding: '15px 22px',
  },
  screen: {
    alignItems: 'center',
    background: '#FAF9F6',
    boxSizing: 'border-box',
    colorScheme: 'light',
    display: 'flex',
    justifyContent: 'center',
    minHeight: '100vh',
    padding: 24,
  },
  title: {
    color: '#1C1C1C',
    fontSize: 30,
    lineHeight: 1.15,
    margin: '8px 0 12px',
  },
};
