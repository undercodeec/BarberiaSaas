'use client';

import { animate } from 'animejs';
import { useEffect, useRef, useState, type CSSProperties } from 'react';

const trialLink = '/suscripciones';
const portalMenuItems = [
  { href: '/', label: 'Inicio', number: '01' },
  { href: '/suscripciones', label: 'Suscripciones', number: '02' },
  { href: '/politicas', label: 'Políticas', number: '03' },
  { href: 'https://wa.me/593979046329', label: 'Soporte', number: '04' },
] as const;
const modules = [
  'Reservas 24/7',
  'Colaboradores',
  'Clientes',
  'Caja y ventas',
  'Comisiones',
  'Inventario',
  'Reportes',
] as const;
const cardPreviews = [
  { ratio: '810 / 1402', source: 'card1.jpeg' },
  { ratio: '1122 / 1402', source: 'card2.png' },
  { ratio: '810 / 1402', source: 'card3.png' },
  { ratio: '844 / 1402', source: 'card4.png' },
  { ratio: '1007 / 1402', source: 'card5.png' },
  { ratio: '1007 / 1402', source: 'card6.png' },
  { ratio: '958 / 1402', source: 'card7.png' },
] as const;
const plans = [
  {
    benefits: [
      ['Profesionales', '1 profesional operativo'],
      ['Sucursales', '1 sucursal'],
      ['Reservas', '25 en los últimos 30 días'],
      ['Clientes', '100 clientes activos'],
      ['Reservas online', 'Agenda y reservas públicas'],
      ['Operación', 'Caja y reportes básicos'],
    ],
    description: 'Lo esencial para ordenar tus primeros días con Nava.',
    name: 'Nava Free',
    price: 'Gratis',
    summary: 'Para conocer Nava',
  },
  {
    benefits: [
      ['Profesionales', '1 profesional activo'],
      ['Sucursales', '1 sucursal'],
      ['Reservas', 'Ilimitadas'],
      ['Clientes', 'Ilimitados'],
      ['Reservas online', 'Agenda y reservas públicas'],
      ['Operación', 'Caja e informes esenciales'],
    ],
    description: 'Para quien atiende solo y quiere operar sin límites.',
    name: 'Nava Esencial',
    price: '$9.83',
    summary: 'Operación individual',
  },
  {
    benefits: [
      ['Profesionales', 'Ilimitados, sin cobro por usuario'],
      ['Sucursales', 'Hasta 3 sucursales'],
      ['Reservas y clientes', 'Ilimitados'],
      ['Cobros', 'Caja, POS y comisiones'],
      ['Gestión', 'Inventario, roles y permisos'],
      ['Reservas directas', '0% de comisión'],
    ],
    description:
      'La operación completa para un local que ya trabaja en equipo.',
    name: 'Nava Local',
    price: '$29.83',
    summary: 'Barbería completa',
  },
  {
    benefits: [
      ['Profesionales', 'Ilimitados, sin cobro por usuario'],
      ['Sucursales', 'Hasta 6 sucursales'],
      ['Reservas y clientes', 'Ilimitados'],
      ['Cobros', 'Caja, POS, comisiones e inventario por sede'],
      ['Gestión', 'Reportes completos, roles y permisos'],
      ['Reservas directas', '0% de comisión'],
    ],
    description:
      'Visibilidad y control unificado para hacer crecer varias sedes.',
    name: 'Nava Multi',
    price: '$48.83',
    summary: 'Más de una sede',
  },
] as const;

type FixedSectionMetrics = {
  height: number;
  left: number;
  top: number;
  width: number;
};

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

function Chevron() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="18"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      width="18"
    >
      <path d="m6 9 6 6 6-6" />
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
      <img alt="Nava" src="/images/nava-logo.png" />
    </a>
  );
}

