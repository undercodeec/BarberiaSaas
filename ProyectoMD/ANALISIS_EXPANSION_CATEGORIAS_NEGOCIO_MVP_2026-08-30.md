# Análisis: expansión del MVP a categorías de cuidado personal

Fecha: 2026-08-30  
Estado: decisiones aprobadas; datos, lógica y assets móviles implementados; páginas comerciales y revisión final de copy pendientes

## Decisiones aprobadas (2026-08-30)

- Se aprueban las seis categorías propuestas.
- Peluquería se agrupa inicialmente en `BEAUTY_SALON` / «Salón de belleza».
- La organización podrá cambiar la categoría; el efecto inicial será únicamente visual y de terminología, sin cambiar datos operativos.
- Los assets visuales móviles están asignados mediante un resolvedor estático de Metro. Se reutiliza una composición por categoría en dashboard y bienvenida.
- Las páginas comerciales verticales quedan pendientes de definición.

## Implementación realizada en esta sesión

- Se añadió `BusinessCategory` al esquema y una migración para persistirla en registros pendientes, perfiles y organizaciones, con `BARBERSHOP` como valor seguro para cuentas existentes.
- Los registros móvil y web ahora envían una de las seis categorías.
- El perfil permite cambiar categoría y la API actualiza el perfil y la organización dentro de la misma transacción.
- Se creó `apps/mobile/assets/business-categories/` y `apps/mobile/src/lib/business-category.ts` como catálogo de etiquetas, iconos y resolvedor estático de imágenes.
- El dashboard y la bienvenida ahora resuelven su imagen e icono por categoría; la silla y el equipo originales quedan exclusivamente para Barbería.

## Actualización 2026-08-31 — assets móviles asignados

Los assets se conectaron a las dos superficies contextuales del MVP: la bienvenida de configuración y la tarjeta «Recibe reservas» del dashboard. El resolvedor declara cada `require()` de forma estática, condición necesaria para que Metro empaquete los PNG.

| Categoría | Asset |
| --- | --- |
| `BARBERSHOP` | `silla.png` en dashboard y `onboarding-team.png` en bienvenida |
| `BEAUTY_SALON` | `business-categories/peluqueria.png` |
| `NAIL_STUDIO` | `business-categories/estudio-uñas.png` |
| `SPA_WELLNESS` | `business-categories/spa-wellness.png` |
| `AESTHETICS` | `business-categories/spas.png` |
| `PERSONAL_CARE_OTHER` | `business-categories/otros-cuidados-personales.png` |

El archivo recibido como `spas.png` representa visualmente un «Centro de Estética», por lo que se asignó a `AESTHETICS`; se añadió `spa-wellness.png`, sin texto, para `SPA_WELLNESS`. Mantener esta correspondencia evita que una cuenta de spa muestre una categoría visual distinta.

## Decisión recomendada

Nava puede ampliarse desde barberías hacia negocios de cuidado personal sin cambiar su núcleo operativo. La agenda, reservas, servicios, clientes, equipo, caja, inventario, comisiones y sucursales ya son conceptos válidos para barberías, salones de belleza, estudios de uñas, spa y centros de estética no médica.

La recomendación es introducir una **categoría de negocio** obligatoria durante el registro y persistirla en la organización. Esa categoría debe alimentar una configuración visual y de lenguaje (`business profile`), no bifurcar la lógica del producto. Así se mantiene un único producto y una sola base de código, con pequeños cambios de terminología e imágenes según el rubro.

No debe confundirse esta nueva categoría con `ServiceCategory`: la tabla existente `service_categories` organiza el catálogo de servicios de cada negocio; la nueva categoría identifica el rubro completo de la organización.

## Hallazgos en el proyecto actual

La aplicación ya distingue entre `business` y `professional`:

