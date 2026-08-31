# Assets de categorías de negocio

Las imágenes se muestran en la bienvenida y en la tarjeta de reservas del dashboard. El resolvedor estático está en `src/lib/business-category.ts`; Metro no admite rutas construidas dinámicamente mediante `require`.

| Categoría | Asset asignado |
| --- | --- |
| `BARBERSHOP` | `../silla.png` (dashboard) y `../onboarding-team.png` (bienvenida) |
| `BEAUTY_SALON` | `peluqueria.png` |
| `NAIL_STUDIO` | `estudio-uñas.png` |
| `SPA_WELLNESS` | `spa-wellness.png` |
| `AESTHETICS` | `spas.png` |
| `PERSONAL_CARE_OTHER` | `otros-cuidados-personales.png` |

Un mismo asset contextual se reutiliza entre dashboard y bienvenida para no duplicar descargas. Todo nuevo recurso debe ser PNG o WebP, con transparencia cuando aplique, sin texto que contradiga su categoría y registrado de forma estática en el resolvedor.
