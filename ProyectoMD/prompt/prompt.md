Aquí tienes **el prompt** y también el **contenido SVG base** para usarlo como fondo animado en tus cards.

## 1) Prompt

```text
Quiero recrear un fondo animado para cards usando SVG, con un estilo abstracto de ondas inclinadas y cintas fluidas entrelazadas, inspirado en la forma visual de una doble hélice de ADN.

Requisitos del diseño:
- Debe verse elegante, tecnológico y premium.
- No usar colores fijos en el diseño; el SVG debe funcionar tanto en dorado sobre negro como en negro sobre dorado.
- Para eso, usar currentColor o una estructura que permita cambiar el color desde CSS.
- El efecto debe componerse por:
  1. una cinta principal curva,
  2. una segunda cinta cruzada,
  3. varias líneas finas paralelas,
  4. partículas o puntos decorativos,
  5. un glow suave o sensación de profundidad.
- Las ondas deben ir en diagonal y entrelazarse suavemente.
- Debe existir bastante espacio negativo para que el contenido de la card siga siendo legible.

Requisitos de animación:
- El SVG debe incluir animación suave y continua en loop.
- Cada capa debe moverse a distinta velocidad para crear parallax.
- Las cintas deben oscilar levemente en horizontal y vertical.
- Las líneas finas deben dar sensación de flujo.
- Las partículas deben tener un desplazamiento sutil y cambios de opacidad.
- Todo debe ser muy suave, elegante y sin movimientos bruscos.

Requisitos técnicos:
- Entregar el resultado como contenido SVG reutilizable.
- Debe poder incrustarse dentro de una card HTML.
- Debe ser responsive.
- Debe funcionar bien como background decorativo.
- Debe usar una estructura limpia, editable y fácil de personalizar.

Además, entregar el SVG listo para que yo pueda controlar el color desde CSS con algo como:
.card .dna-bg { color: #C89449; }
o también:
.card.light .dna-bg { color: #111111; }

El resultado final debe ser un SVG animado, moderno y reutilizable.
```

---

## 2) Contenido SVG

Este SVG está pensado para que **funcione en ambos estilos**:

* **dorado sobre negro**
* **negro sobre dorado**

porque usa `currentColor`.

Solo cambias el color desde CSS.

