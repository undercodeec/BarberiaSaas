# Commercial Copy for Personal-Care Businesses Design

## Objective

Update the public Nava home page so it markets the product to every business
category supported during account creation, instead of speaking only to
barbershops.

## Scope

- Change text only in `apps/web/app/page.tsx`.
- Preserve the existing layout, interactions, links, images, pricing, and
  module list.
- Use the umbrella term **negocios de cuidado personal**.
- Name the supported categories where the hero message introduces the product:
  barberías, salones de belleza, estudios de uñas, spa y bienestar, centros de
  estética y otros negocios de cuidado personal.
- Replace all copy that treats a barbershop as the sole business type.

## Copy Direction

- Hero eyebrow: `Software para negocios de cuidado personal`.
- Hero headline: `Haz crecer tu negocio con más orden y menos
  complicaciones.`
- Hero supporting text describes the real current modules: reservations,
  scheduling, customers, cash and sales, team, inventory, commissions, and
  reports.
- The product statement and module section use `tu negocio` rather than
  `tu barbería`.
- The Nava Local plan summary becomes `Operación para tu local`.

## Acceptance Criteria

1. The commercial home page does not present Nava as exclusive to barbershops.
2. The visible hero copy explicitly includes all account-creation categories.
3. The page still accurately names the modules currently offered by the app.
4. No markup structure, visual asset, behavior, route, or price changes are
   introduced.
5. The web app typecheck and production build complete successfully.
