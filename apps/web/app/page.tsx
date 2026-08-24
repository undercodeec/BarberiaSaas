'use client';

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from 'react';

const trialLink = 'mailto:soporte@navacloud.app?subject=Quiero%20probar%20Nava';
const modules = [
  'Reservas 24/7',
  'Agenda del equipo',
  'Clientes e historial',
  'Caja y ventas',
  'Comisiones',
  'Inventario',
  'Reportes',
] as const;
const plans = [
  ['Nava Free', 'Para conocer Nava'],
  ['Nava Esencial', 'Operación individual'],
  ['Nava Local', 'Barbería completa'],
  ['Nava Multi', 'Más de una sede'],
] as const;

function Arrow() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="17"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      width="17"
    >
      <path d="M5 12h14m-5-5 5 5-5 5" />
    </svg>
  );
}

function Mark() {
  return (
    <span aria-hidden="true" className="nava-mark">
      <i />
      <i />
      <i />
    </span>
  );
}

function Logo() {
  return (
    <a aria-label="Nava, inicio" className="portal-logo" href="#inicio">
      <Mark />
      <span>NAVA</span>
    </a>
  );
}

export default function HomePage() {
  const portalRef = useRef<HTMLElement>(null);
  const deckSectionRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<number | null>(null);
  const [portalProgress, setPortalProgress] = useState(0);
  const [storyProgress, setStoryProgress] = useState(0);
  const [scrollDeckStep, setScrollDeckStep] = useState(0);
  const [deck, setDeck] = useState<readonly (typeof modules)[number][]>([
    ...modules,
  ]);
  const [deckDirection, setDeckDirection] = useState(1);
  const [dragOffset, setDragOffset] = useState(0);
  const [passingCard, setPassingCard] = useState<
    (typeof modules)[number] | null
  >(null);
  const [returningCard, setReturningCard] = useState<
    (typeof modules)[number] | null
  >(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const updateMotion = () => {
      const portal = portalRef.current;
      if (portal) {
        const top = portal.getBoundingClientRect().top;
        const distance = window.innerHeight * 1.15;
        setPortalProgress(Math.min(1, Math.max(0, -top / distance)));
      }
      const deckSection = deckSectionRef.current;
      if (deckSection) {
        const rect = deckSection.getBoundingClientRect();
        const range = Math.max(1, rect.height - window.innerHeight);
        const progress = Math.min(1, Math.max(0, -rect.top / range));
        const deckProgress = Math.min(1, Math.max(0, (progress - 0.65) / 0.35));
        setStoryProgress(progress);
        setScrollDeckStep(
          Math.min(
            modules.length - 1,
            Math.floor(deckProgress * modules.length),
          ),
        );
      }
    };
    updateMotion();
    window.addEventListener('scroll', updateMotion, { passive: true });
    return () => window.removeEventListener('scroll', updateMotion);
  }, []);

  const deckIndex = modules.indexOf(deck[0]!);
  const shiftDeck = (direction: number) => {
    if (passingCard || returningCard) return;
    setDeckDirection(direction);
    if (direction < 0) {
      const lastCard = deck[deck.length - 1]!;
      setReturningCard(lastCard);
      window.setTimeout(() => {
        setDeck((current) => [lastCard, ...current.slice(0, -1)]);
        window.setTimeout(() => setReturningCard(null), 30);
      }, 820);
      return;
    }
    const currentCard = deck[0]!;
    setPassingCard(currentCard);
    window.setTimeout(() => {
      setDeck((current) => [...current.slice(1), current[0]!]);
      window.setTimeout(() => setPassingCard(null), 110);
    }, 420);
  };
  const showDeckCard = (module: (typeof modules)[number]) => {
    if (deck[0] === module) return;
    const targetIndex = deck.indexOf(module);
    setDeckDirection(targetIndex > 0 ? 1 : -1);
    setDeck((current) => [
      ...current.slice(targetIndex),
      ...current.slice(0, targetIndex),
    ]);
  };
  useEffect(() => {
    if (
      isDragging ||
      passingCard ||
      returningCard ||
      scrollDeckStep === deckIndex
    )
      return;
    const timer = window.setTimeout(
      () => shiftDeck(scrollDeckStep > deckIndex ? 1 : -1),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [deckIndex, isDragging, passingCard, returningCard, scrollDeckStep]);
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    dragStart.current = event.clientX;
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (dragStart.current !== null)
      setDragOffset(event.clientX - dragStart.current);
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const start = dragStart.current;
    dragStart.current = null;
    setIsDragging(false);
    setDragOffset(0);
    if (start === null) return;
    const distance = event.clientX - start;
    if (Math.abs(distance) > 48) shiftDeck(distance < 0 ? 1 : -1);
  };
  const portalStyle = { '--portal-progress': portalProgress } as CSSProperties;

  return (
    <main id="inicio">
      <header className="portal-nav">
        <Logo />
        <nav aria-label="Navegación principal">
          <a href="#operacion">Operación</a>
          <a href="#modulos">Módulos</a>
          <a href="#planes">Planes</a>
        </nav>
        <a className="portal-nav-cta" href={trialLink}>
          Probar Nava <Arrow />
        </a>
      </header>

      <section className="portal-hero" ref={portalRef} style={portalStyle}>
        <div className="portal-stage">
          <div className="portal-photo" />
          <div className="portal-veil" />
          <div className="portal-panel portal-panel-left" />
          <div className="portal-panel portal-panel-right" />
          <span className="portal-dot portal-dot-left" />
          <span className="portal-dot portal-dot-right" />
          <div className="portal-meta portal-meta-top"></div>
          <h1 aria-label="Nava" className="portal-title">
            <span>NA</span>
            <span>VA</span>
          </h1>
          <div className="portal-detail">
            <div aria-hidden="true" className="portal-detail-image">
              <div className="hero-notification hero-notification-reservation">
                <span>●</span>
                <div>
                  <b>Nueva reserva</b>
                  <small>Agenda Nava · 10:30</small>
                </div>
              </div>
              <div className="hero-notification hero-notification-agenda">
                <span>✓</span>
                <div>
                  <b>Cita añadida</b>
                  <small>La agenda está actualizada</small>
                </div>
              </div>
              <div className="hero-notification hero-notification-client">
                <span>●</span>
                <div>
                  <b>Cliente registrado</b>
                  <small>Historial listo para consultar</small>
                </div>
              </div>
              <div className="hero-notification hero-notification-cash">
                <span>$</span>
                <div>
                  <b>Venta registrada</b>
                  <small>Caja actualizada</small>
                </div>
              </div>
            </div>
            <div className="portal-detail-copy">
              <p>Software para barberías</p>
              <h2>
                Haz crecer tu barbería con más orden y menos complicaciones.
              </h2>
              <span>
                Nava reúne reservas, agenda, clientes, caja, equipo e inventario
                en un solo lugar.
              </span>
              <div>
                <a href={trialLink}>
                  Probar Nava gratis <Arrow />
                </a>
              </div>
            </div>
          </div>
          <div className="portal-meta portal-meta-bottom">
            <span>Reservas · Agenda · Operación</span>
          </div>
        </div>
      </section>

      <div
        className="statement-scroll"
        ref={deckSectionRef}
        style={{ '--story-progress': storyProgress } as CSSProperties}
      >
        <section className="statement-fold" id="operacion">
          <div className="statement-content">
          <p className="portal-label">Nava / Operación</p>
          <h2>
            Haz crecer tu barbería con <em>más orden</em> y menos
            complicaciones.
          </h2>
          <p>
            Nava reúne reservas, agenda, clientes, caja, equipo e inventario en
            un solo lugar.
          </p>
          <a className="portal-text-link" href={trialLink}>
            Probar Nava gratis <Arrow />
          </a>
          </div>
          <span aria-hidden="true" className="statement-index">
            01
          </span>
          <div aria-hidden="true" className="statement-orbit">
            <Mark />
          </div>
          <section
        className={
          storyProgress >= 0.65 ? 'deck-section is-active' : 'deck-section'
        }
        id="modulos"
      >
        <div className="deck-stage">
          <div className="deck-copy">
            <p className="portal-label">Módulos Nava</p>
            <h2>
              La operación de tu barbería, organizada como una sola experiencia.
            </h2>
            <p>
              Menos herramientas separadas. Más control desde un solo lugar.
            </p>
            <div className="deck-actions">
             
            </div>
          </div>
          <div
            aria-label="Módulos Nava"
            className={isDragging ? 'module-deck is-dragging' : 'module-deck'}
            onKeyDown={(event) => {
              if (event.key === 'ArrowLeft') shiftDeck(-1);
              if (event.key === 'ArrowRight') shiftDeck(1);
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            style={
              {
                '--deck-direction': deckDirection,
                '--deck-drag': `${dragOffset}px`,
              } as CSSProperties
            }
            tabIndex={0}
          >
            {deck.map((module, position) => {
              const originalIndex = modules.indexOf(module);
              return (
                <article
                  className={
                    passingCard === module
                      ? 'deck-card is-passing'
                      : returningCard === module
                        ? 'deck-card is-returning'
                        : 'deck-card'
                  }
                  data-position={position}
                  key={module}
                  style={{ '--deck-position': position } as CSSProperties}
                >
                  <span>0{originalIndex + 1}</span>
                  <h3>{module}</h3>
                  <div>
                    <Mark />
                    <small>Nava</small>
                  </div>
                </article>
              );
            })}
          </div>
          <div className="deck-hint">
            <div className="deck-pagination">
              {modules.map((module, index) => (
                <button
                  aria-label={`Mostrar ${module}`}
                  aria-pressed={index === deckIndex}
                  className={index === deckIndex ? 'active' : ''}
                  key={module}
                  onClick={() => {
                    showDeckCard(module);
                  }}
                  type="button"
                />
              ))}
            </div>
          </div>
        </div>
          </section>
        </section>
      </div>

      <section className="module-roster">
        <p className="portal-label">Una plataforma</p>
        {modules.map((module, index) => (
          <article key={module}>
            <span>0{index + 1}</span>
            <h2>{module}</h2>
            <small>Nava</small>
          </article>
        ))}
      </section>

      <section className="plans-table-section" id="planes">
        <div className="plans-heading">
          <p className="portal-label">Planes Nava</p>
          <h2>Un plan para cada momento de tu negocio.</h2>
          <p>
            Prueba Nava durante 10 días. Después, tu cuenta pasa a Nava Free.
          </p>
        </div>
        <div className="plan-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Plan</th>
                <th>Para quién</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {plans.map(([name, description]) => (
                <tr key={name}>
                  <td>{name}</td>
                  <td>{description}</td>
                  <td>
                    <a href={trialLink} aria-label={`Probar ${name}`}>
                      <Arrow />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="portal-close">
        <div>
          <p className="portal-label">Nava</p>
          <h2>Tu negocio merece trabajar con más orden.</h2>
          <p>10 días para conocer Nava.</p>
        </div>
        <div className="close-actions">
          <a className="portal-button portal-button-primary" href={trialLink}>
            Probar Nava gratis <Arrow />
          </a>
        </div>
        <div className="close-rule">
          <span>© {new Date().getFullYear()} Nava · Ecuador</span>
          <a href="mailto:soporte@navacloud.app">soporte@navacloud.app</a>
        </div>
        <div aria-hidden="true" className="close-wordmark">
          NAVA
        </div>
      </section>
    </main>
  );
}