- En móvil, `RegistrationFlow` permite elegir «Tengo un negocio» o «Solo yo».
- En la web comercial, `CheckoutExperience` contiene el selector «Negocio / Profesional independiente».
- El dato se valida como `accountType` en `signUpSchema` y se guarda de forma temporal en `PendingRegistration`, y de forma permanente en `UserRegistrationProfile`.
- Al finalizar el onboarding, `POST /v1/onboarding/complete-account-setup` crea `Organization`, `Location`, la membresía y los servicios iniciales.

Actualmente no existe un campo que identifique el rubro. La entidad `Organization` solo almacena, entre otros, nombre, zona horaria, estado y preferencias de reservas. Por ello, la app no puede decidir qué imagen, icono o término mostrar para cada negocio.

La funcionalidad principal no está ligada a barbería. Los puntos que sí exponen ese rubro son principalmente de presentación:

| Área | Acoplamiento actual | Acción propuesta |
| --- | --- | --- |
| Registro móvil | Solo escoge modalidad de cuenta; no escoge rubro. | Añadir selector de categoría después de modalidad. |
| Registro web/comercial | Formulario de `CheckoutExperience` sin rubro. | Añadir el mismo selector y enviarlo al registro. |
| Bienvenida móvil | Ilustración de equipo y un icono de tijeras. | Sustituir por activo e icono del perfil visual. |
| Dashboard móvil | El acceso «Servicios» usa `cut-outline`; tarjeta de reservas muestra `assets/silla.png` con etiqueta de silla de barbería. | Resolver icono e imagen por categoría. |
| Landing comercial | Título, meta descripción, copys y varias ilustraciones hablan de barberías. | Usar mensaje general de cuidado personal; conservar campañas específicas en URLs dedicadas si se necesitan. |
| Reserva pública | Hay frases puntuales como «Compra en la barbería». | Aplicar el vocabulario de la organización al renderizar. |
| Roles técnicos | Persisten `BARBER` / `OnboardingCollaboratorRole.BARBER` en permisos y base de datos. | Mantenerlos internamente en el MVP; mostrar «Profesional» en la UI. |

Los archivos más relevantes para el cambio son:

- `packages/database/prisma/schema.prisma`
- `packages/validation/src/index.ts`
- `apps/api/src/app.ts`
- `packages/api-client/src/index.ts`
- `apps/mobile/src/components/RegistrationFlow.tsx`
- `apps/web/app/checkout/CheckoutExperience.tsx`
- `apps/mobile/src/components/AccountSetupWelcomeScreen.tsx`
- `apps/mobile/app/(onboarding)/dashboard.tsx`
- `apps/web/app/page.tsx`, `apps/web/app/layout.tsx` y `apps/web/app/components/BookingExperience.tsx`

## Categorías propuestas para el MVP

Conviene comenzar con pocas opciones, todas cubiertas por las funciones existentes. Evita pedir un texto libre como primera opción: dificulta analítica, contenido y soporte.

| Código estable | Nombre que ve el usuario | Incluye ejemplos | Encaje actual |
| --- | --- | --- | --- |
| `BARBERSHOP` | Barbería | corte, barba, grooming | Completo. |
| `BEAUTY_SALON` | Salón de belleza | peluquería, color, maquillaje, peinados | Completo. |
| `NAIL_STUDIO` | Estudio de uñas | manicure, pedicure, nail art | Completo. |
| `SPA_WELLNESS` | Spa y bienestar | masajes no terapéuticos, faciales, relajación | Completo, con límites de datos. |
| `AESTHETICS` | Centro de estética | depilación, cejas, pestañas, cuidado facial no médico | Completo, con límites de datos. |
| `PERSONAL_CARE_OTHER` | Otro negocio de cuidado personal | una variante compatible no incluida arriba | Completo con perfil visual neutro. |

No incluir en esta fase clínicas, odontología, medicina estética, fisioterapia, tatuajes o negocios que requieran historia clínica, consentimiento médico, fichas de salud, recetas o datos sensibles. La validación ya prohíbe registrar información médica, biométrica y otra información sensible en notas; ese límite debe mantenerse explícito en la selección y en ventas.

## Flujo de alta propuesto

