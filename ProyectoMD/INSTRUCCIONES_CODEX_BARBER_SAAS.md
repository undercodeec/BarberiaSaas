# Instrucciones maestras para Codex — SaaS móvil para barberías

> Documento de ejecución técnica para construir progresivamente el MVP de un SaaS de barberías orientado a Ecuador y Latinoamérica.

---

## 1. Objetivo del proyecto

Construir un SaaS móvil-first para barberías pequeñas y medianas de 1 a 5 sucursales.

La propuesta central del producto es:

> Administrar agenda, reservas, clientes, caja y comisiones desde el celular, con una experiencia orientada a WhatsApp, sin cobrar por cada barbero y sin comisiones por reservas directas.

El sistema debe comenzar como una aplicación móvil para propietarios, recepcionistas y barberos. También debe incluir una página web pública para que los clientes reserven sin instalar una aplicación.

La arquitectura debe permitir desarrollar posteriormente un panel completo de escritorio sin reemplazar el backend, el modelo de datos ni las reglas de negocio.

Nombre de trabajo del proyecto:

```text
barber-saas
```

No utilizar el nombre de trabajo como marca definitiva en textos comerciales o contratos.

---

## 2. Instrucciones obligatorias para Codex

Codex debe cumplir las siguientes reglas durante todo el desarrollo.

### 2.1 Forma de trabajo

1. Trabajar por fases pequeñas y verificables.
2. No implementar varias fases en una sola ejecución salvo que se solicite expresamente.
3. Antes de modificar código:
   - revisar la estructura actual del repositorio;
   - leer este documento;
   - leer `README.md`;
   - leer los documentos existentes en `/docs`;
   - identificar migraciones y decisiones previas;
   - presentar un plan breve de los archivos que se modificarán.
4. No sobrescribir decisiones funcionales ya implementadas sin explicar el motivo.
5. No agregar funcionalidades que estén fuera del MVP.
6. No dejar código incompleto, pantallas falsas o botones sin comportamiento, excepto cuando la tarea solicite expresamente un prototipo.
7. No usar datos hardcodeados en producción.
8. No duplicar reglas de negocio entre móvil, web y backend.
9. Las reglas críticas deben vivir en el backend o en funciones de dominio compartidas.
10. Al finalizar cada tarea, ejecutar como mínimo:
    - formateo;
    - lint;
    - verificación de tipos;
    - pruebas relacionadas;
    - build de los paquetes afectados, cuando sea posible.
11. Documentar cada decisión relevante en `/docs/adr`.
12. Crear migraciones reversibles y nunca editar una migración ya aplicada.
13. Mantener el proyecto ejecutable después de cada fase.
14. Informar claramente:
    - archivos creados o modificados;
    - migraciones agregadas;
    - comandos ejecutados;
    - pruebas realizadas;
    - limitaciones pendientes;
    - siguiente tarea recomendada.

### 2.2 Calidad del código

Todo el código debe:

- utilizar TypeScript estricto;
- evitar `any`;
- usar nombres descriptivos;
- separar UI, dominio, acceso a datos y servicios externos;
- validar entradas con Zod;
- manejar estados de carga, vacío, éxito y error;
- mostrar mensajes de error comprensibles en español;
- contemplar accesibilidad;
- funcionar correctamente en pantallas móviles pequeñas;
- incluir pruebas para reglas financieras y de agenda;
- proteger operaciones críticas contra concurrencia;
- usar fechas en UTC en base de datos;
- convertir fechas a la zona horaria del local al presentarlas.

### 2.3 Prohibiciones

Codex no debe:

- exponer claves privadas o `service_role`;
- guardar secretos en código;
- desactivar Row Level Security para facilitar el desarrollo;
- confiar en `organization_id` enviado por el cliente sin comprobar membresía;
- calcular comisiones solamente en el cliente;
- crear citas críticas únicamente con inserciones directas sin protección transaccional;
- permitir doble reserva por condiciones de carrera;
- integrar pagos reales durante el primer MVP;
- integrar IA conversacional durante el primer MVP;
- crear marketplace;
- implementar facturación electrónica del SRI en esta fase;
- implementar nómina legal;
- implementar múltiples países en profundidad;
- implementar una aplicación para consumidores;
- compartir contraseñas entre usuarios;
- utilizar una cuenta genérica para todos los barberos.

---

## 3. Alcance del MVP

El MVP debe permitir completar el siguiente ciclo:

```text
Crear barbería
→ configurar sucursal
→ agregar barberos
→ crear servicios
→ publicar enlace de reservas
→ recibir una cita
→ atender al cliente
→ cobrar el servicio
→ calcular la comisión
→ cerrar caja
→ consultar el resultado del día
```

### 3.1 Módulos incluidos

1. Autenticación.
2. Organización y sucursal.
3. Usuarios, roles y permisos.
4. Barberos y horarios.
5. Servicios.
6. Agenda.
7. Reservas públicas.
8. Clientes e historial.
9. Caja y POS básico.
10. Comisiones básicas.
11. Inventario básico.
12. Notificaciones por medio de una capa de proveedores.
13. Reportes esenciales.
14. Suscripción simulada y límites de plan.
15. Panel interno mínimo del operador del SaaS.

### 3.2 Fuera del MVP

No implementar todavía:

- asistente de IA;
- chatbot que reserve automáticamente;
- recepción telefónica;
- marketplace;
- wallet;
- pasarela de pagos integrada;
- facturación electrónica;
- membresías;
- gift cards;
- paquetes;
- puntos;
- campañas masivas;
- automatización de reseñas;
- control biométrico;
- nómina;
- préstamos;
- multas;
- renta automática de silla;
- proveedores y órdenes de compra;
- transferencias de inventario entre locales;
- predicción de demanda;
- precios dinámicos;
- white-label;
- aplicación separada para clientes;
- panel de escritorio completo;
- multi-sucursal avanzada.

Diseñar el modelo para permitir estas extensiones posteriormente, pero no construirlas.

---

## 4. Arquitectura técnica

## 4.1 Monorepositorio

Utilizar:

- `pnpm`;
- Turborepo;
- TypeScript;
- Node.js LTS.

Estructura inicial:

```text
barber-saas/
├── apps/
│   ├── mobile/
│   ├── web/
│   └── admin/
├── packages/
│   ├── api-client/
│   ├── domain/
│   ├── database/
│   ├── validation/
│   ├── permissions/
│   ├── design-tokens/
│   ├── config/
│   └── test-utils/
├── apps/api/
├── packages/database/
│   └── prisma/
├── compose.yaml
├── docs/
│   ├── adr/
│   ├── product/
│   ├── database/
│   └── testing/
├── .env.example
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
└── README.md
```

## 4.2 Aplicación móvil

Utilizar:

