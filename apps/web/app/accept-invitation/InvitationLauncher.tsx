'use client';

import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';

export function InvitationLauncher() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const mobileUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (token) params.set('token', token);
    return `barbersaas://accept-invitation?${params.toString()}`;
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const timer = window.setTimeout(() => {
      window.location.assign(mobileUrl);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [mobileUrl, token]);

  return (
    <main style={styles.screen}>
      <section style={styles.card}>
        <p style={styles.eyebrow}>NAVA</p>
        <h1 style={styles.title}>
          {token ? 'Abriendo tu invitación' : 'Enlace no válido'}
        </h1>
        <p style={styles.description}>
          {token
            ? 'Abriremos Nava para que puedas aceptar la invitación. Si no se abre automáticamente, usa el botón.'
            : 'Solicita al propietario del negocio una invitación nueva.'}
        </p>
        {token ? (
          <a href={mobileUrl} style={styles.action}>
            Abrir Nava
          </a>
        ) : null}
      </section>
    </main>
  );
}

const styles = {
  action: {
    background: '#C79532',
    borderRadius: 14,
    color: '#FFFFFF',
    display: 'inline-block',
    fontWeight: 800,
    marginTop: 24,
    padding: '15px 22px',
    textDecoration: 'none',
  },
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
  screen: {
    alignItems: 'center',
    background: '#FAF9F6',
    boxSizing: 'border-box' as const,
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
