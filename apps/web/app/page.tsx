import { designTokens } from '@barber-saas/design-tokens';

const foundations = [
  'Aplicación móvil operativa',
  'Reservas web sin instalar nada',
  'Backend multi-tenant preparado',
];

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[var(--surface)] text-[var(--ink)]">
      <div aria-hidden="true" className="ambient ambient-top" />
      <div aria-hidden="true" className="ambient ambient-bottom" />
      <section className="relative mx-auto flex min-h-screen max-w-6xl flex-col justify-between px-6 py-8 sm:px-10 lg:px-16 lg:py-12">
        <header className="flex items-center justify-between">
          <div
            className="flex items-center gap-3"
            aria-label="Plataforma para barberías"
          >
            <span className="brand-mark" aria-hidden="true">
              B
            </span>
            <span className="text-sm font-bold tracking-[0.22em] uppercase">
              Barber OS
            </span>
          </div>
          <span className="status-pill">Fase 0 completada</span>
        </header>

        <div className="grid items-center gap-14 py-16 lg:grid-cols-[1.2fr_0.8fr] lg:gap-20">
          <div>
            <p className="eyebrow">Hecho para el ritmo del local</p>
            <h1 className="mt-5 max-w-3xl text-5xl leading-[0.94] font-black tracking-[-0.055em] sm:text-7xl lg:text-8xl">
              Tu barbería,
              <span className="block text-[var(--accent)]">bajo control.</span>
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-8 text-[var(--muted)] sm:text-xl">
              Una base móvil-first para administrar agenda, clientes y operación
              diaria desde cualquier lugar.
            </p>
          </div>

          <aside className="foundation-card" aria-labelledby="foundation-title">
            <div className="flex items-center justify-between border-b border-white/10 pb-5">
              <div>
                <p className="text-xs font-bold tracking-[0.18em] text-[var(--accent)] uppercase">
                  Infraestructura
                </p>
                <h2 id="foundation-title" className="mt-1 text-2xl font-bold">
                  Base preparada
                </h2>
              </div>
              <span className="pulse-dot" aria-label="Sistema listo" />
            </div>
            <ul className="mt-2 divide-y divide-white/10">
              {foundations.map((foundation, index) => (
                <li className="flex items-center gap-4 py-5" key={foundation}>
                  <span className="step-number">0{index + 1}</span>
                  <span className="font-medium text-white/90">
                    {foundation}
                  </span>
                </li>
              ))}
            </ul>
          </aside>
        </div>

        <footer className="flex flex-col gap-2 border-t border-white/10 pt-5 text-sm text-[var(--muted)] sm:flex-row sm:items-center sm:justify-between">
          <span>Arquitectura modular · TypeScript estricto</span>
          <span style={{ color: designTokens.colors.accent }}>
            Ecuador · Latinoamérica
          </span>
        </footer>
      </section>
    </main>
  );
}