- React Native;
- Expo;
- Expo Router;
- TypeScript;
- TanStack Query;
- React Hook Form;
- Zod;
- Zustand únicamente para estado local de interfaz;
- Expo Secure Store para tokens o preferencias sensibles;
- persistencia de caché de lectura cuando sea conveniente.

La aplicación móvil será utilizada por:

- propietario;
- administrador;
- recepcionista;
- barbero.

No construir cuatro aplicaciones. Construir una sola aplicación con navegación y permisos por rol.

## 4.3 Aplicación web

Utilizar Next.js con App Router para:

- landing pública del SaaS;
- página pública de cada barbería;
- flujo de reservas;
- gestión pública de una cita;
- panel interno básico;
- futuro panel de escritorio.

Utilizar:

- React;
- TypeScript;
- Tailwind CSS;
- componentes accesibles;
- Server Components cuando sean apropiados;
- Client Components solo cuando exista interacción real.

## 4.4 Backend

La decisión vigente está definida en ADR 0003:

- PostgreSQL;
- Prisma ORM para esquema, cliente tipado y migraciones;
- API Node/Fastify como única frontera de datos;
- sesiones opacas gestionadas por la API;
- autorización multi-tenant y permisos aplicados en backend;
- eventos incrementales mediante la API para sincronización móvil;
- despliegue inicial en VPS.

Supabase Auth, RLS, RPC, Storage y Realtime no forman parte de la implementación
actual. PostgreSQL podrá trasladarse posteriormente a Supabase como servicio
administrado sin cambiar el contrato de los clientes.

No conectar lógica crítica directamente desde la UI mediante inserciones simples.

Operaciones críticas que deben ejecutarse en servicios transaccionales de la API:

- creación de citas;
- reprogramación;
- cancelación;
- apertura de caja;
- cierre de caja;
- registro de venta;
- pago de venta;
- cálculo y liquidación de comisiones;
- ajustes de inventario;
- cambio de plan;
- invitación de usuarios.

## 4.5 Código compartido

Compartir entre móvil y web:

- tipos;
- esquemas Zod;
- cliente de API;
- reglas de permisos;
- reglas de agenda;
- cálculos de precio;
- cálculos de comisión;
- normalización de fechas;
- estados y enumeraciones;
- utilidades monetarias;
- tokens de diseño.

No forzar reutilización total de componentes visuales.

La agenda móvil y la agenda futura de escritorio pueden tener interfaces diferentes mientras compartan reglas de dominio.

---

## 5. Principios de diseño del dominio

## 5.1 Multi-tenant desde el inicio

Todas las entidades operativas deben pertenecer a una organización.

Usar:

```text
organization_id
location_id
```

cuando corresponda.

Cada usuario accede a una organización por medio de una membresía.

Nunca autorizar acceso únicamente porque el cliente envió un `organization_id`.

## 5.2 Una sucursal en el producto inicial

La interfaz del MVP puede limitar cada plan inicial a una sucursal.

Sin embargo:

- la base de datos debe soportar varias sucursales;
- las citas deben pertenecer a una sucursal;
- las cajas deben pertenecer a una sucursal;
- los profesionales pueden estar asociados a una o más sucursales;
- los reportes deben filtrar por sucursal.

## 5.3 Dinero

Guardar montos como enteros en la unidad mínima de moneda.

Ejemplo:

```text
USD 15.50 = 1550
```

Usar nombres como:

```text
price_amount
subtotal_amount
tax_amount
discount_amount
tip_amount
total_amount
paid_amount
balance_amount
```

Nunca usar `float` para dinero.

En el MVP:

- moneda predeterminada: USD;
- código de moneda ISO: `USD`;
- impuestos configurables, pero sin integración fiscal;
- todos los cálculos deben ser reproducibles en backend.

## 5.4 Fechas y zonas horarias

- almacenar timestamps en UTC;
- guardar `timezone` en cada sucursal;
- utilizar zona horaria IANA, por ejemplo `America/Guayaquil`;
- mostrar horas en la zona del local;
- evitar cálculos de agenda con la zona del dispositivo;
- manejar cambios de zona si el producto se expande a otros países.

## 5.5 Auditoría

Crear `audit_logs` para registrar acciones críticas:

- creación y modificación de citas;
- cancelaciones;
- apertura y cierre de caja;
- ventas;
- pagos;
- ajustes de inventario;
- cambio de reglas de comisión;
- liquidaciones;
- cambios de roles;
- eliminación lógica de información.

Campos mínimos:

```text
id
organization_id
location_id
actor_user_id
entity_type
entity_id
action
before_data
after_data
metadata
created_at
```

---

## 6. Roles y permisos

Roles iniciales:

```text
owner
manager
receptionist
barber
platform_admin
```

### 6.1 Propietario

Puede:

- administrar el negocio;
- administrar sucursales;
- invitar usuarios;
- asignar roles;
- configurar servicios;
- consultar todas las citas;
- abrir y cerrar caja;
- registrar ventas;
- consultar reportes;
- configurar comisiones;
- liquidar comisiones;
- consultar inventario;
- administrar suscripción.

### 6.2 Administrador

Puede realizar casi todas las operaciones del propietario, excepto:

- transferir propiedad;
- eliminar organización;
- cambiar plan;
- acceder a información de facturación del SaaS;
- convertir a otro usuario en propietario.

En clientes puede consultar y gestionar la ficha completa, incluido teléfono.
La exportación masiva de clientes permanece exclusiva del propietario.

### 6.3 Recepcionista

Puede:

- consultar únicamente clientes relacionados con citas de sus sucursales
  asignadas;
- ver el teléfono enmascarado;
- crear citas;
- reprogramar;
- cancelar;
- registrar llegada;
- crear ventas;
- registrar cobros;
- abrir o cerrar caja si tiene permiso explícito.

No puede:

- ver márgenes globales;
- cambiar planes;
- modificar reglas de comisión;
- liquidar comisiones.
- ver o modificar la ficha personal completa del cliente;
- importar, exportar o eliminar clientes;
- consultar notas privadas de clientes.

### 6.4 Barbero

Puede:

- ver su agenda;
- ver únicamente clientes relacionados con sus propias citas;
- ver el teléfono enmascarado;
- registrar y consultar únicamente sus propias notas del servicio;
- cambiar estados operativos de sus citas;
- bloquear horarios permitidos;
- consultar sus propias comisiones;
- consultar sus propinas.

No puede:

- ver resultados financieros de otros barberos;
- ver caja global;
- ver clientes de otra organización;
- modificar precios generales;
- modificar reglas de comisión.
- ver o modificar la ficha personal completa del cliente;
- importar, exportar o eliminar clientes.

### 6.5 Administrador de plataforma

Es un rol interno del SaaS.

Debe operar desde el panel `apps/admin`.

No debe mezclarse con permisos de las barberías.

---

