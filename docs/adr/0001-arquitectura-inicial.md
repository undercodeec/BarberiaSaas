# ADR 0001: Arquitectura inicial del monorepositorio

- Estado: Aceptada
- Fecha: 2026-07-18

## Contexto

El producto necesita una aplicación móvil interna, un flujo público web y un panel exclusivo del operador. Las tres superficies deben compartir contratos y reglas sin acoplar sus componentes visuales. El backend futuro usará Supabase y debe conservar aislamiento multi-tenant.

## Decisión

Se adopta un monorepositorio con pnpm y Turborepo:

- Expo Router y React Native para `apps/mobile`.
- Next.js App Router para `apps/web` y `apps/admin`.
- Paquetes TypeScript pequeños para dominio, validación, permisos, transporte, tipos de base de datos, configuración, pruebas y tokens de diseño.
- Supabase local como backend, con migraciones inmutables y operaciones críticas futuras mediante PostgreSQL RPC o funciones de servidor.
- TypeScript estricto como frontera mínima de calidad, Zod para entradas y pruebas separadas por nivel.

Las aplicaciones no comparten componentes visuales por obligación. Las reglas críticas se ubicarán en backend o paquetes de dominio y nunca se duplicarán en las interfaces.

## Consecuencias

- Cada aplicación puede evolucionar su experiencia sin bifurcar reglas de negocio.
- El grafo de dependencias y la caché de Turbo reducen el costo de validación.
- Existe más configuración inicial y se debe mantener compatibilidad entre Expo, React y Next.js.
- La separación `apps/admin` impide mezclar permisos internos de plataforma con membresías de barberías.

## Alternativas descartadas

- Repositorios separados: aumenta la duplicación y dificulta cambios atómicos de contratos.
- Una sola aplicación web responsiva: no cubre adecuadamente la operación móvil nativa prevista.
- Componentes visuales universales obligatorios: introduce acoplamiento prematuro entre interfaces con necesidades distintas.
