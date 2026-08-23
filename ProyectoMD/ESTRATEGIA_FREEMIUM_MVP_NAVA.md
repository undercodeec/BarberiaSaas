# Estrategia Freemium y Monetización del MVP — Nava

> Documento de contexto de producto para orientar a Codex y al equipo de desarrollo sobre cómo debe funcionar el trial, el plan gratuito, los límites de uso y la conversión a planes de pago dentro del MVP de Nava.

> Vigencia comercial: las cifras y reglas de este documento se ajustaron el 23
> de agosto de 2026 a `Politicas_y_terminos_Nava.md`, que prevalece ante
> cualquier contradicción. El trial es de 10 días y los precios aplicables son
> Nava Esencial USD 9,83, Nava Local USD 29,83 y Nava Multi USD 48,83; la
> promoción de fundador para Nava Local es USD 19,93 bajo sus condiciones de
> continuidad.

---

## 1. Objetivo

Nava es un SaaS móvil-first para barberías pequeñas y medianas de Ecuador y Latinoamérica. El MVP busca convertirse en una herramienta operativa diaria para gestionar:

- agenda;
- reservas públicas;
- clientes;
- caja y POS;
- comisiones;
- inventario básico;
- reportes;
- equipo y permisos.

La estrategia comercial del MVP será:

```text
Trial completo
→ Plan gratuito permanente
→ Uso habitual
→ Límite natural
→ Conversión a plan pagado
```

El objetivo no es bloquear artificialmente al usuario. El crecimiento real del negocio debe convertirse en el principal motivo para contratar un plan superior.

---

## 2. Hipótesis a validar

La hipótesis principal es:

> Una barbería que utiliza Nava de forma recurrente para gestionar suficientes citas, clientes o profesionales comienza a percibir un valor suficientemente alto como para pagar una suscripción.

Por ello, Nava debe permitir que un profesional pequeño pueda utilizar el sistema gratuitamente, pero no debe permitir que una barbería con una operación comercial relevante administre indefinidamente todo su negocio sin pagar.

Principio del producto:

> El plan gratuito debe ser bueno, pero pequeño.

No debe ser una demo inútil ni un producto completo regalado.

---

## 3. Flujo comercial del MVP

```text
Registro
↓
Verificación de cuenta
↓
Onboarding
↓
Trial Nava Local
↓
Uso completo durante 10 días
↓
Finaliza el trial
↓
Cuenta pasa automáticamente a Nava Free
↓
El usuario conserva todos sus datos
↓
Continúa utilizando Nava dentro de límites gratuitos
↓
Alcanza límite por reservas, clientes o profesionales
↓
Nava muestra el valor que ya obtuvo
↓
Upgrade a Nava Esencial o Nava Local
```

---

## 4. Trial inicial — Nava Local

Duración recomendada:

```text
10 días
```

Durante el trial el usuario debe poder experimentar prácticamente todo el valor funcional del MVP:

- múltiples profesionales;
- agenda;
- reservas públicas;
- clientes;
- caja;
- POS;
- comisiones;
- inventario;
- reportes;
- roles y permisos.

Durante la primera etapa comercial no se exige tarjeta para iniciar el trial.

### Objetivo de activación

El trial debe conseguir que el usuario:

1. configure su barbería;
2. agregue al menos un profesional;
3. cree servicios;
4. configure horarios;
5. comparta su enlace de reservas;
6. reciba reservas reales;
7. registre clientes;
8. utilice varias veces la agenda;
9. pruebe caja, comisiones o reportes.

El objetivo no es enseñar pantallas. El objetivo es conseguir uso real.

---

## 5. Finalización del trial

Cuando termina el trial:

```text
NO eliminar la cuenta.
NO eliminar datos.
NO cerrar completamente la aplicación.
NO impedir acceso a información histórica.
```

La organización cambia automáticamente a:

```text
Nava Free
```

Las funciones premium utilizadas durante el trial pueden quedar:

- visibles;
- bloqueadas para nuevas operaciones;
- disponibles en modo lectura cuando corresponda.

Ejemplo: si durante el trial se generaron comisiones, el usuario debe poder consultar el historial aunque ya no pueda generar nuevas liquidaciones desde Free.

Un downgrade limita capacidades futuras, no secuestra datos históricos.

---

## 6. Nava Free

Precio:

```text
USD 0 / mes
```