## 7. Modelo de datos inicial

Codex debe crear migraciones ordenadas y documentar el esquema en:

```text
docs/database/schema.md
```

## 7.1 Organizaciones y usuarios

### `organizations`

Campos sugeridos:

```text
id uuid pk
name text
slug text unique
status enum(active, trial, suspended, cancelled)
currency_code char(3)
default_timezone text
created_at timestamptz
updated_at timestamptz
deleted_at timestamptz nullable
```

### `locations`

```text
id uuid pk
organization_id uuid fk
name text
slug text
phone text
whatsapp_phone text
email text nullable
address_line text nullable
city text nullable
country_code char(2)
timezone text
currency_code char(3)
is_active boolean
created_at timestamptz
updated_at timestamptz
```

Restricción:

```text
unique(organization_id, slug)
```

### `profiles`

Relacionada con `auth.users`.

```text
id uuid pk references auth.users
full_name text
phone text nullable
avatar_path text nullable
locale text default 'es'
created_at timestamptz
updated_at timestamptz
```

### `memberships`

```text
id uuid pk
organization_id uuid fk
user_id uuid fk
role enum
status enum(invited, active, suspended)
created_at timestamptz
updated_at timestamptz
```

Restricción:

```text
unique(organization_id, user_id)
```

### `member_locations`

```text
membership_id uuid fk
location_id uuid fk
created_at timestamptz
primary key(membership_id, location_id)
```

## 7.2 Profesionales y horarios

### `professionals`

Un profesional puede estar vinculado o no a un usuario autenticado.

```text
id uuid pk
organization_id uuid fk
user_id uuid nullable
display_name text
bio text nullable
phone text nullable
avatar_path text nullable
status enum(active, inactive)
commission_visibility boolean
created_at timestamptz
updated_at timestamptz
```

### `professional_locations`

```text
professional_id uuid fk
location_id uuid fk
is_primary boolean
created_at timestamptz
primary key(professional_id, location_id)
```

### `working_hours`

```text
id uuid pk
organization_id uuid fk
location_id uuid fk
professional_id uuid nullable
day_of_week smallint
start_local_time time
end_local_time time
is_active boolean
created_at timestamptz
updated_at timestamptz
```

Usar `professional_id = null` para horario general del local.

### `schedule_blocks`

```text
id uuid pk
organization_id uuid fk
location_id uuid fk
professional_id uuid nullable
starts_at timestamptz
ends_at timestamptz
reason text nullable
block_type enum(personal, break, holiday, maintenance, other)
created_by uuid
created_at timestamptz
updated_at timestamptz
```

## 7.3 Servicios

### `service_categories`

```text
id uuid pk
organization_id uuid fk
name text
sort_order integer
is_active boolean
created_at timestamptz
updated_at timestamptz
```

### `services`

```text
id uuid pk
organization_id uuid fk
category_id uuid nullable
name text
description text nullable
duration_minutes integer
buffer_before_minutes integer default 0
buffer_after_minutes integer default 0
price_amount bigint
currency_code char(3)
is_public boolean
is_active boolean
created_at timestamptz
updated_at timestamptz
```

Validaciones:

- duración mayor que cero;
- precio igual o mayor que cero;
- buffers no negativos.

### `professional_services`

```text
professional_id uuid fk
service_id uuid fk
custom_duration_minutes integer nullable
custom_price_amount bigint nullable
is_active boolean
created_at timestamptz
updated_at timestamptz
primary key(professional_id, service_id)
```

## 7.4 Clientes

### `clients`

```text
id uuid pk
organization_id uuid fk
full_name text
phone_e164 text
email text nullable
birth_date date nullable
preferred_professional_id uuid nullable
notes text nullable
source enum(manual, public_booking, import, whatsapp, other)
total_visits integer default 0
total_spent_amount bigint default 0
last_visit_at timestamptz nullable
created_at timestamptz
updated_at timestamptz
deleted_at timestamptz nullable
```

Crear índice por:

```text
organization_id
phone_e164
email
full_name
```

No utilizar un `unique` global por teléfono. Un mismo cliente puede existir en varias organizaciones.

### `client_service_notes`

```text
id uuid pk
organization_id uuid fk
client_id uuid fk
appointment_id uuid nullable
professional_id uuid nullable
note_text text
guard_number text nullable
style_description text nullable
reference_image_path text nullable
created_by uuid
created_at timestamptz
updated_at timestamptz
```

## 7.5 Citas

### `appointments`

```text
id uuid pk
organization_id uuid fk
location_id uuid fk
client_id uuid fk
professional_id uuid nullable
source enum(manual, public_booking, whatsapp, walk_in)
status enum(
  pending,
  confirmed,
  arrived,
  in_service,
  completed,
  cancelled,
  no_show
)
starts_at timestamptz
ends_at timestamptz
customer_notes text nullable
internal_notes text nullable
cancellation_reason text nullable
cancelled_at timestamptz nullable
cancelled_by uuid nullable
created_by uuid nullable
created_at timestamptz
updated_at timestamptz
```

### `appointment_services`

```text
id uuid pk
appointment_id uuid fk
service_id uuid fk
professional_id uuid nullable
service_name_snapshot text
duration_minutes_snapshot integer
price_amount_snapshot bigint
sort_order integer
created_at timestamptz
```

Los datos snapshot son obligatorios. Cambiar el precio de un servicio no debe alterar citas históricas.

### Prevención de doble reserva

La prevención debe existir en base de datos.

Implementar una estrategia transaccional con:

- `tstzrange(starts_at, ends_at, '[)')`;
- extensión `btree_gist`;
- restricción de exclusión por profesional y rango;
- aplicar únicamente a estados que ocupan agenda;
- no considerar canceladas o no-show como bloqueo;
- una cita sin profesional puede existir, pero debe asignarse antes de iniciar atención.

Ejemplo conceptual:

```sql
exclude using gist (
  professional_id with =,
  tstzrange(starts_at, ends_at, '[)') with &&
)
where (
  professional_id is not null
  and status in ('pending', 'confirmed', 'arrived', 'in_service')
);
```

Además, el servicio transaccional de creación en la API debe:

1. validar organización y sucursal;
2. comprobar membresía o token público válido;
3. validar servicios;
4. calcular duración total;
5. validar horario laboral;
6. validar bloqueos;
7. validar disponibilidad;
8. crear cliente o reutilizarlo;
9. crear cita;
10. crear servicios snapshot;
11. registrar auditoría;
12. devolver la cita completa.

## 7.6 Caja y ventas

### `cash_sessions`

```text
id uuid pk
organization_id uuid fk
location_id uuid fk
status enum(open, closed)
opened_by uuid
opened_at timestamptz
opening_amount bigint
closed_by uuid nullable
closed_at timestamptz nullable
expected_amount bigint nullable
counted_amount bigint nullable
difference_amount bigint nullable
notes text nullable
created_at timestamptz
updated_at timestamptz
```

