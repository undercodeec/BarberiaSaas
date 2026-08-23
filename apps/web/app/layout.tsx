import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { CookieConsent } from './components/CookieConsent';
import './globals.css';

export const metadata: Metadata = {
  title: 'Nava | La plataforma para tu barbería',
  description:
    'Agenda, reservas, clientes y operación para barberías que se mueven.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#1b1d19',
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="es">
      <body>
        {children}
        <CookieConsent />
      </body>
    </html>
  );
}