Público objetivo:

- barberos independientes;
- pequeños negocios que recién comienzan;
- usuarios que necesitan más tiempo para evaluar Nava;
- cuentas con un volumen operativo bajo.

### Límites iniciales recomendados

```text
1 organización
1 sucursal
1 profesional activo
40 reservas durante los últimos 30 días
100 clientes activos
```

Estos valores son hipótesis de negocio. Deben poder modificarse en backend sin publicar una nueva versión móvil.

---

## 7. Por qué no usar 10 reservas gratuitas por día

No usar como regla inicial:

```text
10 reservas / día
```

Una barbería que opera 26 días podría administrar aproximadamente:

```text
260 reservas / mes
```

Ese volumen ya corresponde a una operación comercial relevante y podría eliminar el incentivo de pagar.

Por ello, la hipótesis inicial será:

```text
40 reservas / ventana móvil de 30 días
```

---

## 8. Ventana móvil de reservas

El límite no debe reiniciarse necesariamente el día 1 de cada mes.

Debe calcular:

```text
reservas creadas durante los últimos 30 días
```

Ejemplo:

```text
Fecha actual: 20 de agosto
Ventana evaluada: 22 de julio → 20 de agosto
```

Nombre conceptual:

```text
rolling_30_day_booking_count
```

### Qué reservas cuentan

Para la primera versión se recomienda que una reserva creada consuma cupo aunque posteriormente cambie de estado.

Estados incluidos:

```text
pending
confirmed
arrived
in_service
completed
cancelled
no_show
```

Esto evita que un usuario cancele citas únicamente para recuperar cupo.

La regla debe estar centralizada y documentada para poder ajustarla después del piloto.

---

## 9. Qué sucede al alcanzar el límite

Al alcanzar el límite gratuito, Nava NO debe:

- cerrar la aplicación;
- borrar reservas;
- ocultar clientes históricos;
- impedir finalizar citas existentes;
- impedir consultar caja histórica;
- impedir acceder a datos propios.

Nava sí debe:

- impedir crear nuevas reservas que excedan el límite;
- impedir nuevas reservas públicas;
- explicar claramente el motivo;
- mostrar la opción de upgrade;
- permitir gestionar las reservas ya existentes.

### Reservas públicas

Cuando el negocio llegue al límite, la página pública no debe indicar que el negocio “no pagó Nava”.

Mensaje para el cliente final:

> Las reservas online de este negocio están temporalmente pausadas. Puedes contactar directamente con la barbería.

Mensaje para el propietario:

> Alcanzaste el límite de reservas de Nava Free. Actualiza tu plan para continuar recibiendo nuevas reservas online.

---

## 10. Reservas de cortesía

La primera vez que una organización llegue al límite Free se recomienda ofrecer:

```text
+5 reservas de cortesía
```

Mensaje sugerido:

> Has alcanzado las 40 reservas incluidas en Nava Free. Te regalamos 5 reservas adicionales para que puedas terminar tu semana sin interrupciones.

La cortesía se aplica una sola vez por organización.

Campo conceptual:

```text
free_booking_grace_used
```

---

## 11. Avisos progresivos

Nava debe comunicar el uso antes del bloqueo.

### 20 reservas

> Ya administraste 20 reservas con Nava.

Sin presión de compra fuerte.

### 30 reservas

> Has utilizado el 75% de las reservas incluidas en Nava Free.

CTA:

```text
Ver planes
```

### 36 reservas

> Te quedan 4 reservas gratuitas.

### 40 reservas

> Alcanzaste el límite de Nava Free.

CTA:

```text
Actualizar plan
```

Si la cortesía todavía está disponible:

```text
Usar 5 reservas de cortesía
```

---

## 12. Consumo visible

El usuario debe poder consultar permanentemente su consumo.

Ejemplo:

```text
Reservas
27 / 40

Clientes
64 / 100

Profesionales
1 / 1
```

Ubicación principal:

```text
Configuración
→ Suscripción
```

Cuando el consumo supere el 70%, puede mostrarse también un resumen discreto en Home.

---

## 13. Triggers de conversión

Nava no debe depender únicamente del límite de reservas.

### Trigger 1 — Reservas

```text
40 reservas / últimos 30 días
```

### Trigger 2 — Profesionales

Nava Free permite:

```text
1 profesional activo
```

Si el usuario intenta agregar un segundo profesional:

> Nava Free está diseñado para profesionales independientes. Para trabajar con un equipo, actualiza a Nava Local.

El upgrade cambia el tipo de operación:

```text
profesional independiente
→ barbería con equipo
```

No cobrar individualmente por cada barbero dentro de Nava Local.

### Trigger 3 — Clientes

Nava Free permite inicialmente:

```text
100 clientes activos
```

Cuando se alcance el límite:

- conservar todos los clientes existentes;
- permitir consulta del historial;
- bloquear nuevas altas cuando sean necesarias para una nueva operación;
- ofrecer upgrade.

---

## 14. Planes comerciales iniciales

### Nava Free

```text
USD 0 / mes
```

Incluye:

- 1 profesional;
- 1 sucursal;
- 40 reservas rolling / 30 días;
- 100 clientes;
- agenda;
- reservas públicas;
- servicios;
- historial básico;
- caja básica;
- reportes básicos;
- branding Nava.

### Nava Esencial

Precio recomendado:

```text
USD 9.83 / mes
```

Objetivo: operación individual de tipo profesional o negocio que ya superó
el uso gratuito.

Incluye:

- 1 profesional;
- 1 sucursal;
- reservas ilimitadas;
- clientes ilimitados;
- agenda completa;
- reservas públicas;
- servicios e historial de clientes;
- caja;
- reportes para operación individual.

No está pensado para equipos.

### Nava Local

Precio comercial recomendado:

```text
USD 29.83 / mes
```

Incluye:

- 1 sucursal;
- profesionales ilimitados sin cobro por usuario;
- reservas ilimitadas;
- clientes ilimitados;
- agenda;
- reservas públicas;
- caja;
- POS;
- comisiones;
- inventario;
- reportes;
- roles y permisos;
- operación completa del MVP.

Promesa:

> Un precio por barbería, no por cada barbero.

---

## 15. Planes futuros

### Nava Pro

No forma parte del MVP inicial.

Rango futuro estimado:

```text
USD 39 – 49 / mes
```

Podrá incluir:

- waitlist;
- cola virtual;
- check-in;
- anticipos;
- no-show protection;
- membresías;
- campañas;
- reseñas;
- automatizaciones;
- WhatsApp avanzado.

### Nava Multi

No vender hasta tener multi-sucursal estable.

Rango futuro:

```text
USD 49 – 59 / sucursal / mes
```

Podrá incluir:

- múltiples sucursales;
- reportes consolidados;
- cajas por ubicación;
- inventario por sede;
- permisos por local;
- métricas consolidadas.

---

## 16. WhatsApp

WhatsApp forma parte central de la visión del producto, pero no debe ofrecerse como recurso ilimitado sin conocer el coste real.

Modelo recomendado:

```text
WhatsApp manual
→ puede formar parte de Free

WhatsApp automático
→ plan superior o add-on
```

Funciones futuras:

- confirmaciones;
- recordatorios;
- cancelaciones;
- reprogramaciones;
- campañas;
- asistente IA.

Los paquetes se definirán cuando exista integración real con Meta/BSP y se conozca el coste por conversación o mensaje.

---

## 17. Pagos y propiedad del cliente

Nava no debe cobrar comisión por:

```text
reservas directas
clientes propios
reservas mediante QR
reservas mediante web propia
reservas mediante WhatsApp
```

Mensaje comercial:

> 0% de comisión por tus reservas directas.

En el MVP los métodos de pago continúan siendo:

- efectivo;
- transferencia;
- tarjeta externa;
- enlace externo;
- otros.

Los pagos integrados serán una futura fuente de monetización separada.

Principio obligatorio:

> Los datos de la barbería pertenecen a la barbería.

Un downgrade nunca debe borrar información histórica.

---

## 18. Métricas de producto

No medir el éxito únicamente por cuentas registradas.

### Activación

```text
registro completado
email verificado
onboarding completado
primer profesional
primer servicio
primer horario
primera reserva
```

### Uso

```text
5 reservas
10 reservas
20 reservas
30 reservas
40 reservas
```

### Conversión

```text
trial → paid
free → essential
free → local
```

### Retención

```text
WAU
MAU
reservas por organización
días activos
cierres de caja
```

Hipótesis inicial de evento de activación:

```text
20 reservas acumuladas
```

Eventos sugeridos:

```text
organization_reached_10_bookings
organization_reached_20_bookings
organization_reached_30_bookings
organization_reached_free_limit
organization_used_grace_bookings
subscription_upgrade_started
subscription_upgrade_completed
```

---

## 19. Funnel recomendado

```text
Registro
↓
Email verificado
↓
Onboarding completado
↓
Servicio creado
↓
Profesional configurado
↓
Horario configurado
↓
Primera reserva
↓
5 reservas
↓
10 reservas
↓
20 reservas
↓
30 reservas
↓
Límite Free
↓
Inicio de upgrade
↓
Pago
```

Esto permitirá determinar si 40 reservas es realmente el límite correcto.

El valor debe tratarse como una hipótesis configurable, no como una regla permanente.

---

## 20. Requisitos técnicos

La arquitectura vigente del proyecto utiliza:

```text
PostgreSQL
Prisma ORM
Node/Fastify API
Aplicación móvil Expo/React Native
Aplicación web Next.js
```

El backend debe ser la autoridad de los planes y límites.

Nunca depender únicamente de botones deshabilitados en la app.

### Entidades sugeridas

```text
plans
plan_limits
plan_features
subscriptions
subscription_usage
```

### Ejemplo de límites

```json
{
  "plan": "free",
  "limits": {
    "locations": 1,
    "professionals": 1,
    "rolling30DayBookings": 40,
    "clients": 100
  },
  "features": {
    "commissions": false,
    "inventory": false,
    "advancedReports": false,
    "automaticWhatsapp": false
  }
}
```

Los valores deben poder modificarse desde backend o administración.

---

## 21. Servicio de entitlements

Crear una capa central de dominio, por ejemplo:

```text
PlanEntitlementService
```

Responsabilidades:

- obtener plan efectivo;
- leer límites;
- leer features;
- calcular consumo;
- validar creación de reservas;
- validar alta de profesionales;
- validar alta de clientes;
- administrar cortesía;
- devolver uso a la UI.

Métodos conceptuales:

```ts
getEntitlements(organizationId);
getUsage(organizationId);
canCreateBooking(organizationId);
canCreateProfessional(organizationId);
canCreateClient(organizationId);
canUseFeature(organizationId, feature);
grantFirstBookingGrace(organizationId);
```

La API debe volver a validar siempre el límite antes de realizar la operación.

Ejemplo de error:

```json
{
  "code": "PLAN_BOOKING_LIMIT_REACHED",
  "message": "Has alcanzado el límite de reservas de Nava Free.",
  "upgradeRecommended": true
}
```

---

## 22. Downgrade

Si una organización con Nava Local vuelve a Free y tiene:

```text
5 profesionales
850 clientes
comisiones
inventario
```

Nava debe:

- conservar todo;
- permitir consultar datos históricos;
- permitir seleccionar un profesional activo para Free;
- marcar otros profesionales como bloqueados por plan;
- conservar clientes existentes;
- impedir nuevas operaciones que excedan límites;
- conservar historial financiero.

No eliminar datos automáticamente.

---

## 23. Upgrade

Después de un upgrade:

- desbloquear inmediatamente los límites;
- reactivar profesionales permitidos;
- reactivar reservas públicas;
- habilitar features correspondientes;
- no exigir reinstalar la app.

Mientras no exista cobro integrado, el administrador de plataforma podrá cambiar manualmente el plan desde el panel interno.

---

## 24. Política de precios

Los precios vigentes del MVP son USD 9,83 para Nava Esencial, USD 29,83 para
Nava Local y USD 48,83 para Nava Multi. Los planes están disponibles para
cuentas de tipo profesional y negocio; el tipo de cuenta no cambia el precio.

Nava Local puede usar el precio fundador de USD 19,93 cuando se ingrese el
código de promoción vigente y se mantenga la continuidad mensual.

---

## 25. Prácticas que NO deben utilizarse

No implementar para aumentar artificialmente la conversión:

- popups agresivos constantes;
- cuenta regresiva falsa;
- descuentos ficticios;
- bloqueo de datos históricos;
- eliminación de reservas;
- cargos inesperados;
- comisión sobre clientes propios;
- marketplace obligatorio;
- WhatsApp “ilimitado” sin conocer costes;
- pago por cada barbero en Nava Local.

La estrategia debe basarse en valor real y crecimiento.

---

## 26. Posicionamiento