Solo puede existir una sesión de caja abierta por sucursal en el MVP.

### `sales`

```text
id uuid pk
organization_id uuid fk
location_id uuid fk
cash_session_id uuid nullable
appointment_id uuid nullable
client_id uuid nullable
professional_id uuid nullable
status enum(draft, open, partially_paid, paid, voided, refunded)
subtotal_amount bigint
discount_amount bigint
tip_amount bigint
tax_amount bigint
total_amount bigint
paid_amount bigint
balance_amount bigint
currency_code char(3)
created_by uuid
created_at timestamptz
updated_at timestamptz
```

### `sale_items`

```text
id uuid pk
sale_id uuid fk
item_type enum(service, product, custom)
service_id uuid nullable
product_id uuid nullable
professional_id uuid nullable
description_snapshot text
quantity numeric
unit_price_amount bigint
discount_amount bigint
line_total_amount bigint
created_at timestamptz
```

### `payments`

```text
id uuid pk
organization_id uuid fk
location_id uuid fk
sale_id uuid fk
cash_session_id uuid nullable
method enum(cash, bank_transfer, external_card, external_link, other)
status enum(pending, completed, failed, reversed)
amount bigint
reference text nullable
received_by uuid
received_at timestamptz
created_at timestamptz
```

### `cash_movements`

```text
id uuid pk
organization_id uuid fk
location_id uuid fk
cash_session_id uuid fk
movement_type enum(opening, sale, expense, withdrawal, deposit, adjustment, closing)
direction enum(in, out)
amount bigint
description text
related_sale_id uuid nullable
related_payment_id uuid nullable
created_by uuid
created_at timestamptz
```

Las ventas y pagos deben modificar caja de manera transaccional.

## 7.7 Comisiones

### `commission_rules`

```text
id uuid pk
organization_id uuid fk
professional_id uuid fk
service_id uuid nullable
product_id uuid nullable
rule_type enum(service_percentage, service_fixed, product_percentage, product_fixed)
value numeric
priority integer
is_active boolean
effective_from date
effective_to date nullable
created_at timestamptz
updated_at timestamptz
```

Reglas iniciales:

- porcentaje por servicio;
- monto fijo por servicio;
- porcentaje por producto;
- monto fijo por producto.

### `commission_entries`

```text
id uuid pk
organization_id uuid fk
location_id uuid fk
professional_id uuid fk
sale_id uuid fk
sale_item_id uuid fk
rule_id uuid nullable
base_amount bigint
commission_amount bigint
status enum(pending, approved, settled, reversed)
calculation_snapshot jsonb
created_at timestamptz
updated_at timestamptz
```

### `commission_settlements`

```text
id uuid pk
organization_id uuid fk
professional_id uuid fk
period_start date
period_end date
gross_generated_amount bigint
commission_amount bigint
tips_amount bigint
adjustments_amount bigint
total_payable_amount bigint
status enum(draft, approved, paid, cancelled)
approved_by uuid nullable
approved_at timestamptz nullable
paid_by uuid nullable
paid_at timestamptz nullable
notes text nullable
created_at timestamptz
updated_at timestamptz
```

El cálculo debe ser reproducible.

Guardar en `calculation_snapshot`:

- regla aplicada;
- porcentaje o monto;
- base;
- descuentos considerados;
- resultado;
- versión del algoritmo.

## 7.8 Inventario

### `products`

```text
id uuid pk
organization_id uuid fk
name text
sku text nullable
barcode text nullable
cost_amount bigint
sale_price_amount bigint
currency_code char(3)
stock_tracking_enabled boolean
minimum_stock numeric default 0
is_active boolean
created_at timestamptz
updated_at timestamptz
```

### `location_inventory`

```text
location_id uuid fk
product_id uuid fk
quantity_on_hand numeric
updated_at timestamptz
primary key(location_id, product_id)
```

### `stock_movements`

```text
id uuid pk
organization_id uuid fk
location_id uuid fk
product_id uuid fk
movement_type enum(opening, purchase, sale, adjustment, return, loss)
direction enum(in, out)
quantity numeric
unit_cost_amount bigint nullable
related_sale_item_id uuid nullable
notes text nullable
created_by uuid
created_at timestamptz
```

Nunca modificar `quantity_on_hand` sin crear el movimiento correspondiente.

## 7.9 Notificaciones

### `notification_templates`

```text
id uuid pk
organization_id uuid nullable
channel enum(in_app, email, whatsapp)
event_type enum(
  appointment_created,
  appointment_confirmed,
  appointment_reminder,
  appointment_rescheduled,
  appointment_cancelled
)
name text
body_template text
is_active boolean
created_at timestamptz
updated_at timestamptz
```

### `notification_logs`

```text
id uuid pk
organization_id uuid fk
appointment_id uuid nullable
client_id uuid nullable
channel enum(in_app, email, whatsapp)
event_type text
provider text
provider_message_id text nullable
status enum(queued, sent, delivered, failed, skipped)
recipient text
payload jsonb
error_message text nullable
scheduled_for timestamptz nullable
sent_at timestamptz nullable
created_at timestamptz
updated_at timestamptz
```

Durante el MVP:

- implementar proveedor `console`;
- implementar proveedor `mock`;
- permitir integración futura con WhatsApp;
- no acoplar la agenda a Meta directamente.

## 7.10 Suscripción

### `plans`

```text
id uuid pk
code text unique
name text
monthly_price_amount bigint
currency_code char(3)
limits jsonb
features jsonb
is_active boolean
created_at timestamptz
updated_at timestamptz
```

### `subscriptions`

```text
id uuid pk
organization_id uuid fk unique
plan_id uuid fk
status enum(trial, active, past_due, suspended, cancelled)
trial_ends_at timestamptz nullable
current_period_start timestamptz
current_period_end timestamptz
created_at timestamptz
updated_at timestamptz
```

No integrar cobro real.

Crear planes de prueba:

```text
solo
local_essential
local_pro
multi
```

Los límites deben poder verificarse en backend.

---

## 8. Seguridad y autorización multi-tenant

## 8.1 Principio general

Toda operación multi-tenant debe derivar la organización desde la sesión y la
membresía activa en el servidor. Ningún identificador enviado por el cliente puede
otorgar acceso por sí mismo. Los permisos por rol deben centralizarse y probarse.

La versión actual admite una sola organización activa por cuenta. Aceptar una
invitación de otra organización debe rechazarse hasta que exista un selector de
contexto explícito y seguro.

## 8.2 Reglas mínimas

- Un usuario solo puede leer organizaciones donde tenga membresía activa.
- Un barbero solo puede consultar:
  - sus citas;
  - sus clientes relacionados;
  - sus notas;
  - sus comisiones.