```html
<svg
  class="dna-bg"
  viewBox="0 0 800 400"
  xmlns="http://www.w3.org/2000/svg"
  preserveAspectRatio="xMidYMid slice"
  aria-hidden="true"
>
  <defs>
    <!-- Gradiente basado en currentColor -->
    <linearGradient id="dnaGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="currentColor" stop-opacity="0.06"/>
      <stop offset="35%" stop-color="currentColor" stop-opacity="0.45"/>
      <stop offset="65%" stop-color="currentColor" stop-opacity="0.95"/>
      <stop offset="100%" stop-color="currentColor" stop-opacity="0.10"/>
    </linearGradient>

    <!-- Glow -->
    <filter id="dnaGlow" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="8" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>

  <!-- Glow de fondo -->
  <g opacity="0.18" filter="url(#dnaGlow)">
    <path
      d="M -100 285 C 80 95, 240 80, 400 215 C 555 345, 710 335, 905 105"
      fill="none"
      stroke="currentColor"
      stroke-width="28"
      stroke-linecap="round"
    >
      <animateTransform
        attributeName="transform"
        type="translate"
        values="-16 4; 10 -8; 24 6; -16 4"
        dur="12s"
        repeatCount="indefinite"
      />
    </path>
  </g>

  <!-- Cinta principal -->
  <g class="wave-main">
    <path
      d="M -100 285 C 80 95, 240 80, 400 215 C 555 345, 710 335, 905 105"
      fill="none"
      stroke="url(#dnaGradient)"
      stroke-width="18"
      stroke-linecap="round"
    >
      <animateTransform
        attributeName="transform"
        type="translate"
        values="-20 6; 12 -10; 30 8; -20 6"
        dur="10s"
        repeatCount="indefinite"
      />
    </path>
  </g>

  <!-- Cinta secundaria / cruce ADN -->
  <g class="wave-cross" opacity="0.72">
    <path
      d="M -100 105 C 80 320, 250 350, 405 215 C 565 80, 715 75, 905 295"
      fill="none"
      stroke="url(#dnaGradient)"
      stroke-width="11"
      stroke-linecap="round"
    >
      <animateTransform
        attributeName="transform"
        type="translate"
        values="20 -6; -10 10; -28 -4; 20 -6"
        dur="14s"
        repeatCount="indefinite"
      />
    </path>
  </g>

  <!-- Líneas finas -->
  <g class="wave-lines" opacity="0.28">
    <g>
      <path d="M -100 255 C 80 65, 240 70, 400 205 C 555 335, 710 325, 905 95" fill="none" stroke="currentColor" stroke-width="1"/>
      <path d="M -100 263 C 80 73, 240 78, 400 213 C 555 343, 710 333, 905 103" fill="none" stroke="currentColor" stroke-width="1"/>
      <path d="M -100 271 C 80 81, 240 86, 400 221 C 555 351, 710 341, 905 111" fill="none" stroke="currentColor" stroke-width="1"/>
      <path d="M -100 279 C 80 89, 240 94, 400 229 C 555 359, 710 349, 905 119" fill="none" stroke="currentColor" stroke-width="1"/>
      <path d="M -100 287 C 80 97, 240 102, 400 237 C 555 367, 710 357, 905 127" fill="none" stroke="currentColor" stroke-width="1"/>
      <path d="M -100 295 C 80 105, 240 110, 400 245 C 555 375, 710 365, 905 135" fill="none" stroke="currentColor" stroke-width="1"/>
      <animateTransform
        attributeName="transform"
        type="translate"
        values="-26 0; 24 0; -26 0"
        dur="18s"
        repeatCount="indefinite"
      />
    </g>
  </g>

  <!-- Partículas superiores -->
  <g class="particles-a" fill="currentColor" opacity="0.70">
    <circle cx="120" cy="155" r="1.8"/>
    <circle cx="150" cy="132" r="1.2"/>
    <circle cx="188" cy="120" r="1.7"/>
    <circle cx="225" cy="122" r="1.1"/>
    <circle cx="264" cy="138" r="1.5"/>
    <circle cx="304" cy="165" r="1.3"/>
    <animateTransform
      attributeName="transform"
      type="translate"
      values="-10 8; 18 -8; -10 8"
      dur="9s"
      repeatCount="indefinite"
    />
    <animate
      attributeName="opacity"
      values="0.25;0.9;0.35;0.25"
      dur="7s"
      repeatCount="indefinite"
    />
  </g>

  <!-- Partículas inferiores -->
  <g class="particles-b" fill="currentColor" opacity="0.55">
    <circle cx="468" cy="275" r="1.2"/>
    <circle cx="500" cy="292" r="1.8"/>
    <circle cx="536" cy="307" r="1.0"/>
    <circle cx="575" cy="313" r="1.6"/>
    <circle cx="614" cy="306" r="1.2"/>
    <circle cx="654" cy="286" r="1.9"/>
    <circle cx="690" cy="258" r="1.1"/>
    <animateTransform
      attributeName="transform"
      type="translate"
      values="12 -6; -16 10; 12 -6"
      dur="11s"
      repeatCount="indefinite"
    />
    <animate
      attributeName="opacity"
      values="0.20;0.70;0.30;0.20"
      dur="8s"
      repeatCount="indefinite"
    />
  </g>
</svg>
```

---

## 3) Cómo usarlo en dorado y negro

### Dorado sobre negro

```css
.card {
  position: relative;
  overflow: hidden;
  background: #080808;
}

.card .dna-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  color: #C89449;
  pointer-events: none;
}
```

### Negro sobre dorado

```css
.card.light {
  background: #C89449;
}

.card.light .dna-bg {
  color: #111111;
}
```

---

## 4) Estructura HTML sugerida

```html
<div class="card">
  <!-- pegar aquí el SVG -->
  <div class="card-content">
    <h3>Título</h3>
    <p>Contenido de la card</p>
  </div>
</div>
```

---

## 5) Nota importante

Si quieres, en el siguiente paso te puedo dar una de estas 2 opciones:

1. **versión SVG más minimalista**
2. **versión lista completa en HTML + CSS + SVG para pegar directo en tu proyecto**

Si vas a usarlo ya en producción, te recomiendo la segunda.