La categoría debe preguntarse una sola vez, temprano, y poder corregirse desde Ajustes. La secuencia recomendada es la misma para móvil y web:

```text
Tipo de cuenta ──> Categoría ──> Datos del negocio ──> Ubicación/horario
     │                   │
     └─ Negocio          └─ Perfil visual + vocabulario inicial
     └─ Solo yo          └─ Mismo selector; atiende en ese rubro
```

1. La persona selecciona «Tengo un negocio» o «Solo yo».
2. Se muestra «¿Qué tipo de negocio atiendes?» con tarjetas de las seis categorías. Cada tarjeta tiene icono, nombre y ejemplo breve; no debe ser una pantalla decorativa ni requerir una foto.
3. Al escogerla, se guarda `businessCategory` en el formulario; se puede mostrar un resumen pequeño: «Usaremos este estilo para personalizar tu experiencia. Podrás cambiarlo después».
4. Los pasos ya existentes continúan sin cambios: nombre, ubicación, horarios, credenciales y verificación.
5. Desde la primera pantalla de bienvenida, servicios, dashboard y reserva pública se usa el perfil correspondiente.

Para web comercial, el selector puede ubicarse después de «Tipo de cuenta» en el formulario actual. Para móvil, es preferible añadir un paso `category` entre `choice` y `business`: en pantallas pequeñas las tarjetas son más legibles y se evita alargar el formulario de datos.

La categoría debe ser obligatoria para nuevos registros, incluidos profesionales independientes. Un profesional de uñas o estética también necesita que su dashboard y su reserva pública no parezcan una barbería.

## Perfil de presentación: una fuente única

Crear un catálogo estático y tipado compartido, por ejemplo en `packages/domain`, que convierta cada código a su presentación. Ningún componente debería contener condiciones como `if (category === 'spa')` dispersas por la app.

```ts
type BusinessCategory =
  | 'BARBERSHOP'
  | 'BEAUTY_SALON'
  | 'NAIL_STUDIO'
  | 'SPA_WELLNESS'
  | 'AESTHETICS'
  | 'PERSONAL_CARE_OTHER';

type BusinessPresentation = {
  label: string;
  dashboardImage: ImageSource;
  onboardingImage: ImageSource;
  serviceIcon: IoniconName;
  serviceNounPlural: string;
  professionalNounPlural: string;
  bookingVenueNoun: string;
};
```

La configuración inicial puede ser deliberadamente pequeña:

| Elemento | Barbería | Salón / uñas / estética | Spa | Otro |
| --- | --- | --- | --- | --- |
| Icono de servicios | `cut-outline` | `color-palette-outline` o `sparkles-outline` | `leaf-outline` | `storefront-outline` |
| Imagen de reservas | silla/barbería | peinado, uñas o tocador | piedras/ambiente spa | imagen neutra de atención |
| Profesionales | Profesionales | Profesionales | Terapeutas o Profesionales | Profesionales |
| Lugar de compra | negocio | salón o negocio | spa o negocio | negocio |

La neutralidad es preferible cuando una frase no aporta valor. «Reserva tu próximo servicio», «Tu equipo», «Profesional» y «Comparte el enlace de reservas de tu negocio» funcionan para todas las categorías y reducen traducciones condicionales.

No se recomienda cambiar paleta, navegación, estructura de dashboard, permisos ni módulos por rubro en el MVP. La identidad Nava debe seguir siendo reconocible; se intercambian solo el activo contextual, algunos iconos y unas pocas palabras. Para evitar descargas innecesarias en móvil, incluir inicialmente uno o dos assets comprimidos por categoría o una imagen neutral como fallback; no generar imágenes por cuenta ni cargar una URL remota sin caché.

## Modelo de datos y contratos

La categoría es un dato de la organización, no de una ubicación. Una empresa con varias sucursales debe conservar un solo rubro principal. Más adelante, si el negocio requiere varias líneas (por ejemplo, salón y uñas), se puede introducir una relación de categorías secundarias; no hace falta para este MVP.

### Persistencia propuesta