- Un recepcionista puede administrar citas de sus sucursales y consultar los
  clientes relacionados con teléfono enmascarado, sin exportar ni modificar su
  ficha personal.
- Un manager puede gestionar fichas completas de clientes, pero no exportarlas
  de forma masiva.
- Un manager puede consultar operaciones de su organización.
- Un owner puede administrar configuración y usuarios.
- Un `platform_admin` no se obtiene mediante metadatos editables del usuario.
- El rol interno debe verificarse en una tabla protegida.
- Las páginas públicas no deben usar credenciales privadas.
- Las reservas públicas deben ejecutarse mediante endpoints públicos controlados de la API.
- Los tokens públicos de gestión de reserva deben ser:
  - aleatorios;
  - con vencimiento;
  - de un solo propósito;
  - almacenados hasheados.

## 8.3 Protección de datos

- No mostrar correo ni teléfono completos en logs.
- No guardar datos de tarjeta.
- No almacenar documentos de identidad en el MVP.
- No registrar secretos de proveedores en `notification_logs`.
- Sanitizar nombres de archivos.
- Separar buckets públicos y privados.
- Usar URLs firmadas o endpoints autenticados para fotografías privadas.
- Implementar eliminación lógica para clientes y organizaciones.
- Implementar exportación básica de clientes en CSV exclusivamente para el
  propietario.

---

## 9. Reglas críticas de agenda

La agenda es la función más sensible del producto.

## 9.1 Disponibilidad

La disponibilidad de un profesional depende de:

```text
horario del local
∩ horario del profesional
- bloqueos
- citas activas
- buffers
- duración de servicios
```

La disponibilidad debe calcularse en backend.

## 9.2 Duración

Una cita puede contener varios servicios.

Duración total:

```text
buffer_before
+ suma de servicios
+ buffer_after
```

Para el MVP, utilizar el mayor buffer previo y posterior entre los servicios, o documentar otra regla simple y consistente.

## 9.3 Estados que bloquean horario

Bloquean:

```text
pending
confirmed
arrived
in_service
```

No bloquean:

```text
cancelled
no_show
completed
```

Una cita completada conserva su horario histórico, pero no debe impedir recrear manualmente una cita retroactiva con permisos administrativos.

## 9.4 Reprogramación

Debe ser transaccional.

La reprogramación debe:

1. validar permisos;
2. bloquear la fila;
3. comprobar nueva disponibilidad;
4. actualizar fechas;
5. conservar historial en auditoría;
6. registrar notificación;
7. evitar estados inválidos.

## 9.5 Cancelación

Solicitar:

- motivo opcional;
- actor;
- fecha;
- canal.

No eliminar la cita.

## 9.6 Citas públicas

El flujo público debe:

1. seleccionar sucursal;
2. seleccionar servicios;
3. seleccionar profesional o “cualquiera”;
4. consultar disponibilidad real;
5. seleccionar horario;
6. solicitar nombre y teléfono;
7. aceptar política de reserva;
8. crear cita;
9. mostrar confirmación;
10. generar token de gestión;
11. encolar notificación.

## 9.7 Idempotencia

Las operaciones públicas deben aceptar una clave de idempotencia.

Evitar citas duplicadas cuando el cliente presiona varias veces o pierde conexión.

---

## 10. Reglas de caja y POS

## 10.1 Apertura

No se pueden registrar movimientos de efectivo sin una caja abierta, excepto con permiso administrativo y auditoría.

Una sucursal solo puede tener una caja abierta en el MVP.

## 10.2 Venta desde cita

Al completar una cita:

- permitir crear una venta con servicios snapshot;
- permitir agregar productos;
- permitir propina;
- permitir descuento autorizado;
- calcular total;
- registrar uno o más pagos;
- permitir pago parcial;
- actualizar saldo.

No marcar una venta como pagada si existe saldo.

## 10.3 Métodos iniciales

```text
cash
bank_transfer
external_card
external_link
other
```

`external_card` significa que el pago fue procesado fuera del SaaS.

## 10.4 Cierre de caja

Calcular:

```text
fondo inicial
+ ingresos de efectivo
+ depósitos manuales
- gastos
- retiros
= efectivo esperado
```

Solicitar efectivo contado.

Calcular diferencia.

Guardar todos los valores del cierre.

Después del cierre:

- no permitir cambios silenciosos;
- cualquier corrección debe crear un movimiento de ajuste en una nueva sesión o mediante permiso administrativo;
- registrar auditoría.

---

## 11. Reglas de comisiones

## 11.1 Momento del cálculo

Calcular comisión cuando:

- la venta está pagada;
- el servicio está completado;
- el ítem tiene profesional asignado.

No calcular comisión sobre:

- ventas anuladas;
- pagos fallidos;
- artículos sin profesional;
- saldos pendientes, salvo que la organización configure lo contrario en una fase futura.

## 11.2 Descuentos

Para el MVP:

- el descuento proporcional reduce la base de comisión;
- la propina no forma parte de la base;
- la propina se asigna por separado;
- impuestos no forman parte de la base.

Documentar esta decisión en ADR.

## 11.3 Reversión

Si se anula o revierte una venta:

- no borrar la comisión;
- crear reversión;
- mantener trazabilidad.

## 11.4 Liquidación

La liquidación debe seleccionar entradas pendientes dentro de un período.

Debe:

1. bloquear entradas seleccionadas;
2. calcular total;
3. generar settlement;
4. marcar entradas como liquidadas;
5. registrar auditoría.

No permitir que la misma entrada pertenezca a dos liquidaciones.

---

## 12. Experiencia móvil

## 12.1 Navegación del propietario

Tabs sugeridas:

```text
Inicio
Agenda
Caja
Clientes
Más
```

Dentro de “Más”:

```text
Equipo
Servicios
Comisiones
Productos
Reportes
Configuración
Suscripción
Ayuda
```

## 12.2 Navegación del barbero

Tabs sugeridas:

```text
Mi día
Agenda
Clientes
Comisiones
Perfil
```

## 12.3 Pantalla de inicio del propietario

Mostrar:

- citas de hoy;
- citas próximas;
- ventas cobradas;
- caja abierta o cerrada;
- barberos trabajando;
- cancelaciones;
- accesos rápidos.

No crear gráficos complejos en el MVP.

## 12.4 Pantalla de agenda

Debe permitir:

- vista diaria;
- cambio de fecha;
- filtro por profesional;
- crear cita;
- tocar cita para abrir detalle;
- mostrar estados;
- mostrar huecos;
- mostrar bloqueos;
- reprogramar mediante formulario;
- no depender únicamente de drag and drop.

## 12.5 Estados de interfaz

Toda pantalla que consulte datos debe implementar:

```text
loading
empty
error
success
refreshing
```

## 12.6 Accesibilidad

