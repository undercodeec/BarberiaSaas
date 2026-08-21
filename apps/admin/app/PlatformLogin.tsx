'use client';

import Image from 'next/image';
import { useState, type FormEvent, type ReactNode } from 'react';

import navaLogo from '../../mobile/assets/nava-logo.png';

import ParticleField from './ParticleField';
import styles from './PlatformLogin.module.css';

function AuthIcon({ children }: { readonly children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      className={styles.icon}
      fill="none"
      viewBox="0 0 24 24"
    >
      <g
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      >
        {children}
      </g>
    </svg>
  );
}

function ShieldIcon() {
  return (
    <AuthIcon>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Zm-3-10 2 2 4-5" />
    </AuthIcon>
  );
}

export default function PlatformLogin({
  error,
  loading,
  onDevelopmentAccess,
  onSubmit,
}: {
  readonly error: string | null;
  readonly loading: boolean;
  readonly onDevelopmentAccess?: (() => Promise<void>) | undefined;
  readonly onSubmit: (email: string, password: string) => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit(email, password);
  }

  return (
    <main className={styles.shell}>
      <section className={styles.visual} aria-label="Bienvenida a Nava">
        <Image
          alt="Nava"
          className={styles.visualLogo}
          priority
          src={navaLogo}
        />

        <ParticleField className={styles.particleField} />

        <div className={styles.visualCopy}>
          <p className={styles.kicker}>Control Center</p>
          <h1>
            Bienvenido a <em>Nava</em>
          </h1>
        </div>
      </section>

      <section className={styles.formPanel}>
        <div className={styles.card}>
          <div className={styles.cardHeading}>
            <Image
              alt="Nava"
              className={styles.loginLogo}
              priority
              src={navaLogo}
            />

            <h2>Iniciar sesión</h2>
            <p>Ingresa tus credenciales para continuar</p>
          </div>

          <form
            className={styles.form}
            onSubmit={(event) => void submit(event)}
          >
            <label htmlFor="platform-email">Correo electrónico</label>
            <div className={styles.inputShell}>
              <AuthIcon>
                <path d="M3 5h18v14H3zM3 6l9 7 9-7" />
              </AuthIcon>
              <input
                autoCapitalize="none"
                autoComplete="email"
                id="platform-email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="ejemplo@correo.com"
                required
                spellCheck={false}
                type="email"
                value={email}
              />
            </div>

            <label htmlFor="platform-password">Contraseña</label>
            <div className={`${styles.inputShell} ${styles.passwordShell}`}>
              <AuthIcon>
                <path d="M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5zM12 15v2" />
              </AuthIcon>
              <input
                autoComplete="current-password"
                id="platform-password"
                minLength={8}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Ingresa tu contraseña"
                required
                type={showPassword ? 'text' : 'password'}
                value={password}
              />
              <button
                aria-label={
                  showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'
                }
                aria-pressed={showPassword}
                className={styles.passwordToggle}
                onClick={() => setShowPassword((visible) => !visible)}
                type="button"
              >
                {showPassword ? (
                  <svg aria-hidden="true" viewBox="0 0 24 24">
                    <path d="m4 4 16 16M10.7 10.8a2 2 0 0 0 2.5 2.5M9.9 5.2A10.8 10.8 0 0 1 12 5c5.5 0 9 7 9 7a15.7 15.7 0 0 1-2.1 3M6.6 6.7C4.2 8.4 3 12 3 12s3.5 7 9 7a9.8 9.8 0 0 0 3.2-.5" />
                  </svg>
                ) : (
                  <svg aria-hidden="true" viewBox="0 0 24 24">
                    <path d="M3 12s3.5-7 9-7 9 7 9 7-3.5 7-9 7-9-7-9-7Zm9 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
                  </svg>
                )}
              </button>
            </div>

            {error ? (
              <div className={styles.formError} role="alert">
                {error}
              </div>
            ) : null}

            <button className={styles.submit} disabled={loading} type="submit">
              <span>{loading ? 'Verificando…' : 'Ingresar'}</span>
              <span aria-hidden="true" className={styles.submitArrow}>
                →
              </span>
            </button>

            {process.env.NODE_ENV !== 'production' && onDevelopmentAccess ? (
              <button
                className={styles.developmentAccess}
                disabled={loading}
                onClick={() => void onDevelopmentAccess()}
                type="button"
              >
                Entrar al dashboard (desarrollo)
              </button>
            ) : null}
          </form>

          <div className={styles.securityNote}>
            <ShieldIcon />
            <span>Sesión temporal, segundo factor y acciones auditadas</span>
          </div>
        </div>
      </section>
    </main>
  );
}