1. Crear el enum Prisma `BusinessCategory` con los seis códigos anteriores.
2. Añadir `businessCategory` a `PendingRegistration` para que sobreviva la verificación del correo.
3. Añadir `businessCategory` a `UserRegistrationProfile`, que es la fuente de verdad durante el onboarding.
4. Añadir `businessCategory` a `Organization`, que será la fuente de verdad tras completar el onboarding y para todas las consultas operativas/públicas.
5. Al crear la organización en `complete-account-setup`, copiar el valor desde el perfil. Al editar categoría desde Ajustes, actualizar perfil y organización dentro de la misma transacción.

La migración debe ser segura para producción:

```text
crear enum → añadir columnas opcionales → backfill de existentes como BARBERSHOP
→ volver no nulas en perfil y organización → desplegar API/UI que exige la selección
```

Para `PendingRegistration`, se puede tolerar temporalmente `null`, ya que las solicitudes iniciadas antes del despliegue expiran. Al completar un registro viejo, la API puede asignar `BARBERSHOP` de compatibilidad o solicitar la categoría antes de finalizar; la primera opción evita bloquear verificaciones ya enviadas.

### API y validación

Actualizar los siguientes contratos:

- `signUpSchema`: recibir `businessCategory` como enum.
- `updateOnboardingAccountDetailsSchema`: recibir categoría para permitir corrección desde Ajustes. Si se prefiere reducir el formulario actual, crear un endpoint específico `PATCH /v1/organization/business-category` con los mismos permisos del propietario.
- Interfaces `RegistrationForm`, `SignUpInput`, `OnboardingAccountDetailsResponse` y la respuesta de organización actual en `@barber-saas/api-client`.
- `RegistrationProfileDraft`, serialización de `PendingRegistration`, verificación de correo y creación de `UserRegistrationProfile` en `apps/api/src/app.ts`.
- Respuestas que alimentan dashboard, perfil y reserva pública: incluir `businessCategory` o, mejor, un `presentation` derivado en cliente desde el código.

No enviar nombres de imágenes ni textos administrables desde la base de datos en la primera versión. El enum viaja por API y el cliente lo resuelve con su catálogo versionado. Esto mantiene el contrato simple y evita que cambios de copy dependan de datos sin revisión.

## Cambios concretos de UI

### Móvil

- `RegistrationFlow`: insertar paso de categoría, validarlo antes de datos de negocio y mostrarlo en la revisión final.
- `AccountSetupWelcomeScreen`: reemplazar la ilustración de equipo de barbería y el icono de tijeras del fondo por los definidos en el perfil. Mantener una versión neutra mientras se cargan datos.
- `dashboard.tsx`: reemplazar el `cut-outline` del acceso Servicios y `assets/silla.png` de la tarjeta de reservas; actualizar la etiqueta de accesibilidad.
- Ajustes/organización: mostrar «Tipo de negocio» con selector y una advertencia breve de que el cambio afecta imágenes y lenguaje. No debe modificar servicios, reservas ni reportes.
- Pantallas de equipo: todo texto visible que diga «barbero» debe pasar a «profesional» (o al término del perfil solo si aporta claridad). Los roles y permisos internos pueden quedarse intactos.

### Web comercial y reserva pública

- Cambiar el SEO base de `apps/web/app/layout.tsx` de «plataforma para tu barbería» a una propuesta inclusiva, por ejemplo «La plataforma para tu negocio de cuidado personal».
- En `apps/web/app/page.tsx`, sustituir el copy global centrado en barberías. Para mantener conversión, crear después páginas de campaña específicas como `/barberias`, `/salones-de-belleza` y `/spas`, todas apuntando al mismo registro con la categoría preseleccionada.
- En `CheckoutExperience`, incluir el selector obligatorio y adaptar el placeholder de primer servicio: «Ej. Corte clásico», «Manicure semipermanente» o «Masaje relajante», según categoría. El campo y su validación siguen siendo idénticos.
- En `BookingExperience`, usar el nombre de la organización y textos genéricos para que la reserva pública sea correcta incluso en categorías futuras.