- objetivos táctiles amplios;
- contraste suficiente;
- etiquetas accesibles;
- evitar depender solo del color;
- tamaño de fuente legible;
- formularios compatibles con teclado;
- mensajes de error junto al campo.

---

## 13. Página pública de reservas

Ruta sugerida:

```text
/{organizationSlug}/{locationSlug}
```

Páginas:

```text
/{organizationSlug}/{locationSlug}
/{organizationSlug}/{locationSlug}/book
/booking/{publicToken}
/booking/{publicToken}/cancel
/booking/{publicToken}/reschedule
```

Contenido:

- logo;
- nombre;
- dirección;
- horario;
- servicios;
- profesionales;
- disponibilidad;
- contacto por WhatsApp;
- políticas;
- confirmación.

Requisitos:

- mobile-first;
- rápida;
- indexable en la página informativa;
- el flujo de reserva puede ser dinámico;
- no exigir cuenta;
- no exigir descargar aplicación;
- no mostrar información interna;
- protección contra abuso;
- rate limiting;
- captcha configurable en una fase posterior;
- analytics básicos de conversión.

---

## 14. Capa de integraciones

Crear interfaces desde el inicio.

## 14.1 Notificaciones

```ts
interface NotificationProvider {
  send(input: NotificationMessage): Promise<NotificationResult>;
}
```

Proveedores iniciales:

```text
ConsoleNotificationProvider
MockNotificationProvider
```

Proveedores futuros:

```text
MetaWhatsAppProvider
EmailProvider
SmsProvider
```

## 14.2 Pagos

Crear interfaz, pero no integrar.

```ts
interface PaymentProvider {
  createPaymentLink(input: PaymentLinkInput): Promise<PaymentLinkResult>;
  getPaymentStatus(externalId: string): Promise<PaymentStatusResult>;
}
```

Proveedor inicial:

```text
ManualExternalPaymentProvider
```

## 14.3 Almacenamiento

Usar una abstracción ligera para:

- logos;
- avatares;
- fotografías de referencia.

No acoplar componentes visuales a rutas internas del bucket.

---

## 15. Pruebas

## 15.1 Unitarias

Probar como mínimo:

- cálculo de duración;
- buffers;
- validación de rango;
- cálculo de subtotal;
- descuentos;
- propinas;
- saldo;
- cierre de caja;
- comisiones porcentuales;
- comisiones fijas;
- reversión;
- límites de plan;
- permisos.

## 15.2 Integración

Probar contra PostgreSQL real mediante Prisma y la API:

- aislamiento multi-tenant del backend;
- creación de organización;
- invitación;
- creación de cita;
- conflicto de doble reserva;
- reprogramación concurrente;
- creación de venta;
- pagos parciales;
- cierre de caja;
- liquidación de comisión;
- descuento de inventario;
- reserva pública.

## 15.3 End-to-end

Flujos mínimos:

### Flujo A — Configuración

```text
registro
→ crear organización
→ crear sucursal
→ crear servicio
→ agregar barbero
→ configurar horario
```

### Flujo B — Reserva

```text
cliente abre link
→ selecciona servicio
→ selecciona horario
→ crea reserva
→ aparece en app móvil
```

### Flujo C — Atención y cobro

```text
confirmar cita
→ marcar llegada
→ iniciar servicio
→ completar
→ crear venta
→ cobrar en efectivo
→ generar comisión
```

### Flujo D — Caja

```text
abrir caja
→ registrar ventas
→ registrar gasto
→ cerrar caja
→ comprobar diferencia
```

### Flujo E — Seguridad

```text
barbero A no puede ver comisiones de barbero B
usuario de organización A no puede acceder a organización B
token público vencido no puede modificar cita
```

## 15.4 Datos de prueba

Crear seed reproducible:

```text
Organización: Barbería Demo
Sucursal: Centro
Propietario: owner@demo.local
Recepcionista: reception@demo.local
Barberos: Carlos, Mateo
Servicios:
- Corte clásico, 40 min, $12
- Barba, 25 min, $7
- Corte + barba, 60 min, $17
Productos:
- Pomada mate, $9
- Aceite para barba, $11
```

No usar credenciales reales.

---

## 16. Observabilidad

Implementar:

- logging estructurado;
- identificador de solicitud;
- captura de errores;
- métricas básicas;
- logs de funciones;
- trazabilidad de notificaciones;
- auditoría de operaciones críticas.

No registrar:

- contraseñas;
- tokens;
- claves;
- cuerpos completos con datos personales;
- números completos de teléfono si no es necesario.

Preparar integración futura con Sentry, pero no bloquear el MVP si todavía no existe cuenta.

---

## 17. Configuración y entornos

Entornos:

```text
local
preview
staging
production
```

Crear `.env.example` con nombres de variables, nunca valores reales.

Variables sugeridas:

```text
APP_ENV
DATABASE_URL
TEST_DATABASE_URL
API_HOST
API_PORT
EXPO_PUBLIC_API_URL
NEXT_PUBLIC_API_URL
SMTP_HOST
SMTP_PORT
SMTP_SECURE
SMTP_FROM
SMTP_USER
SMTP_PASSWORD
PUBLIC_WEB_URL
MOBILE_DEEP_LINK_SCHEME
NOTIFICATION_PROVIDER
```

`DATABASE_URL`, `TEST_DATABASE_URL` y las credenciales SMTP solo pueden existir en
servidor o en el entorno de CI correspondiente.

---

## 18. CI/CD

Configurar GitHub Actions:

### Pull request

- instalar dependencias;
- lint;
- typecheck;
- unit tests;
- build de paquetes;
- validar migraciones;
- comprobar formato.

### Rama principal

- ejecutar pruebas completas;
- construir aplicaciones;
- desplegar preview o staging cuando esté configurado;
- aplicar migraciones mediante proceso controlado.

No aplicar migraciones de producción automáticamente sin aprobación hasta que el proceso esté maduro.

---

# 19. Fases de construcción

Codex debe ejecutar estas fases en orden.

---

## Fase 0 — Inicialización del repositorio

### Objetivo

Crear una base limpia, ejecutable y documentada.

### Tareas

- crear monorepo con pnpm y Turborepo;
- crear `apps/mobile`;
- crear `apps/web`;
- crear `apps/admin`;
- crear paquetes compartidos;
- configurar TypeScript estricto;
- configurar ESLint y Prettier;
- configurar variables de entorno;
- configurar PostgreSQL y Mailpit locales;
- configurar Vitest;
- configurar Playwright para web;
- configurar pruebas de React Native;
- crear GitHub Actions;
- crear README;
- crear ADR inicial de arquitectura.

### Criterios de aceptación