Nava no debe venderse como:

> Una agenda barata.

Debe venderse como:

> El sistema operativo móvil de tu barbería.

Propuesta de valor:

> Agenda, clientes, caja y comisiones desde una sola app.

Diferenciadores:

```text
mobile-first
barbería-first
precio por local
sin comisión por reserva directa
sin marketplace obligatorio
sin cobrar por cada barbero dentro del plan de local
```

---

## 27. Relación con el MVP técnico

El MVP técnico debe permitir completar el ciclo:

```text
Crear barbería
→ configurar sucursal
→ agregar barberos
→ crear servicios
→ publicar reservas
→ recibir una cita
→ atender al cliente
→ cobrar
→ calcular comisión
→ cerrar caja
→ consultar resultados
```

La estrategia Freemium es una capa comercial sobre este ciclo.

No debe modificar ni debilitar las reglas críticas de:

- agenda;
- caja;
- comisiones;
- clientes;
- seguridad;
- aislamiento multi-tenant.

---

## 28. Orden recomendado de implementación

La monetización no debe desplazar el core pendiente del MVP.

### Etapa A — Preparación

Implementar durante la fase de planes y límites:

- planes;
- features;
- límites;
- suscripción;
- trial;
- servicio de entitlements.

### Etapa B — Nava Free

Implementar:

- 40 reservas rolling;
- 100 clientes;
- 1 profesional;
- validación backend;
- barra de uso;
- avisos progresivos;
- reservas de cortesía.

### Etapa C — Conversión

Implementar:

- pantalla de planes;
- flujo de upgrade;
- definición visible de límites y capacidades;
- cambio manual de plan desde admin.

### Etapa D — Cobro real

Cuando se seleccione proveedor:

- checkout;
- webhooks;
- renovación;
- pago fallido;
- periodo de gracia;
- cancelación.

---

## 29. Criterios de aceptación

La estrategia Freemium estará correctamente implementada cuando:

1. una cuenta nueva recibe el trial correspondiente;
2. el trial expira automáticamente;
3. la organización pasa a Free;
4. ningún dato se elimina;
5. Free permite operar dentro de sus límites;
6. la API bloquea el exceso de reservas;
7. la app muestra el consumo actual;
8. la web pública respeta el límite;
9. la cortesía se aplica una sola vez;
10. un upgrade elimina inmediatamente los límites correspondientes;
11. un downgrade conserva datos;
12. los límites pueden modificarse en backend;
13. se generan métricas del funnel;
14. Nava Local no cobra por cada barbero;
15. no existe comisión por reservas directas.

---

## 30. Métricas posteriores al lanzamiento

Revisar periódicamente:

```text
% onboarding completado
% que crea primera reserva
% que llega a 5 reservas
% que llega a 10 reservas
% que llega a 20 reservas
% que llega a 30 reservas
% que llega a 40 reservas
% que usa la cortesía
% que inicia upgrade
% que paga
tiempo medio hasta upgrade
churn del primer mes
```

Pregunta principal:

> ¿En qué volumen de reservas el usuario siente que Nava ya forma parte de su operación diaria?

Si muchos usuarios nunca llegan a 20 reservas, probablemente el problema no sea el precio sino activación, onboarding, adquisición o producto.

Si muchos llegan a 40 y no pagan, revisar precio, valor premium, comunicación o límite.

---

## 31. Decisión inicial de producto

Para el primer MVP comercial se adopta como hipótesis:

```text
Trial Nava Local
10 días

Nava Free
USD 0
1 profesional
1 sucursal
40 reservas rolling / 30 días
100 clientes

Nava Esencial
USD 9.83 / mes
1 profesional
1 sucursal
reservas ilimitadas
clientes ilimitados

Nava Local
USD 29.83 / mes
1 sucursal
profesionales ilimitados sin cobro por usuario
MVP completo
```

Estas cifras son hipótesis comerciales y deberán ajustarse con datos reales de los primeros pilotos.

---

## 32. Principio final

La filosofía comercial de Nava será:

> Deja que el usuario empiece gratis.  
> Deja que experimente valor real.  
> Deja que su negocio crezca.  
> Cobra cuando Nava ya está ayudando a sostener ese crecimiento.

El usuario no debe pagar porque Nava le puso obstáculos.

Debe pagar porque:

> ya no quiere operar su barbería sin Nava.
