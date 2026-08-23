'use client';

import { animate, createScope } from 'animejs';
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

const modules = [
  {
    code: '01',
    name: 'Reservas',
    text: 'Tus clientes eligen servicio, profesional, fecha y horario.',
  },
  {
    code: '02',
    name: 'Agenda',
    text: 'Organiza citas, bloqueos y el ritmo diario de tu equipo.',
  },
  {
    code: '03',
    name: 'Clientes',
    text: 'Historial, notas y próximas citas en una misma vista.',
  },
  {
    code: '04',
    name: 'Caja',
    text: 'Ventas, gastos y movimientos claros cada día.',
  },
  {
    code: '05',
    name: 'Inventario',
    text: 'Productos, existencias y alertas de stock bajo.',
  },
] as const;

export function ModuleDeck() {
  const deckRef = useRef<HTMLDivElement>(null);
  const startX = useRef<number | null>(null);
  const dragRef = useRef(0);
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const deck = deckRef.current;
    if (!deck) return;

    const scope = createScope({ root: deck }).add(() => {
      deck
        .querySelectorAll<HTMLElement>('[data-deck-offset]')
        .forEach((card) => {
          const offset = Number(card.dataset.deckOffset);
          animate(card, {
            x: offset * 14,
            y: offset * -9,
            scale: 1 - offset * 0.045,
            rotate: offset * 2,
            opacity: offset > 2 ? 0 : 1,
            duration: 460,
            ease: 'outExpo',
          });
        });
    });

    return () => scope.revert();
  }, [active]);

  const move = (direction: number) => {
    setActive(
      (current) => (current + direction + modules.length) % modules.length,
    );
    dragRef.current = 0;
  };

  const getActiveCard = () =>
    deckRef.current?.querySelector<HTMLElement>('[data-deck-active="true"]');

  return (
    <div
      aria-label="Módulos de Nava"
      className="module-deck"
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') move(-1);
        if (event.key === 'ArrowRight') move(1);
      }}
      onPointerDown={(event) => {
        startX.current = event.clientX;
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (startX.current === null) return;
        const drag = event.clientX - startX.current;
        dragRef.current = drag;
        const card = getActiveCard();
        if (!card) return;
        animate(card, {
          x: drag,
          y: Math.abs(drag) * -0.035,
          rotate: drag * 0.025,
          duration: 0,
        });
      }}
      onPointerUp={() => {
        const drag = dragRef.current;
        if (Math.abs(drag) > 48) move(drag > 0 ? -1 : 1);
        else {
          const card = getActiveCard();
          if (card)
            animate(card, {
              x: 0,
              y: 0,
              rotate: 0,
              duration: 360,
              ease: 'outElastic(1, .7)',
            });
        }
        startX.current = null;
        dragRef.current = 0;
      }}
      ref={deckRef}
      role="group"
      tabIndex={0}
    >
      {modules.map((module, index) => {
        const offset = (index - active + modules.length) % modules.length;
        const isActive = offset === 0;
        return (
          <article
            className="module-card"
            data-deck-active={isActive}
            data-deck-offset={offset}
            key={module.code}
            style={
              {
                pointerEvents: isActive ? 'auto' : 'none',
                zIndex: 10 - offset,
              } as CSSProperties
            }
          >
            <span>{module.code}</span>
            <i aria-hidden="true">N</i>
            <h3>{module.name}</h3>
            <p>{module.text}</p>
            <small>
              {isActive ? 'Arrastra o usa las flechas' : 'Nava · Módulo'}
            </small>
          </article>
        );
      })}
      <div aria-hidden="true" className="deck-dots">
        {modules.map((module, index) => (
          <i className={index === active ? 'active' : ''} key={module.code} />
        ))}
      </div>
    </div>
  );
}