## Reglas de compatibilidad y riesgos

| Riesgo | Prevención |
| --- | --- |
| Confundir rubro de negocio con categoría de servicio. | Usar nombres distintos: `businessCategory` y `ServiceCategory`; no reutilizar tablas. |
| Romper registros pendientes de verificar. | Mantener nulo temporalmente en `PendingRegistration` y aplicar fallback documentado. |
| Una cuenta existente cambia de barbería a spa y altera datos operativos. | El cambio solo modifica presentación; no migra, elimina ni recategoriza servicios. |
| Renombrar el enum/rol `BARBER` rompe permisos, datos y pruebas. | Conservar nombre interno ahora; desacoplar primero el texto mostrado. |
| Incluir negocios con datos de salud. | Limitar explícitamente el catálogo a cuidado personal no médico y conservar las validaciones de datos sensibles. |
| Assets pesados o inconsistentes. | Establecer tamaño y formato por asset, fallback neutro, etiquetas accesibles y revisión visual en Android/iOS/web. |
| Copy condicionado disperso. | Centralizar vocabulario en el perfil; buscar `barber`, `barbería`, `barbero`, `silla` y `cut-outline` antes del cierre. |

## Plan de implementación por entregas

### Entrega 1 — Fundamento de datos

- Definir enum, catálogo compartido y pruebas unitarias del mapeo.
- Añadir migración, backfill y contratos API.
- Persistir categoría en registro, verificación, perfil y creación de organización.
- Exponerla en las respuestas necesarias.

Criterio de aceptación: un registro nuevo conserva la categoría elegida desde el formulario hasta la organización creada; las organizaciones existentes reciben `BARBERSHOP` y continúan operando sin cambio funcional.

### Entrega 2 — Alta y configuración

- Implementar selector en registro móvil y web.
- Mostrar categoría en la revisión y permitir cambiarla desde Ajustes.
- Añadir validación de cliente y servidor, más pruebas de registro y actualización.

Criterio de aceptación: no se puede crear una cuenta nueva sin categoría; el valor seleccionado aparece correctamente después de iniciar sesión y tras recargar la app.

### Entrega 3 — Presentación contextual

- Completado: crear o seleccionar los assets por categoría y registrarlos de forma estática en Metro.
- Completado: conectar el perfil visual con bienvenida y dashboard.
- Pendiente: aplicar lenguaje contextual y textos generales en reserva pública y web comercial.

Criterio de aceptación parcial: al probar una cuenta de cada categoría, bienvenida y dashboard no muestran silla, tijeras ni texto de barbería fuera de `BARBERSHOP`. El criterio integral se completará al actualizar reserva pública y web comercial.

### Entrega 4 — Calidad y lanzamiento

- Pruebas de API: validación, persistencia, backfill y actualización de categoría.
- Pruebas de UI: registro móvil, formulario web, dashboard y reserva pública por dos o más categorías.
- Pruebas de regresión de permisos, agenda, caja, equipo e inventario.
- Instrumentar eventos: `business_category_selected`, `registration_completed` y `onboarding_completed`, siempre con la categoría; evitar incluir nombres, correo o teléfono en analítica.

## Seguimientos pendientes

1. Actualizar el copy y SEO de la web comercial para que la propuesta base sea inclusiva.
2. Aplicar el lenguaje neutral/contextual en la reserva pública y cerrar la búsqueda de términos de barbería restantes.
3. Definir las páginas comerciales prioritarias. La página principal debe ser inclusiva; las campañas verticales pueden llegar en una iteración de adquisición separada.
4. Ejecutar la prueba visual en Android, iOS y web con una cuenta por categoría.

## Resultado esperado

Con esta estructura, Nava pasa de estar presentado como un producto exclusivo para barberías a una plataforma de operaciones para cuidado personal, sin duplicar módulos ni crear variantes de la app. La categoría funciona como contexto de marca y lenguaje, mientras que el motor operativo permanece común y mantenible.
