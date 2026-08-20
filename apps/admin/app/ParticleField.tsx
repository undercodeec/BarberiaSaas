'use client';

import { animate, createScope, utils } from 'animejs';
import { useEffect, useRef } from 'react';

const PARTICLE_COUNT = 56;

export default function ParticleField({
  className,
}: {
  readonly className?: string | undefined;
}) {
  const fieldRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const field = fieldRef.current;
    if (
      !field ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }

    const scope = createScope({ root: field }).add(() => {
      const particles = Array.from(
        field.querySelectorAll<HTMLElement>('[data-login-particle]'),
      );

      utils.set(particles, {
        x: () => utils.random(-340, 340),
        y: () => utils.random(-440, 440),
        opacity: () => utils.random(0.2, 0.92, 2),
        scale: () => utils.random(0.35, 1.55, 2),
      });

      animate(particles, {
        x: () => utils.random(-340, 340),
        y: () => utils.random(-440, 440),
        opacity: () => utils.random(0.18, 0.95, 2),
        scale: () => utils.random(0.3, 1.7, 2),
        duration: () => utils.random(4200, 9400),
        delay: () => utils.random(0, 1600),
        ease: 'inOutSine',
        alternate: true,
        loop: true,
        onLoop: (animation) => animation.refresh(),
      });
    });

    return () => scope.revert();
  }, []);

  return (
    <div aria-hidden="true" className={className} ref={fieldRef}>
      {Array.from({ length: PARTICLE_COUNT }, (_, index) => (
        <span data-login-particle="" key={index} />
      ))}
    </div>
  );
}
