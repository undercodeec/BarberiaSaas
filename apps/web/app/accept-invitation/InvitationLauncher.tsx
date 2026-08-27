'use client';

import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';

import {
  initialInvitationStep,
  invitationTokenFromSearch,
  type InvitationStep,
} from './invitation-flow';
import {
  invitationInputStyle,
  invitationScreenStyle,
} from './invitation-form-styles';

type ApiBody = {
  readonly code?: string;
  readonly email?: string;
  readonly message?: string;
};

class InvitationRequestError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

async function postInvitation(
  path: string,
  body: Record<string, unknown>,
): Promise<ApiBody> {
  const response = await fetch(`/api/invitations/${path}`, {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  const responseBody: unknown = await response.json().catch(() => ({}));
  const apiBody =
    responseBody && typeof responseBody === 'object'
      ? (responseBody as ApiBody)
      : {};
  if (!response.ok) {
    throw new InvitationRequestError(
      apiBody.message ??
        'No pudimos completar la solicitud. Inténtalo otra vez.',
      apiBody.code,
    );
  }
  return apiBody;
}

export function InvitationLauncher() {
  const searchParams = useSearchParams();
  const [token] = useState(() =>
    invitationTokenFromSearch(searchParams.get('token')),
  );
  const [step, setStep] = useState<InvitationStep>(() =>
    initialInvitationStep(searchParams.get('token')),
  );
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [privacyPolicyAccepted, setPrivacyPolicyAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    window.history.replaceState(window.history.state, '', '/accept-invitation');
  }, [token]);

  async function acceptInvitation() {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await postInvitation('accept', { token });
      setStep('success');
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No pudimos aceptar la invitación.',
      );
      setStep('choice');
    } finally {
      setBusy(false);
    }
  }

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await postInvitation('auth/login', { email, password });
      await acceptInvitation();
    } catch (requestError) {
      if (
        requestError instanceof InvitationRequestError &&
        requestError.code === 'EMAIL_NOT_VERIFIED'
      ) {
        setStep('verify');
        setError('Verifica tu correo para continuar con la invitación.');
      } else {
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'No pudimos iniciar sesión.',
        );
      }
      setBusy(false);
    }
  }

  async function submitRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const registration = await postInvitation('auth/invitation-register', {
        confirmPassword,
        email,
        fullName,
        password,
        privacyPolicyAccepted,
        token,
      });
      setEmail(registration.email ?? email);
      setStep('verify');
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No pudimos crear la cuenta.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitVerification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await postInvitation('auth/verify-email', {
        code: verificationCode,
        email,
      });
      await acceptInvitation();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No pudimos verificar el correo.',
      );
      setBusy(false);
    }
  }

  async function resendVerification() {
    setBusy(true);
    setError(null);
    try {
      await postInvitation('auth/resend-verification', { email });
      setError('Enviamos un nuevo código de verificación a tu correo.');
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No pudimos reenviar el código.',
      );
    } finally {
      setBusy(false);
    }
  }

  if (step === 'invalid') {
    return (
      <Screen>
        <p style={styles.eyebrow}>NAVA</p>
        <h1 style={styles.title}>Enlace no válido</h1>
        <p style={styles.description}>
          Solicita al propietario del negocio una invitación nueva.
        </p>
      </Screen>
    );
  }

  if (step === 'success') {
    return (
      <Screen>
        <p style={styles.eyebrow}>NAVA</p>
        <h1 style={styles.title}>Tu acceso está activo</h1>
        <p style={styles.description}>
          La invitación fue aceptada. Instala Nava en tu teléfono e inicia
          sesión con <strong>{email}</strong> para usar tus herramientas de
          trabajo.
        </p>
      </Screen>
    );
  }

  return (
    <Screen>
      <p style={styles.eyebrow}>NAVA</p>
      <h1 style={styles.title}>Únete al equipo</h1>
      <p style={styles.description}>
        Acepta tu invitación desde aquí. No necesitas instalar la aplicación
        para completar este paso.
      </p>
      {error ? <p style={styles.notice}>{error}</p> : null}

      {step === 'choice' ? (
        <div style={styles.actions}>
          <button
            onClick={() => setStep('login')}
            style={styles.primary}
            type="button"
          >
            Ya tengo una cuenta
          </button>
          <button
            onClick={() => setStep('register')}
            style={styles.secondary}
            type="button"
          >
            Crear mi cuenta
          </button>
        </div>
      ) : null}

      {step === 'login' ? (
        <form onSubmit={submitLogin} style={styles.form}>
          <Field label="Correo electrónico">
            <input
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="correo@ejemplo.com"
              required
              style={styles.input}
              type="email"
              value={email}
            />
          </Field>
          <Field label="Contraseña">
            <input
              autoComplete="current-password"
              minLength={8}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Tu contraseña"
              required
              style={styles.input}
              type="password"
              value={password}
            />
          </Field>
          <button disabled={busy} style={styles.primary} type="submit">
            {busy ? 'Aceptando…' : 'Iniciar sesión y aceptar'}
          </button>
          <button
            onClick={() => setStep('choice')}
            style={styles.link}
            type="button"
          >
            Volver
          </button>
        </form>
      ) : null}

      {step === 'register' ? (
        <form onSubmit={submitRegistration} style={styles.form}>
          <Field label="Nombre completo">
            <input
              autoComplete="name"
              minLength={2}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Tu nombre completo"
              required
              style={styles.input}
              value={fullName}
            />
          </Field>
          <Field label="Correo electrónico invitado">
            <input
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="correo@ejemplo.com"
              required
              style={styles.input}
              type="email"
              value={email}
            />
          </Field>
          <Field label="Contraseña">
            <input
              autoComplete="new-password"
              minLength={8}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Mínimo 8 caracteres"
              required
              style={styles.input}
              type="password"
              value={password}
            />
          </Field>
          <Field label="Confirmar contraseña">
            <input
              autoComplete="new-password"
              minLength={8}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Repite tu contraseña"
              required
              style={styles.input}
              type="password"
              value={confirmPassword}
            />
          </Field>
          <label style={styles.checkboxLabel}>
            <input
              checked={privacyPolicyAccepted}
              onChange={(event) =>
                setPrivacyPolicyAccepted(event.target.checked)
              }
              required
              type="checkbox"
            />{' '}
            Acepto la Política de Privacidad.
          </label>
          <button disabled={busy} style={styles.primary} type="submit">
            {busy ? 'Creando cuenta…' : 'Crear cuenta y continuar'}
          </button>
          <button
            onClick={() => setStep('choice')}
            style={styles.link}
            type="button"
          >
            Volver
          </button>
        </form>
      ) : null}

      {step === 'verify' ? (
        <form onSubmit={submitVerification} style={styles.form}>
          <p style={styles.description}>
            Ingresa el código de seis dígitos enviado a <strong>{email}</strong>
            .
          </p>
          <Field label="Código de verificación">
            <input
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={6}
              onChange={(event) => setVerificationCode(event.target.value)}
              pattern="[0-9]{6}"
              placeholder="000000"
              required
              style={styles.input}
              value={verificationCode}
            />
          </Field>
          <button disabled={busy} style={styles.primary} type="submit">
            {busy ? 'Verificando…' : 'Verificar y aceptar'}
          </button>
          <button
            disabled={busy}
            onClick={resendVerification}
            style={styles.link}
            type="button"
          >
            Reenviar código
          </button>
        </form>
      ) : null}
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

function Field({
  children,
  label,
}: {
  readonly children: React.ReactNode;
  readonly label: string;
}) {
  return (
    <label style={styles.field}>
      <span style={styles.label}>{label}</span>
      {children}
    </label>
  );
}

const styles: Record<string, CSSProperties> = {
  actions: { display: 'grid', gap: 12, marginTop: 24 },
  card: {
    background: '#FFFFFF',
    border: '1px solid #E4E1DA',
    borderRadius: 28,
    boxShadow: '0 16px 44px rgba(28, 28, 28, 0.08)',
    maxWidth: 440,
    padding: 30,
    width: '100%',
  },
  checkboxLabel: { color: '#3E4248', fontSize: 14, lineHeight: 1.45 },
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
    ...invitationInputStyle,
    border: '1px solid #C9C5BC',
    borderRadius: 10,
    fontSize: 16,
    minHeight: 48,
    padding: '12px 13px',
    width: '100%',
  },
  label: { color: '#30343A', fontSize: 14, fontWeight: 700 },
  link: {
    background: 'transparent',
    border: 0,
    color: '#76530F',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 700,
    padding: 4,
    textDecoration: 'underline',
  },
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
    ...invitationScreenStyle,
    alignItems: 'center',
    background: '#FAF9F6',
    boxSizing: 'border-box',
    display: 'flex',
    justifyContent: 'center',
    minHeight: '100vh',
    padding: 24,
  },
  secondary: {
    background: '#FFFFFF',
    border: '1px solid #C79532',
    borderRadius: 14,
    color: '#76530F',
    cursor: 'pointer',
    fontSize: 16,
    fontWeight: 800,
    padding: '14px 22px',
  },
  title: {
    color: '#1C1C1C',
    fontSize: 30,
    lineHeight: 1.15,
    margin: '8px 0 12px',
  },
};
