'use client';

import Image from 'next/image';
import { animate, createScope } from 'animejs';
import { useEffect, useRef, useState } from 'react';

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function PortalHero() {
  const sectionRef = useRef<HTMLElement>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const section = sectionRef.current;
    if (!section) return;
    let frame = 0;
    const scope = createScope({ root: section }).add(() => {
      const leftPanel =
        section.querySelector<HTMLElement>('.portal-panel-left');
      const rightPanel = section.querySelector<HTMLElement>(
        '.portal-panel-right',
      );
      const wordmark = section.querySelector<HTMLElement>('.portal-wordmark');
      const wordmarkLeft =
        wordmark?.querySelector<HTMLElement>('span:first-child');
      const wordmarkRight =
        wordmark?.querySelector<HTMLElement>('span:last-child');
      const content = section.querySelector<HTMLElement>(
        '.portal-nava-content',
      );
      const devices = section.querySelector<HTMLElement>('.portal-devices');
      const photo = section.querySelector<HTMLElement>('.portal-photo');
      const wash = section.querySelector<HTMLElement>('.portal-wash');
      const leftDot = section.querySelector<HTMLElement>('.portal-dot-left');
      const rightDot = section.querySelector<HTMLElement>('.portal-dot-right');
      if (
        !leftPanel ||
        !rightPanel ||
        !wordmark ||
        !wordmarkLeft ||
        !wordmarkRight ||
        !content ||
        !devices ||
        !photo ||
        !wash ||
        !leftDot ||
        !rightDot
      )
        return;

      const duration = 1000;
      const animations = [
        animate(leftPanel, {
          x: '-112%',
          duration,
          ease: 'linear',
          autoplay: false,
        }),
        animate(rightPanel, {
          x: '112%',
          duration,
          ease: 'linear',
          autoplay: false,
        }),
        animate(wordmark, {
          opacity: [1, 0],
          scale: [1, 1.18],
          letterSpacing: ['.12em', '-.02em'],
          duration,
          ease: 'linear',
          autoplay: false,
        }),
        animate(wordmarkLeft, {
          x: '47vw',
          duration,
          ease: 'linear',
          autoplay: false,
        }),
        animate(wordmarkRight, {
          x: '-47vw',
          duration,
          ease: 'linear',
          autoplay: false,
        }),
        animate(content, {
          opacity: [0, 1],
          y: [42, 0],
          duration,
          ease: 'linear',
          autoplay: false,
        }),
        animate(devices, {
          opacity: [0, 1],
          y: [120, 0],
          duration,
          ease: 'linear',
          autoplay: false,
        }),
        animate(photo, {
          scale: [1.12, 1],
          duration,
          ease: 'linear',
          autoplay: false,
        }),
        animate(wash, {
          opacity: [0, 0.16],
          duration,
          ease: 'linear',
          autoplay: false,
        }),
        animate(leftDot, {
          x: '-39vw',
          y: '-36vh',
          duration,
          ease: 'linear',
          autoplay: false,
        }),
        animate(rightDot, {
          x: '39vw',
          y: '36vh',
          duration,
          ease: 'linear',
          autoplay: false,
        }),
      ];

      const updateTimelines = (progress: number) => {
        animations.forEach((animation) => animation.seek(progress * duration));
      };
      const update = () => {
        frame = 0;
        const rect = section.getBoundingClientRect();
        const distance = Math.max(section.offsetHeight - window.innerHeight, 1);
        updateTimelines(clamp(-rect.top / distance));
      };
      const requestUpdate = () => {
        if (!frame) frame = window.requestAnimationFrame(update);
      };
      setIsReady(true);
      update();
      window.addEventListener('resize', requestUpdate, { passive: true });
      window.addEventListener('scroll', requestUpdate, { passive: true });
      return () => {
        window.removeEventListener('resize', requestUpdate);
        window.removeEventListener('scroll', requestUpdate);
        if (frame) window.cancelAnimationFrame(frame);
      };
    });
    return () => {
      scope.revert();
    };
  }, []);

  return (
    <section
      className="portal-hero"
      data-ready={isReady || undefined}
      ref={sectionRef}
    >
      <div className="portal-stage">
        <Image
          alt="Barbero atendiendo a un cliente en una barbería moderna"
          className="portal-photo"
          fill
          priority
          sizes="100vw"
          src="/images/nava-barbershop-hero.png"
        />
        <div aria-hidden="true" className="portal-wash" />
        <div aria-hidden="true" className="portal-veil" />
        <div className="portal-meta portal-meta-top">
          <span>Nava · Gestión para barberías</span>
          <span>Ecuador · Latinoamérica</span>
        </div>
        <div className="portal-meta portal-meta-bottom">
          <span>Agenda · Reservas · Operación</span>
          <span>Desliza para descubrir</span>
        </div>
        <div aria-hidden="true" className="portal-panel portal-panel-left" />
        <div aria-hidden="true" className="portal-panel portal-panel-right" />
        <i aria-hidden="true" className="portal-dot portal-dot-left" />
        <i aria-hidden="true" className="portal-dot portal-dot-right" />
        <div aria-label="Nava" className="portal-wordmark">
          <span>NA</span>
          <span>VA</span>
        </div>
        <div className="portal-nava-content">
          <p className="portal-label">Software para barberías</p>
          <h1>
            Haz crecer tu barbería con <em>más orden</em> y menos
            complicaciones.
          </h1>
          <p>
            Nava reúne tus reservas, agenda, clientes, caja, equipo e inventario
            en un solo lugar.
          </p>
          <div>
            <a
              className="gold-button"
              href="mailto:soporte@navacloud.app?subject=Quiero%20probar%20Nava"
            >
              Probar Nava gratis <span>→</span>
            </a>
            <a className="portal-link" href="#funciones">
              Conocer funciones
            </a>
          </div>
          <ul>
            <li>Configuración sencilla</li>
            <li>Gestiona desde tu móvil</li>
            <li>10 días para probar Nava</li>
          </ul>
        </div>
        <div className="portal-devices">
          <Image
            alt="Aplicación Nava para gestionar el negocio y recibir reservas"
            height={1024}
            sizes="(max-width: 700px) 90vw, 48vw"
            src="/images/hero.png"
            width={920}
          />
          <span className="portal-card card-sales">$245 en ventas</span>
          <span className="portal-card card-appointment">
            Próxima cita · 10:30
          </span>
          <span className="portal-card card-stock">
            Stock bajo · 3 productos
          </span>
        </div>
      </div>
    </section>
  );
}