- `pnpm install` funciona;
- `pnpm lint` funciona;
- `pnpm typecheck` funciona;
- `pnpm test` funciona;
- móvil abre una pantalla inicial;
- web abre una pantalla inicial;
- admin abre una pantalla inicial;
- PostgreSQL y Mailpit locales inician;
- no existen secretos en el repositorio.

---

## Fase 1 — Autenticación, organización y onboarding

### Objetivo

Permitir que un propietario cree su cuenta y barbería.

### Tareas

- autenticación por correo;
- perfiles;
- organizaciones;
- sucursales;
- memberships;
- roles;
- onboarding;
- creación de organización;
- creación de primera sucursal;
- zona horaria;
- moneda;
- autorización multi-tenant en backend;
- pruebas de aislamiento.

### Pantallas

```text
Bienvenida
Iniciar sesión
Registrarse
Recuperar acceso
Crear barbería
Configurar sucursal
Resumen del onboarding
```

### Criterios de aceptación

- propietario puede crear cuenta;
- propietario puede crear organización;
- se crea membresía owner;
- se crea primera sucursal;
- usuario no puede leer otra organización;
- app conserva sesión;
- cierre de sesión funciona.

---

## Fase 2 — Equipo, servicios y horarios

### Objetivo

Configurar la capacidad operativa.

### Tareas

- profesionales;
- invitaciones;
- roles;
- servicios;
- categorías;
- asignación de servicios;
- precio y duración personalizados;
- horarios;
- bloqueos;
- permisos.

### Criterios de aceptación

- owner agrega un barbero;
- owner crea un servicio;
- owner asigna servicio;
- owner configura horario;
- barbero solo ve sus datos;
- no se permiten duraciones inválidas;
- los cambios quedan auditados.

---

## Fase 3 — Motor de agenda

### Objetivo

Construir una agenda confiable antes de continuar con otras funciones.

### Tareas

- modelo de citas;
- appointment services;
- disponibilidad;
- servicio transaccional de creación en la API;
- servicio transaccional de reprogramación en la API;
- cancelación;
- estados;
- exclusión de doble reserva;
- agenda diaria móvil;
- sincronización incremental entre dispositivos;
- pruebas de concurrencia.

### Criterios de aceptación

- no existen dobles reservas;
- la duración se calcula correctamente;
- bloqueos impiden reservar;
- horario fuera de jornada es rechazado;
- reprogramación es transaccional;
- cancelación libera el horario;
- cita nueva aparece en otro dispositivo;
- los errores se muestran en español.

No avanzar si existen fallos intermitentes de agenda.

---

## Fase 4 — Reservas públicas

### Objetivo

Permitir reservas sin aplicación para el cliente.

### Tareas

- página pública;
- servicios públicos;
- profesionales;
- disponibilidad;
- formulario;
- política;
- creación pública;
- idempotencia;
- token de gestión;
- confirmación;
- cancelación pública;
- reprogramación pública;
- rate limiting.

### Criterios de aceptación

- cliente reserva sin iniciar sesión;
- cita aparece en móvil;
- doble envío no duplica reserva;
- enlace permite gestionar únicamente esa cita;
- token vencido es rechazado;
- datos internos no son públicos;
- flujo funciona en pantalla móvil.

---

## Fase 5 — Clientes e historial

### Objetivo

Centralizar la información del cliente.

### Tareas

- listado;
- búsqueda;
- ficha;
- historial;
- notas de corte;
- fotografías privadas;
- barbero preferido;
- métricas básicas;
- deduplicación asistida por teléfono.

### Criterios de aceptación

- cliente público se reutiliza por teléfono dentro de la organización;
- se puede añadir nota después del servicio;
- barbero solo ve clientes relacionados;
- owner ve historial completo;
- fotografías usan URL firmada;
- eliminación es lógica.

---

## Fase 6 — Caja y POS básico

### Objetivo

Registrar ventas y cerrar caja.

### Tareas

- apertura;
- venta desde cita;
- venta manual;
- productos y servicios;
- descuentos;
- propinas;
- pagos múltiples;
- saldo;
- gastos;
- retiros;
- cierre;
- auditoría.

### Criterios de aceptación

- solo existe una caja abierta por sucursal;
- una cita completada puede convertirse en venta;
- pago parcial actualiza saldo;
- efectivo afecta caja;
- transferencia no aumenta efectivo;
- cierre calcula esperado y diferencia;
- no se pueden editar cierres silenciosamente.

---

## Fase 7 — Comisiones

### Objetivo

Calcular cuánto corresponde a cada barbero.

### Tareas

- reglas;
- cálculo;
- snapshots;
- reportes;
- liquidaciones;
- reversión;
- vista del barbero;
- permisos.

### Criterios de aceptación

- comisión se calcula en backend;
- descuento reduce base;
- propina se separa;
- ventas anuladas revierten comisión;
- barbero solo ve lo propio;
- una entrada no se liquida dos veces;
- pruebas cubren porcentajes, montos fijos y reversión.

---

## Fase 8 — Inventario básico

### Objetivo

Controlar productos vendidos.

### Tareas

- productos;
- stock por sucursal;
- movimientos;
- venta;
- ajuste;
- stock mínimo;
- reporte.

### Criterios de aceptación

- venta descuenta stock;
- reversión repone stock cuando corresponde;
- cada cambio tiene movimiento;
- no se permite modificar stock sin auditoría;
- alertas muestran productos bajos.

---

## Fase 9 — Notificaciones

### Objetivo

Preparar recordatorios sin acoplarse a un proveedor.

### Tareas

- plantillas;
- cola;
- proveedor console;
- proveedor mock;
- logs;
- reintentos;
- recordatorio programado;
- eventos de cita.

### Criterios de aceptación

- crear cita encola confirmación;
- reprogramar encola actualización;
- cancelar encola cancelación;
- recordatorio se genera una sola vez;
- fallos quedan registrados;
- proveedor puede cambiarse por configuración.

No integrar WhatsApp real hasta que se solicite.

---

## Fase 10 — Reportes esenciales

### Objetivo

Entregar control diario al propietario.

### Reportes

- citas del día;
- citas atendidas;
- cancelaciones;
- no-show;
- ventas;
- cobros;
- gastos;
- ticket promedio;
- ventas por método;
- ventas por barbero;
- comisión por barbero;
- productos vendidos;
- cierre de caja.

### Criterios de aceptación

- filtros por fecha;
- filtros por sucursal;
- totales coinciden con ventas;
- reportes respetan zona horaria;
- barbero no puede ver reportes globales;
- exportación CSV básica.

---

## Fase 11 — Planes y límites

### Objetivo

Preparar monetización sin cobro real.

### Tareas

- planes;
- trial;
- suscripción;
- límites;
- feature flags;
- pantalla de plan;
- panel interno para cambiar plan.

### Criterios de aceptación

- una organización inicia trial;
- backend valida límites;
- cambiar UI no permite saltar límites;
- no se cobra dinero real;
- suspensión mantiene datos;
- reactivación restaura acceso.

