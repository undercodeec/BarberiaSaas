Quiero que implementes la **vista de inicio de sesión web de Nava** tomando como referencia visual exacta la **imagen adjunta**.

## Objetivo

Replicar el diseño visual de la referencia con alta fidelidad, pero adaptándolo correctamente al stack, arquitectura, componentes y estilos que ya existen en este proyecto.

Antes de modificar código:

1. Analiza la estructura actual del proyecto.
2. Identifica framework, sistema de rutas, sistema de estilos y componentes reutilizables existentes.
3. Localiza la pantalla/ruta actual de Login.
4. Reutiliza componentes existentes siempre que tenga sentido.
5. No cambies la arquitectura general del proyecto innecesariamente.

---

# Diseño

La pantalla debe ocupar:

```css
min-height: 100vh;
width: 100%;
```

En escritorio debe dividirse visualmente en **dos grandes secciones**.

## Panel izquierdo

Debe ocupar aproximadamente:

```text
42% - 45% del ancho
```

Características:

- Fondo negro / carbón muy oscuro.
- Apariencia premium.
- Bordes limpios.
- La zona inferior/derecha puede tener una terminación curva similar a la referencia.
- Incorporar detalles dorados sutiles.
- Evitar saturar visualmente la interfaz.

Paleta aproximada:

```css
--background-dark: #111111;
--background-dark-secondary: #1c1c1c;

--gold: #c9a227;
--gold-light: #e4c45a;
--gold-dark: #a67c00;

--white: #ffffff;
--off-white: #faf9f6;

--gray-light: #eeece7;
--gray: #9a9a9a;
--text-dark: #111111;
```

Puedes ajustar ligeramente los dorados para conseguir una apariencia más elegante.

### Logo

En la zona superior izquierda incluir el isotipo/logo de Nava.

Si existe un logo real dentro de `/public`, `/assets` o recursos del proyecto, úsalo.

No inventes un nuevo logo si ya existe uno.

### Mensaje

Mostrar:

```text
Bienvenido a Nava
```

"Nava" debe tener acento dorado.

Debajo:

```text
La plataforma inteligente que impulsa
tu productividad al siguiente nivel.
```

Tipografía limpia, moderna y profesional.

### Elemento visual

Recrear el concepto visual de la referencia:

- ondas digitales;
- partículas;
- líneas;
- pequeños puntos;
- brillos dorados;
- sensación tecnológica y premium.

IMPORTANTE:

No hace falta copiar pixel por pixel la ilustración.

Puede recrearse utilizando:

- CSS gradients;
- radial-gradient;
- pseudo-elementos;
- SVG;
- canvas;
- o una combinación ligera de efectos.

Prioriza rendimiento.

No agregues dependencias pesadas únicamente para generar el fondo.

Debe sentirse como:

```text
tecnología + lujo + minimalismo
```

y no como una interfaz de criptomonedas o casino.

### Mensaje inferior

Agregar un pequeño icono de escudo y el texto:

```text
Seguro, confiable y diseñado
para equipos modernos.
```

Con detalles dorados discretos.

---

# Panel derecho

Fondo:

```css
#FFFFFF
```

o un blanco ligeramente cálido:

```css
#FAF9F6
```

Debe ocupar aproximadamente:

```text
55% - 58%
```

del ancho de pantalla.

El formulario debe estar centrado vertical y horizontalmente.

---

# Card de Login

Crear una tarjeta blanca similar a la referencia.

Características:

```text
ancho aproximado: 500 - 560px
border-radius: 24 - 30px
padding generoso
sombra extremadamente suave
```

Ejemplo conceptual:

```css
box-shadow: 0 20px 60px rgba(0, 0, 0, 0.06);
```

No exagerar las sombras.

Debe transmitir una interfaz SaaS moderna y premium.

---

# Logo principal

En la parte superior del formulario mostrar:

```text
Nava
```

Usar el logo real del proyecto si existe.

El elemento distintivo de la marca puede utilizar dorado.

---

# Formulario

Mostrar:

## Título

```text
Iniciar sesión
```

## Subtítulo

```text
Ingresa tus credenciales para continuar
```

---

## Correo electrónico

Label:

```text
Correo electrónico
```

Input:

```text
ejemplo@correo.com
```

Agregar icono de correo dentro del input.

---

## Contraseña

Label:

```text
Contraseña
```

Input de contraseña.

Agregar:

- icono de candado a la izquierda;
- botón de mostrar/ocultar contraseña a la derecha.

El botón debe funcionar realmente.

---

# Opciones

Debajo de contraseña:

Izquierda:

```text
☑ Recordarme
```

Derecha:

```text
¿Olvidaste tu contraseña?
```

El enlace debe utilizar dorado como color de énfasis.

---

# Botón principal

Texto:

```text
Ingresar
```

Debe ocupar prácticamente todo el ancho disponible.

Estilo:

- fondo dorado;
- degradado dorado muy sutil;
- texto blanco o negro dependiendo del contraste;
- border-radius aproximadamente 10-14px;
- transición suave;
- icono/flecha a la derecha.

Ejemplo conceptual:

```css
background: linear-gradient(135deg, #c9a227, #d9b743);
```

Hover:

- ligera elevación;
- pequeño cambio de brillo;
- transición de 200-300ms.

No agregar animaciones excesivas.

---

# Crear cuenta

En la parte inferior:

```text
¿No tienes una cuenta? Crear cuenta
```

"Crear cuenta" debe aparecer en dorado y ser clickeable si ya existe una ruta de registro.

---

# Importante sobre autenticación

Nava utiliza actualmente autenticación tradicional mediante **correo electrónico y contraseña**.

Por lo tanto:

**NO agregar autenticación mediante Google ni Microsoft.**

Aunque aparezcan en la referencia visual, omite esos botones.

No agregues Firebase ni ningún proveedor adicional.

Utiliza exclusivamente el mecanismo de autenticación que ya tenga implementado el proyecto.

---

# Responsive

La pantalla debe funcionar correctamente en:

```text
Desktop
Laptop
Tablet
Mobile
```

## Desktop

Mantener layout dividido:

```text
panel visual | formulario
```

## Tablet

Puede mantenerse el panel izquierdo reducido o simplificado si existe espacio suficiente.

## Mobile

En resoluciones pequeñas:

- ocultar el panel visual izquierdo;
- formulario ocupando toda la pantalla;
- mantener logo;
- mantener buen padding lateral;
- card sin sombra excesiva;
- evitar scroll horizontal;
- mantener inputs y botón cómodos para interacción táctil.

Ejemplo:

```text
< 768px
```

mostrar únicamente el formulario.

---

# Animaciones

Agregar únicamente microinteracciones sutiles:

### Inputs

Al hacer focus:

- borde dorado;
- pequeño glow dorado con baja opacidad.

### Botón

Hover:

```text
translateY(-1px)
```

y ligero aumento de luminosidad.

### Card

Al cargar puede aparecer con:

```text
opacity 0 → 1
translateY(8px) → 0
```

duración aproximada:

```text
300-500ms
```

No implementar animaciones innecesarias.

---

# Accesibilidad

Mantener:

- labels reales asociados a inputs;
- navegación mediante teclado;
- estados `focus-visible`;
- contraste correcto;
- botones accesibles;
- `autocomplete="email"`;
- `autocomplete="current-password"`;
- atributos `aria-label` cuando sean necesarios.

---

# Código

Quiero código:

- limpio;
- mantenible;
- responsive;
- modular;
- reutilizable;
- consistente con el proyecto.

Evita:

- CSS duplicado;
- estilos inline innecesarios;
- componentes gigantes;
- dependencias nuevas si pueden evitarse;
- modificar funcionalidades que no tienen relación con esta pantalla.

Si el proyecto utiliza componentes como:

```text
Button
Input
Card
Typography
Icon
```

reutilízalos.

Si utiliza Tailwind, utiliza Tailwind.

Si utiliza CSS Modules, mantén CSS Modules.

Si utiliza styled-components u otro sistema, mantén el sistema existente.

**No cambies la tecnología de estilos solamente para implementar esta pantalla.**

---

# Iconos

Usa la librería de iconos que ya tenga instalada el proyecto.

Por ejemplo:

```text
Lucide
Heroicons
Material Icons
```

No agregues una nueva librería si ya existe una.

---

# Resultado visual esperado

La pantalla debe transmitir:

```text
Premium
Minimalista
Tecnológica
Elegante
Profesional
Moderna
```

Paleta predominante:

```text
Blanco
Negro
Dorado
Grises cálidos
```

No utilizar:

```text
azul
morado
verde
rojo
```

como colores principales de la interfaz.

---

# Antes de finalizar

Verifica:

1. Que el proyecto compile.
2. Que no existan errores TypeScript/JavaScript.
3. Que el login existente continúe funcionando.
4. Que mostrar/ocultar contraseña funcione.
5. Que los enlaces respeten las rutas existentes.
6. Que no exista overflow horizontal.
7. Que funcione correctamente en móvil.
8. Que no hayas agregado dependencias innecesarias.
9. Que no hayas modificado otras pantallas accidentalmente.

Después de implementar, indícame brevemente:

- archivos creados;
- archivos modificados;
- qué componentes reutilizaste;
- cómo resolviste el responsive;
- cualquier consideración importante de la implementación.

No quiero únicamente un mockup estático: **quiero la vista integrada correctamente dentro del proyecto existente y conservando la funcionalidad actual del login.**