export default function HomePage() {
  const portalRef = useRef<HTMLElement>(null);
  const deckSectionRef = useRef<HTMLDivElement>(null);
  const plansTableRef = useRef<HTMLElement>(null);
  const portalCloseRef = useRef<HTMLElement>(null);
  const closeModelRef = useRef<HTMLDivElement>(null);
  const plansHoldRef = useRef(false);
  const closeModelHasEnteredRef = useRef(false);
  const storyProgressRef = useRef(0);
  const deckTransitionRef = useRef(false);
  const deckWheelDistanceRef = useRef(0);
  const deckTouchDistanceRef = useRef(0);
  const deckTouchYRef = useRef<number | null>(null);
  const [portalProgress, setPortalProgress] = useState(0);
  const [storyProgress, setStoryProgress] = useState(0);
  const [deck, setDeck] = useState<readonly (typeof modules)[number][]>([
    ...modules,
  ]);
  const [deckDirection, setDeckDirection] = useState(1);
  const [passingCard, setPassingCard] = useState<
    (typeof modules)[number] | null
  >(null);
  const [returningCard, setReturningCard] = useState<
    (typeof modules)[number] | null
  >(null);
  const [expandedPlan, setExpandedPlan] = useState<string | null>(null);
  const [plansHold, setPlansHold] = useState<FixedSectionMetrics | null>(null);
  const [closeProgress, setCloseProgress] = useState(0);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

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
        storyProgressRef.current = progress;
        setStoryProgress(progress);
      }

      const plansTable = plansTableRef.current;
      const portalClose = portalCloseRef.current;
      if (plansTable && portalClose) {
        const closeTop = portalClose.getBoundingClientRect().top;
        setCloseProgress(
          Math.min(
            1,
            Math.max(0, (window.innerHeight - closeTop) / window.innerHeight),
          ),
        );
        const shouldHoldPlans = closeTop > 0 && closeTop < window.innerHeight;

        if (shouldHoldPlans && !plansHoldRef.current) {
          const rect = plansTable.getBoundingClientRect();
          plansHoldRef.current = true;
          setPlansHold({
            height: rect.height,
            left: rect.left,
            top: rect.top,
            width: rect.width,
          });
        } else if (!shouldHoldPlans && plansHoldRef.current) {
          plansHoldRef.current = false;
          setPlansHold(null);
        }
      }
    };
    updateMotion();
    window.addEventListener('scroll', updateMotion, { passive: true });
    return () => window.removeEventListener('scroll', updateMotion);
  }, []);

  useEffect(() => {
    const model = closeModelRef.current;
    if (!model) return;

    if (closeProgress < 0.06) {
      closeModelHasEnteredRef.current = false;
      model.style.removeProperty('opacity');
      model.style.removeProperty('transform');
      return;
    }

    if (
      closeModelHasEnteredRef.current ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }

    closeModelHasEnteredRef.current = true;
    const entranceOffset = Math.round(
      Math.min(320, Math.max(150, window.innerWidth * 0.24)),
    );

    animate(model, {
      duration: 1350,
      ease: 'inOutSine',
      opacity: [0, 1, 1],
      scale: [0.82, 1.035, 1],
      x: [entranceOffset, -18, 0],
    });
  }, [closeProgress]);

  const deckIndex = modules.indexOf(deck[0]!);
  const shiftDeck = (direction: number) => {
    if (deckTransitionRef.current) return;
    deckTransitionRef.current = true;
    setDeckDirection(direction);
    if (direction < 0) {
      const lastCard = deck[deck.length - 1]!;
      setReturningCard(lastCard);
      window.setTimeout(() => {
        setDeck((current) => [lastCard, ...current.slice(0, -1)]);
        window.setTimeout(() => {
          setReturningCard(null);
          deckTransitionRef.current = false;
        }, 30);
      }, 820);
      return;
    }
    const currentCard = deck[0]!;
    setPassingCard(currentCard);
    window.setTimeout(() => {
      setDeck((current) => [...current.slice(1), current[0]!]);
      window.setTimeout(() => {
        setPassingCard(null);
        deckTransitionRef.current = false;
      }, 110);
    }, 420);
  };
  useEffect(() => {
    const onWheel = (event: WheelEvent) => {
      if (window.matchMedia('(max-width: 800px)').matches) return;
      const isDeckSceneActive =
        storyProgressRef.current >= 0.65 && storyProgressRef.current < 1;
      const direction = Math.sign(event.deltaY);
      const canAdvance = direction > 0 && deckIndex < modules.length - 1;
      const canReturn = direction < 0 && deckIndex > 0;

      if (!isDeckSceneActive || event.ctrlKey || (!canAdvance && !canReturn)) {
        return;
      }

      event.preventDefault();
      if (deckTransitionRef.current) return;

      deckWheelDistanceRef.current += event.deltaY;
      if (Math.abs(deckWheelDistanceRef.current) < 70) return;

      const wheelDirection = Math.sign(deckWheelDistanceRef.current);
      deckWheelDistanceRef.current = 0;
      shiftDeck(wheelDirection);
    };

    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, [deck, deckIndex]);

  useEffect(() => {
    const onTouchStart = (event: TouchEvent) => {
      deckTouchDistanceRef.current = 0;
      deckTouchYRef.current = event.touches[0]?.clientY ?? null;
    };
    const onTouchMove = (event: TouchEvent) => {
      if (!window.matchMedia('(max-width: 800px)').matches) return;
      const touch = event.touches[0];
      const previousY = deckTouchYRef.current;
      if (!touch || previousY === null) return;
      deckTouchYRef.current = touch.clientY;
      const isDeckSceneActive =
        storyProgressRef.current >= 0.66 && storyProgressRef.current < 0.98;
      const delta = previousY - touch.clientY;
      const direction = Math.sign(delta);
      const canAdvance = direction > 0 && deckIndex < modules.length - 1;
      const canReturn = direction < 0 && deckIndex > 0;
      if (!isDeckSceneActive || (!canAdvance && !canReturn)) return;

      event.preventDefault();
      if (deckTransitionRef.current) return;
      deckTouchDistanceRef.current += delta;
      if (Math.abs(deckTouchDistanceRef.current) < 42) return;

      const deckDirection = Math.sign(deckTouchDistanceRef.current);
      deckTouchDistanceRef.current = 0;
      shiftDeck(deckDirection);
    };
    const resetTouch = () => {
      deckTouchDistanceRef.current = 0;
      deckTouchYRef.current = null;
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', resetTouch, { passive: true });
    window.addEventListener('touchcancel', resetTouch, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', resetTouch);
      window.removeEventListener('touchcancel', resetTouch);
    };
  }, [deck, deckIndex]);

  useEffect(() => {
    if (!isMenuOpen) return;

    const previousOverflow = document.body.style.overflow;
    const closeFromKeyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMenuOpen(false);
    };

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', closeFromKeyboard);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeFromKeyboard);
    };
  }, [isMenuOpen]);

  const portalStyle = { '--portal-progress': portalProgress } as CSSProperties;

  return (
    <main id="inicio">
      <header className={isMenuOpen ? 'portal-nav is-menu-open' : 'portal-nav'}>
        <Logo />
        <nav aria-label="Navegación principal">
          <a href="#operacion">Operación</a>
          <a href="#modulos">Módulos</a>
          <a href="#planes">Planes</a>
        </nav>
        <button
          aria-controls="portal-menu-panel"
          aria-expanded={isMenuOpen}
          className="portal-menu-toggle"
          onClick={() => setIsMenuOpen((current) => !current)}
          type="button"
        >
          <span className="portal-menu-toggle-label" aria-hidden="true">
            Menu
          </span>
          <span className="portal-menu-toggle-icon" aria-hidden="true">
            <i />
            <i />
          </span>
        </button>
      </header>

      <div className={isMenuOpen ? 'portal-menu is-open' : 'portal-menu'}>
        <button
          aria-label="Cerrar men\u00fa"
          className="portal-menu-backdrop"
          onClick={() => setIsMenuOpen(false)}
          tabIndex={isMenuOpen ? 0 : -1}
          type="button"
        />
        <div aria-hidden="true" className="portal-menu-layers">
          <span data-menu-layer />
          <span data-menu-layer />
        </div>
        <aside
          aria-hidden={!isMenuOpen}
          aria-label="Men\u00fa principal"
          className="portal-menu-panel"
          id="portal-menu-panel"
        >
          <div className="portal-menu-kicker">
            <Mark />
            <span>Nava / Navegaci\u00f3n</span>
          </div>
          <nav aria-label="Secciones del portal" className="portal-menu-links">
            {portalMenuItems.map((item) => (
              <a
                data-menu-item
                href={item.href}
                key={item.href}
                onClick={() => setIsMenuOpen(false)}
              >
                <small>{item.number}</small>
                <span>{item.label}</span>
              </a>
            ))}
          </nav>
          <div className="portal-menu-footer">
            <p>Tu negocio, siempre en movimiento.</p>
            <a href={trialLink} onClick={() => setIsMenuOpen(false)}>
              Solicitar una demo <Arrow />
            </a>
          </div>
        </aside>
      </div>

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
              Nava reúne reservas, agenda, clientes, caja, equipo e inventario
              en un solo lugar.
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
          <div aria-hidden="true" className="statement-devices">
            <img
              alt=""
              className="statement-device statement-device-cash"
              src="/images/model.png"
            />
            <img
              alt=""
              className="statement-device statement-device-reservations"
              src="/images/model2.png"
            />
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
                  La operación de tu barbería, organizada como una sola
                  experiencia.
                </h2>
                <p>
                  Menos herramientas separadas. Más control desde un solo lugar.
                </p>
                <div className="deck-actions"></div>
              </div>
              <div
                aria-label="Módulos Nava"
                className="module-deck"
                style={
                  {
                    '--deck-direction': deckDirection,
                  } as CSSProperties
                }
              >
                {deck.map((module, position) => {
                  const originalIndex = modules.indexOf(module);
                  const preview =
                    originalIndex < cardPreviews.length
                      ? cardPreviews[originalIndex]!
                      : null;
                  const hasPreview = preview !== null;
                  const goldGradientId = `deck-gold-ribbon-${originalIndex}`;
                  const lightGradientId = `deck-light-ribbon-${originalIndex}`;
                  const cardMotionClass =
                    passingCard === module
                      ? 'is-passing'
                      : returningCard === module
                        ? 'is-returning'
                        : '';
                  return (
                    <article
                      className={[
                        'deck-card',
                        'has-wave',
                        hasPreview ? 'has-preview' : '',
                        cardMotionClass,
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      data-position={position}
                      key={module}
                      style={{ '--deck-position': position } as CSSProperties}
                    >
                      <span>0{originalIndex + 1}</span>
                      <h3>{module}</h3>
                      <svg
                        aria-hidden="true"
                        className="deck-card-wavefield"
                        preserveAspectRatio="none"
                        viewBox="0 0 440 440"
                      >
                        <defs>
                          <linearGradient id={goldGradientId} x1="0%" x2="100%">
                            <stop offset="0" stopColor="#fff" stopOpacity="0" />
                            <stop offset="0.42" stopColor="#c89449" />
                            <stop offset="0.7" stopColor="#fffaf0" />
                            <stop
                              offset="1"
                              stopColor="#c89449"
                              stopOpacity="0"
                            />
                          </linearGradient>
                          <linearGradient
                            id={lightGradientId}
                            x1="0%"
                            x2="100%"
                          >
                            <stop
                              offset="0"
                              stopColor="#c89449"
                              stopOpacity="0"
                            />
                            <stop offset="0.36" stopColor="#fff" />
                            <stop offset="0.65" stopColor="#d8a65c" />
                            <stop offset="1" stopColor="#fff" stopOpacity="0" />
                          </linearGradient>
                        </defs>
                        <path
                          className="deck-svg-wave deck-svg-ribbon-one"
                          d="M-70 390C68 340 53 180 205 120S384 42 510 -22"
                          stroke={`url(#${goldGradientId})`}
                        />
                        <path
                          className="deck-svg-wave deck-svg-ribbon-two"
                          d="M-70 335C80 286 90 120 240 88S387 18 510 -45"
                          stroke={`url(#${lightGradientId})`}
                        />
                        <path
                          className="deck-svg-wave deck-svg-ribbon-three"
                          d="M-78 432C82 365 95 250 242 192S372 98 510 36"
                          stroke={`url(#${goldGradientId})`}
                        />
                        <path
                          className="deck-svg-wave deck-svg-ribbon-four"
                          d="M-65 267C71 241 92 79 215 43S391 -10 502 -85"
                          stroke={`url(#${lightGradientId})`}
                        />
                        <path
                          className="deck-svg-wave deck-svg-ribbon-five"
                          d="M-75 470C55 412 87 306 231 252S389 180 505 106"
                          stroke={`url(#${goldGradientId})`}
                        />
                        <g className="deck-svg-particles">
                          <circle cx="72" cy="306" r="3" />
                          <circle cx="128" cy="250" r="2" />
                          <circle cx="178" cy="188" r="3" />
                          <circle cx="236" cy="137" r="2" />
                          <circle cx="294" cy="102" r="3" />
                          <circle cx="354" cy="58" r="2" />
                        </g>
                      </svg>
                      {hasPreview ? (
                        <div
                          className="deck-card-device"
                          style={
                            {
                              '--preview-ratio': preview.ratio,
                            } as CSSProperties
                          }
                        >
                          <img
                            alt={`Vista del módulo ${module} en Nava`}
                            className="deck-card-preview"
                            src={`/images/${preview.source}`}
                          />
                        </div>
                      ) : null}
                      <div>
                        <Mark />
                        <small>Nava</small>
                      </div>
                    </article>
                  );
                })}
              </div>
              <div aria-hidden="true" className="deck-hint">
                <div className="deck-pagination">
                  {modules.map((module, index) => (
                    <span
                      className={index === deckIndex ? 'active' : ''}
                      key={module}
                    />
                  ))}
                </div>
              </div>
            </div>
          </section>
        </section>
      </div>

      <div
        className="plans-table-stage"
        style={plansHold ? { height: plansHold.height } : undefined}
      >
        <section
          className={
            plansHold
              ? 'plans-table-section is-held-for-close'
              : 'plans-table-section'
          }
          id="planes"
          ref={plansTableRef}
          style={plansHold ?? undefined}
        >
          <div className="plans-heading">
            <p className="portal-label">Planes Nava</p>
            <h2>Un plan para cada momento de tu negocio.</h2>
            <p>
              Prueba Nava durante 10 días. Después, tu cuenta pasa a Nava Free.
            </p>
          </div>
          <div className="plan-table-wrap" role="list">
            <div aria-hidden="true" className="plan-table-head">
              <span>Plan</span>
              <span>Ideal para</span>
              <span>Explorar</span>
            </div>
            {plans.map((plan) => {
              const isExpanded = expandedPlan === plan.name;
              const panelId = `plan-${plan.name.toLowerCase().replaceAll(' ', '-')}`;
              return (
                <article
                  className={
                    isExpanded
                      ? 'plan-disclosure is-expanded'
                      : 'plan-disclosure'
                  }
                  key={plan.name}
                  role="listitem"
                >
                  <button
                    aria-controls={panelId}
                    aria-expanded={isExpanded}
                    className="plan-row-button"
                    onClick={() =>
                      setExpandedPlan((current) =>
                        current === plan.name ? null : plan.name,
                      )
                    }
                    type="button"
                  >
                    <span className="plan-row-name">
                      <small>Plan Nava</small>
                      <strong>{plan.name}</strong>
                    </span>
                    <span className="plan-row-summary">{plan.summary}</span>
                    <span className="plan-row-action">
                      <span>{isExpanded ? 'Cerrar' : 'Ver plan'}</span>
                      <i>
                        <Chevron />
                      </i>
                    </span>
                  </button>
                  <div className="plan-expander" id={panelId}>
                    <div className="plan-expander-inner">
                      <div className="plan-price-card">
                        <span>Inversión mensual</span>
                        <strong>{plan.price}</strong>
                        <small>
                          {plan.price === 'Gratis' ? 'sin costo' : 'USD / mes'}
                        </small>
                        <div aria-hidden="true" className="plan-phone-scene">
                          <img alt="" src="/images/model2.png" />
                          <div className="plan-preview-note plan-preview-note-reservation">
                            <span>✓</span>
                            <div>
                              <b>Reserva confirmada</b>
                              <small>Hoy · 10:30</small>
                            </div>
                          </div>
                          <div className="plan-preview-note plan-preview-note-cash">
                            <span>$</span>
                            <div>
                              <b>Caja al día</b>
                              <small>Venta registrada</small>
                            </div>
                          </div>
                          <div className="plan-preview-note plan-preview-note-client">
                            <span>+</span>
                            <div>
                              <b>Cliente nuevo</b>
                              <small>Historial creado</small>
                            </div>
                          </div>
                        </div>
                        <a href={trialLink}>
                          Empezar 10 días gratis <Arrow />
                        </a>
                      </div>
                      <div className="plan-detail-card">
                        <p>{plan.description}</p>
                        <table className="plan-feature-table">
                          <caption>Qué incluye {plan.name}</caption>
                          <tbody>
                            {plan.benefits.map(([feature, detail]) => (
                              <tr key={feature}>
                                <th scope="row">{feature}</th>
                                <td>{detail}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>

      <div className="portal-close-scroll">
        <section
          className="portal-close"
          ref={portalCloseRef}
          style={{ '--close-progress': closeProgress } as CSSProperties}
        >
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
          <div aria-hidden="true" className="close-model close-model-left">
            <img alt="" src="/images/model4.png" />
          </div>
          <div aria-hidden="true" className="close-model">
            <div className="close-model-motion" ref={closeModelRef}>
              <img alt="" src="/images/model3.png" />
            </div>
          </div>
          <div aria-hidden="true" className="close-wordmark">
            NAVA
          </div>
        </section>
      </div>
    </main>
  );
}