---

## Fase 12 — Panel interno del SaaS

### Objetivo

Operar pilotos.

### Funciones

- listar organizaciones;
- filtrar por estado;
- ver plan;
- ver trial;
- suspender;
- reactivar;
- cambiar plan;
- consultar uso;
- consultar errores de notificación;
- consultar métricas de activación;
- acceder a soporte sin suplantación insegura.

### Criterios de aceptación

- solo platform admins acceden;
- acciones quedan auditadas;
- no se expone información innecesaria;
- no existe botón para ver contraseñas;
- no se usa `service_role` en navegador.

---

## Fase 13 — Estabilización del MVP

### Objetivo

Preparar pilotos reales.

### Tareas

- revisión de seguridad;
- revisión de autorización multi-tenant;
- pruebas E2E completas;
- rendimiento;
- accesibilidad;
- errores de red;
- recuperación ante fallos;
- exportación;
- backups;
- documentación;
- datos demo;
- checklist de producción.

### Criterios de aceptación

- todos los flujos críticos pasan;
- no hay dobles reservas;
- no hay filtraciones entre organizaciones;
- cierres de caja son reproducibles;
- comisiones son reproducibles;
- exportación de clientes funciona;
- aplicación funciona en Android y web móvil;
- errores críticos están observados.

---

# 20. Orden de prioridad del producto

Usar esta clasificación.

## P0 — Bloqueante

- seguridad multi-tenant;
- autenticación;
- organización;
- servicios;
- profesionales;
- disponibilidad;
- agenda;
- doble reserva;
- reserva pública;
- caja;
- ventas;
- pagos manuales;
- comisiones;
- auditoría.

## P1 — Necesario para piloto

- clientes;
- notas de corte;
- productos;
- inventario básico;
- reportes;
- notificaciones simuladas;
- planes;
- panel interno;
- exportación.

## P2 — Posterior al piloto

- WhatsApp real;
- pagos integrados;
- cola walk-in;
- waitlist;
- anticipos;
- membresías;
- campañas;
- reseñas;
- multi-sucursal avanzada.

## P3 — Visión futura

- IA;
- voz;
- marketplace;
- predicción;
- nómina;
- financiamiento;
- white-label.

---

# 21. Definition of Done

Una tarea se considera terminada únicamente cuando:

- la función está implementada;
- las entradas están validadas;
- los permisos están aplicados;
- el aislamiento multi-tenant está verificado;
- estados de error están cubiertos;
- pruebas relevantes pasan;
- documentación está actualizada;
- no existen secretos;
- no existen errores de TypeScript;
- no existen errores de lint;
- no se rompieron flujos anteriores;
- la UI funciona en móvil;
- se registró auditoría si corresponde;
- los comandos ejecutados se informan.

---

# 22. Plantilla para cada ejecución de Codex

Utilizar esta estructura al solicitar una fase:

```text
Lee primero INSTRUCCIONES_CODEX_BARBER_SAAS.md y revisa el repositorio completo.

Trabaja únicamente en la Fase [NOMBRE Y NÚMERO].

Antes de editar:
1. Resume el estado actual.
2. Indica qué requisitos de la fase ya existen.
3. Presenta un plan breve.
4. Enumera archivos y migraciones previstos.

Durante la implementación:
- Mantén TypeScript estricto.
- Respeta la arquitectura existente.
- No implementes funciones de fases posteriores.
- Aplica aislamiento multi-tenant y permisos en backend.
- Añade pruebas.
- No uses datos hardcodeados.
- No expongas secretos.
- Conserva compatibilidad con móvil y futura web de escritorio.

Al finalizar:
1. Ejecuta lint, typecheck y pruebas.
2. Resume cambios.
3. Enumera archivos modificados.
4. Enumera migraciones.
5. Indica comandos ejecutados y resultado.
6. Explica riesgos o decisiones.
7. Propón una sola siguiente tarea.
```

---

# 23. Primera instrucción recomendada para Codex

Copiar y ejecutar:

```text
Lee INSTRUCCIONES_CODEX_BARBER_SAAS.md completo.

Inicializa únicamente la Fase 0 del proyecto.

Crea el monorepositorio con pnpm y Turborepo, las aplicaciones mobile, web, admin y API, los paquetes compartidos, PostgreSQL y Mailpit locales, TypeScript estricto, lint, formato, pruebas básicas, variables de entorno de ejemplo, CI y documentación inicial.

No implementes todavía autenticación, base de datos de negocio, agenda, reservas, caja ni comisiones.

Antes de crear archivos, presenta el plan y la estructura propuesta. Al finalizar, ejecuta todos los comandos de verificación disponibles y documenta cómo levantar el proyecto localmente.
```

---

# 24. Segunda instrucción recomendada para Codex

Después de aprobar la Fase 0:

```text
Lee INSTRUCCIONES_CODEX_BARBER_SAAS.md y revisa lo implementado en la Fase 0.

Implementa únicamente la Fase 1: autenticación, perfiles, organizaciones, sucursales, memberships, roles, onboarding y autorización multi-tenant en backend.

Primero crea las migraciones y pruebas de aislamiento multi-tenant. Después implementa las pantallas móviles y el flujo de sesión.

No avances a profesionales, servicios ni agenda.

La tarea no estará completa hasta demostrar mediante pruebas que un usuario de una organización no puede consultar ni modificar datos de otra organización.
```

---

# 25. Documentos de referencia del producto

Mantener en `/docs/research` los documentos de investigación originales, si están disponibles:

```text
analisis_saas_barberias.md
estrategias_precios_barberias.md
panorama_competitivo_barberias.md
mercado_rentabilidad_barberias.md
```

Este documento transforma la investigación en instrucciones de construcción.

Cuando exista conflicto:

1. las reglas de seguridad de este documento tienen prioridad;
2. el alcance del MVP de este documento tiene prioridad;
3. una decisión implementada y documentada en ADR puede reemplazar una sugerencia técnica si existe justificación;
4. no ampliar alcance sin aprobación explícita.

---

# 26. Resultado esperado del MVP

Al terminar todas las fases del MVP, debe existir:

- aplicación móvil para operación interna;
- página pública de reservas;
- panel interno de administración;
- backend multi-tenant seguro;
- agenda confiable;
- caja diaria;
- comisiones;
- clientes;
- productos;
- reportes;
- sistema preparado para WhatsApp;
- sistema preparado para pagos;
- base técnica reutilizable para panel de escritorio.

El éxito técnico no se mide por la cantidad de módulos, sino por la confiabilidad de estas operaciones:

```text
reservar
reprogramar
cancelar
atender
cobrar
cerrar caja
calcular comisión
```

No sacrificar confiabilidad por velocidad ni por agregar funciones fuera del MVP.
