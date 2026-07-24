Necesito replicar exactamente el estilo visual de los dos botones mostrados en la referencia de la pantalla de bienvenida de Nava.

Tecnología:
- React Native
- TypeScript
- Expo
- `Pressable`
- Iconos con `@expo/vector-icons`

Crea un componente reutilizable llamado `NavaButton.tsx` con dos variantes:

1. `outline`
2. `primary`

## Diseño general

Los botones deben aparecer horizontalmente, uno junto al otro, ocupando el mismo ancho dentro de un contenedor con padding lateral de 24 px y separación de 14 px.

Cada botón debe tener:

- Altura aproximada: 72 px
- `flex: 1`
- Bordes muy redondeados
- `borderRadius: 26`
- Contenido centrado horizontal y verticalmente
- Icono a la izquierda
- Texto centrado visualmente
- Separación entre icono y texto de 10 px
- Padding horizontal de 18 px
- Tipografía sans-serif
- Tamaño de texto: 17 px
- Peso: `700`
- Sombras muy sutiles
- Animación al presionar con `scale: 0.98`

## Color principal

Usar el mismo azul marino oscuro del logo Nava:

```ts
const NAVY = "#101C2D";