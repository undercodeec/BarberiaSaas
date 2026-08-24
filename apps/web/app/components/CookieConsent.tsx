'use client';

import { type CSSProperties, useEffect, useState } from 'react';

const STORAGE_KEY = 'nava.cookie-consent.v1';
const PRIVACY_URL = 'https://navacloud.app/tratamiento-de-datos';
const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();

type ConsentChoice = 'accepted' | 'rejected';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

function configureAnalytics(consent: ConsentChoice) {
  if (!GA_MEASUREMENT_ID) return;
  window.dataLayer ??= [];
  window.gtag ??= (...args: unknown[]) => window.dataLayer?.push(args);
  window.gtag('consent', 'update', {
    analytics_storage: consent === 'accepted' ? 'granted' : 'denied',
  });
  if (consent !== 'accepted') return;
  if (document.querySelector('script[data-nava-ga4]')) return;
  const script = document.createElement('script');
  script.async = true;
  script.dataset.navaGa4 = 'true';
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_MEASUREMENT_ID)}`;
  script.onload = () => {
    window.gtag?.('js', new Date());
    window.gtag?.('config', GA_MEASUREMENT_ID, { anonymize_ip: true });
  };
  document.head.append(script);
}

export function CookieConsent() {
  const [choice, setChoice] = useState<ConsentChoice | null>(null);
  const [configured, setConfigured] = useState(false);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === 'accepted' || stored === 'rejected') {
        setChoice(stored);
        setAnalyticsEnabled(stored === 'accepted');
        configureAnalytics(stored);
      }
    });
  }, []);

  const save = (next: ConsentChoice) => {
    window.localStorage.setItem(STORAGE_KEY, next);
    setChoice(next);
    setConfigured(false);
    setAnalyticsEnabled(next === 'accepted');
    configureAnalytics(next);
  };

  if (choice && !configured) {
    return (
      <button
        aria-label="Modificar preferencias de cookies"
        onClick={() => setConfigured(true)}
        style={styles.reopenButton}
        type="button"
      >
        Cookies
      </button>
    );
  }

  return (
    <aside
      aria-label="Preferencias de cookies"
      role="dialog"
      style={styles.card}
    >
      <strong style={styles.title}>Tu privacidad importa</strong>
      <p style={styles.copy}>
        Usamos cookies esenciales para operar el sitio. La analítica de Google
        Analytics 4 solo se activa si la autorizas.
      </p>
      {configured ? (
        <label style={styles.preference}>
          <input
            checked={analyticsEnabled}
            onChange={(event) => setAnalyticsEnabled(event.target.checked)}
            type="checkbox"
          />
          Permitir cookies de analítica
        </label>
      ) : null}
      <a
        href={PRIVACY_URL}
        rel="noreferrer"
        style={styles.link}
        target="_blank"
      >
        Consultar Política de Privacidad
      </a>
      <div style={styles.actions}>
        {configured ? (
          <button
            onClick={() => save(analyticsEnabled ? 'accepted' : 'rejected')}
            style={styles.primaryButton}
            type="button"
          >
            Guardar preferencias
          </button>
        ) : (
          <>
            <button
              onClick={() => save('rejected')}
              style={styles.secondaryButton}
              type="button"
            >
              Rechazar
            </button>
            <button
              onClick={() => setConfigured(true)}
              style={styles.secondaryButton}
              type="button"
            >
              Configurar
            </button>
            <button
              onClick={() => save('accepted')}
              style={styles.primaryButton}
              type="button"
            >
              Aceptar
            </button>
          </>
        )}
      </div>
    </aside>
  );
}

const styles: Record<string, CSSProperties> = {
  actions: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  card: {
    background: '#fffdf8',
    border: '1px solid #d9cdb9',
    borderRadius: 16,
    bottom: 16,
    boxShadow: '0 14px 36px rgba(0, 0, 0, 0.18)',
    color: '#171717',
    fontFamily: 'Arial, sans-serif',
    left: 16,
    maxWidth: 440,
    padding: 20,
    position: 'fixed',
    right: 16,
    zIndex: 100,
  },
  copy: { fontSize: 14, lineHeight: 1.45, margin: '8px 0' },
  link: {
    color: '#805a12',
    display: 'inline-block',
    fontSize: 13,
    fontWeight: 700,
  },
  preference: {
    alignItems: 'center',
    display: 'flex',
    fontSize: 14,
    gap: 8,
    marginTop: 12,
  },
  primaryButton: {
    background: '#171717',
    border: 0,
    borderRadius: 8,
    color: '#fff',
    cursor: 'pointer',
    flex: 1,
    fontWeight: 700,
    minHeight: 40,
    padding: '8px 12px',
  },
  reopenButton: {
    background: '#fffdf8',
    border: '1px solid #d9cdb9',
    borderRadius: 999,
    bottom: 16,
    color: '#171717',
    cursor: 'pointer',
    fontWeight: 700,
    padding: '9px 14px',
    position: 'fixed',
    right: 16,
    zIndex: 100,
  },
  secondaryButton: {
    background: '#fffdf8',
    border: '1px solid #766d61',
    borderRadius: 8,
    color: '#171717',
    cursor: 'pointer',
    flex: 1,
    fontWeight: 700,
    minHeight: 40,
    padding: '8px 12px',
  },
  title: { display: 'block', fontSize: 17 },
};
