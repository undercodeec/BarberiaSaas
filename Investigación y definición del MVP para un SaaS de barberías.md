# Investigación y definición del MVP para un SaaS de barberías

## 1. Conclusión ejecutiva

El proyecto tiene una oportunidad comercial razonable, pero **no por ofrecer exactamente lo mismo que WeiBook a menor precio**. WeiBook ya es una plataforma madura que combina agenda, pagos, caja, inventario, comisiones, WhatsApp, inteligencia artificial, marketing, reseñas y múltiples sucursales. Intentar replicar toda esa plataforma desde el inicio produciría un desarrollo costoso, lento y difícil de mantener.

La oportunidad está en crear:

> **Un sistema operativo móvil para barberías hispanas de 1 a 5 sucursales, centrado en agenda, WhatsApp, caja, clientes y comisiones, sin cobros por cada barbero ni comisiones por reservas directas.**

Los documentos analizados estiman que Latinoamérica todavía representa una porción pequeña pero creciente del mercado de software para salones. También identifican baja digitalización, uso intensivo de WhatsApp, pagos mixtos y administración manual de comisiones como oportunidades específicas para Ecuador y otros países de la región.

La rentabilidad dependerá principalmente de cuatro factores:

1. Activar a la barbería durante la primera semana.
2. Conseguir que registre sus citas y caja diariamente.
3. Mantener un costo de soporte bajo.
4. Evolucionar desde planes de entrada de USD 9–19 hacia un ARPU de USD 25–80 mediante planes profesionales, mensajería, pagos y módulos adicionales.

---

# 2. ¿Qué es realmente WeiBook?

WeiBook no es únicamente una aplicación para reservar citas. Su propuesta actual es convertirse en el sistema central de operación de un negocio de belleza.

## Funcionalidades principales encontradas

### Agenda y reservas

WeiBook ofrece una agenda visual por profesional con:

* Calendario diario y semanal.
* Bloqueos de horarios.
* Citas recurrentes.
* Reprogramación.
* Lista de espera.
* Recordatorios automáticos.
* Acceso desde móvil, web, iOS, Android, iPad y POS.

Su agenda permite gestionar los horarios de varios profesionales y filtrar reservas por estado y colaborador.

### Reservas públicas

Cada negocio puede tener un minisito para que sus clientes consulten servicios, precios, profesionales y disponibilidad. Esto permite recibir reservas las 24 horas sin obligar al cliente a descargar una aplicación. WeiBook utiliza este minisito como parte de su estrategia de adquisición y digitalización.

### WhatsApp e inteligencia artificial

WeiBook integra WhatsApp con:

* Confirmaciones automáticas.
* Recordatorios.
* Respuestas a preguntas.
* Consulta de disponibilidad.
* Creación de citas.
* Campañas segmentadas.
* Comunicación utilizando el número del negocio.

Su asistente Wanda puede conversar con el cliente, sugerir horarios y registrar directamente la reserva. El módulo de WhatsApp y otros módulos Flex se comercializan como extensiones adicionales en algunos planes.

### Caja y punto de venta

WeiBook registra:

* Apertura y cierre de caja.
* Ventas de servicios.
* Ventas de productos.
* Efectivo.
* Tarjetas.
* Abonos.
* Deudas.
* Propinas.
* Gastos.
* Retiros.
* Pagos a colaboradores.
* Reportes por método de pago.

También permite convertir reservas terminadas en ventas y detectar servicios que todavía no han sido cobrados.

### Comisiones

Las comisiones pueden configurarse:

* Por porcentaje.
* Por monto fijo.
* Por servicio.
* Por producto.
* Por nivel de ventas.
* Por colaborador.

WeiBook también incluye préstamos, multas, deducciones, propinas y liquidaciones. Cada profesional puede consultar únicamente sus propios resultados según los permisos asignados.

### Inventario

La plataforma permite registrar productos e insumos, controlar movimientos y generar alertas cuando elementos como cuchillas, ceras, pomadas o toallas estén llegando a niveles bajos.

### Marketing y crecimiento

WeiBook agrega como módulos avanzados:

* Solicitud automática de reseñas de Google.
* Campañas por WhatsApp.
* Segmentación de clientes.
* Marketing generado con IA.
* Pixel de seguimiento.
* Fidelización.
* Cupones.
* Paquetes y membresías.
* Portafolio público de cada profesional.

Estas funciones son valiosas, pero no son necesarias para validar la primera versión del producto.

---

# 3. Análisis del modelo de precios de WeiBook

Los precios públicos de WeiBook varían según el país, moneda, promoción y forma de facturación. Las páginas oficiales revisadas muestran aproximadamente:

* Plan individual alrededor de USD 15 mensuales.
* Plan para negocios de hasta 10 colaboradores alrededor de USD 39 mensuales.
* Plan Unlimited alrededor de USD 99 mensuales.
* Módulos Flex individuales alrededor de USD 15 mensuales.
* Asistente Wanda como módulo separado en determinados mercados.

El plan intermedio incluye normalmente POS, caja y cálculo de comisiones. El plan superior agrega colaboradores ilimitados, WhatsApp, reseñas, campos personalizados, marketing y otras extensiones.

Esto significa que **competir solamente por ser más barato no es suficiente**. WeiBook ya posee un plan relativamente accesible. La diferenciación debe estar en:

* Especialización exclusiva para barberías.
* Interfaz más sencilla.
* Onboarding más rápido.
* Precio transparente.
* Soporte local.
* Operación centrada en WhatsApp.
* Caja adaptada a efectivo y transferencias.
* Sin cobro adicional por cada barbero.
* Sin marketplace que cobre por los clientes propios.

Los documentos de competencia respaldan este posicionamiento como una oportunidad frente a plataformas que cobran por miembro, calendario, mensajes, marketplace o funciones adicionales.

---

# 4. Alcance recomendado del MVP

## Principio del MVP

El MVP debe permitir que una barbería pueda completar este ciclo:

> Crear el negocio → configurar barberos y servicios → recibir una reserva → atender al cliente → cobrar → calcular la comisión → cerrar caja → consultar el resultado del día.

Todo lo que no sea necesario para completar o mejorar directamente ese ciclo debe posponerse.

---

## 4.1 Aplicación móvil para propietarios y barberos

La primera versión debe ser una sola aplicación con pantallas diferentes según el rol.

### Roles iniciales

#### Propietario o administrador

Puede:

* Configurar la barbería.
* Administrar profesionales.
* Crear servicios.
* Consultar todas las citas.
* Registrar ventas y gastos.
* Cerrar caja.
* Consultar comisiones.
* Consultar reportes.
* Administrar clientes.

#### Barbero

Puede:

* Consultar su agenda.
* Bloquear horarios autorizados.
* Consultar información del cliente.
* Registrar notas del corte.
* Cambiar el estado de una cita.
* Registrar el servicio como terminado.
* Consultar sus propias comisiones.

#### Recepcionista

Puede:

* Crear y reprogramar citas.
* Registrar clientes.
* Gestionar turnos sin reserva.
* Registrar cobros.
* Consultar la agenda completa.

Los permisos deben estar separados desde el modelo de datos, aunque inicialmente se utilicen pocos roles.

---

## 4.2 Registro y configuración de la barbería

El onboarding debe solicitar únicamente:

* Nombre del negocio.
* Logo o fotografía.
* Número de WhatsApp.
* Dirección.
* Zona horaria.
* Moneda.
* Horarios de atención.
* Profesionales.
* Servicios.
* Duración.
* Precio.
* Tiempo adicional entre citas.
* Métodos de pago aceptados.
* Reglas básicas de cancelación.

El objetivo debe ser que el propietario tenga su agenda disponible para recibir reservas en menos de 30 minutos.

La primera versión comercial puede limitarse a una sola sucursal, pero toda la base de datos debe incluir `organization_id` y `location_id` para habilitar múltiples sucursales posteriormente.

---

## 4.3 Agenda por barbero

Este es el módulo más importante del MVP.

Debe incluir:

* Vista del día.
* Vista de varios días o semana.
* Filtro por barbero.
* Citas por colores según estado.
* Creación manual de una cita.
* Reprogramación.
* Cancelación.
* Bloqueo de horarios.
* Prevención de reservas duplicadas.
* Duración configurable por servicio.
* Tiempo de preparación o limpieza.
* Selección de uno o varios servicios.
* Selección de barbero.
* Citas sin barbero asignado.
* Registro rápido de clientes sin cita.

### Estados de la cita

* Pendiente.
* Confirmada.
* Cliente presente.
* En atención.
* Finalizada.
* Cancelada.
* No asistió.

Los documentos competitivos advierten que los errores de agenda son un riesgo crítico: una reserva que no aparece, una doble reserva o una reprogramación incorrecta puede causar pérdida directa de ingresos y abandono del sistema.

---

## 4.4 Reservas públicas sin descargar una aplicación

Aunque la operación interna comience exclusivamente en móvil, los clientes no deberían tener que instalar una aplicación.

El MVP debe generar para cada barbería:

* Enlace público.
* Código QR.
* Página optimizada para móvil.
* Logo y datos del negocio.
* Lista de servicios.
* Profesionales disponibles.
* Horarios disponibles.
* Formulario de datos del cliente.
* Confirmación de reserva.
* Botón para agregar la cita al calendario.
* Botón de contacto por WhatsApp.

La página pública puede ser una aplicación web ligera desde el comienzo. Más adelante se convertirá en parte del sistema web completo.

Este modelo sigue el comportamiento que WeiBook utiliza con su minisito de reservas y evita introducir fricción mediante una aplicación obligatoria para el consumidor.

---

## 4.5 WhatsApp básico, sin inteligencia artificial

WhatsApp sí debe estar en el MVP, pero Wanda o un chatbot con IA no.

La primera versión debería ofrecer:

* Mensaje de confirmación.
* Recordatorio el día anterior.
* Recordatorio algunas horas antes.
* Mensaje de cancelación.
* Mensaje de reprogramación.
* Enlace para gestionar la cita.
* Botón para abrir una conversación manual.
* Registro del estado de envío.

Puede comenzar con plantillas automáticas de WhatsApp y acciones manuales asistidas.

La IA conversacional debe agregarse solamente cuando la agenda y las reglas de disponibilidad sean suficientemente estables. Automatizar sobre una agenda que todavía presenta errores puede multiplicar los problemas en lugar de resolverlos.

WhatsApp debe considerarse parte central del producto para Ecuador y Latinoamérica, según los documentos analizados y la estrategia visible de WeiBook.

---

## 4.6 Clientes e historial de cortes

Cada cliente debe tener una ficha con:

* Nombre.
* Teléfono.
* Correo opcional.
* Fecha de nacimiento opcional.
* Barbero preferido.
* Historial de citas.
* Servicios recibidos.
* Total gastado.
* Cancelaciones.
* Inasistencias.
* Notas generales.
* Notas de corte.
* Número o guarda utilizada.
* Productos preferidos.
* Fotografía de referencia opcional.
* Fecha sugerida para próxima visita.

Las notas de corte son una oportunidad de diferenciación específica para barberías. Resultan más útiles para este nicho que los campos clínicos generales de una plataforma de belleza.

---

## 4.7 Caja y POS básico

La caja del MVP debe funcionar incluso cuando el pago se realiza fuera de la aplicación.

### Operaciones necesarias

* Abrir caja.
* Ingresar fondo inicial.
* Cobrar desde una cita.
* Registrar una venta sin cita.
* Vender servicios.
* Vender productos.
* Aplicar descuento.
* Registrar propina.
* Registrar gasto.
* Registrar retiro.
* Registrar pago parcial.
* Registrar saldo pendiente.
* Cerrar caja.
* Comparar monto esperado y monto contado.

### Métodos de pago iniciales

* Efectivo.
* Transferencia.
* Tarjeta externa.
* Enlace de pago externo.
* Otro.

No es necesario integrar una pasarela de pagos durante la primera versión. Lo importante es que el negocio pueda registrar y conciliar correctamente el dinero independientemente de cómo lo recibió.

Los documentos de competencia identifican esta flexibilidad como una ventaja importante para Latinoamérica frente a productos demasiado dependientes de sus propios procesadores de pago.

---

## 4.8 Comisiones básicas

El MVP debe calcular:

* Porcentaje por servicio.
* Monto fijo por servicio.
* Porcentaje por venta de productos.
* Propinas asignadas al barbero.
* Total generado.
* Total pagado.
* Total pendiente.

Debe existir un período de liquidación:

* Diario.
* Semanal.
* Quincenal.
* Mensual.

### No incluir inicialmente

* Préstamos.
* Multas.
* Adelantos.
* Escalas de comisión.
* Renta automática de silla.
* Nómina.
* Pagos automáticos al barbero.

Estas funciones son útiles, pero pueden desarrollarse después de validar que las barberías utilizan de manera consistente el cálculo básico.

---

## 4.9 Inventario básico

El alcance inicial debe limitarse a:

* Productos.
* Categorías.
* Stock actual.
* Costo.
* Precio de venta.
* Entrada manual.
* Salida manual.
* Descuento automático al vender.
* Alerta de stock mínimo.
* Historial de movimientos.

No deberían incluirse todavía:

* Proveedores.
* Órdenes de compra.
* Transferencias entre sucursales.
* Lotes.
* Vencimientos.
* Costeo avanzado.
* Predicción de consumo.

---

## 4.10 Reportes esenciales

El propietario debe poder consultar:

### Resumen diario

* Citas programadas.
* Citas atendidas.
* Cancelaciones.
* Inasistencias.
* Ventas estimadas.
* Ventas cobradas.
* Gastos.
* Resultado de caja.

### Reporte por barbero

* Servicios realizados.
* Ventas generadas.
* Clientes atendidos.
* Ocupación.
* Comisión.
* Propinas.

### Reporte del negocio

* Ventas por día.
* Ventas por servicio.
* Ventas por método de pago.
* Clientes nuevos.
* Clientes recurrentes.
* Ticket promedio.
* Servicios más vendidos.

No es necesario construir un dashboard de inteligencia empresarial avanzado. Una lista de indicadores diarios claros será más útil durante la validación.

---

## 4.11 Administración del SaaS

Además de la aplicación de barbería, el producto necesita un panel interno mínimo para el proveedor del SaaS.

Debe permitir:

* Consultar negocios registrados.
* Activar o suspender cuentas.
* Consultar plan contratado.
* Administrar período de prueba.
* Consultar uso.
* Revisar errores.
* Acceder a registros de notificaciones.
* Administrar límites.
* Aplicar descuentos.
* Atender solicitudes de soporte.

Este panel puede comenzar como una interfaz web privada y sencilla. No necesita el mismo nivel visual que el producto comercial.

---

# 5. Funciones que no deben incluirse en el MVP

Las siguientes funciones deberían reservarse para etapas posteriores:

* Asistente de inteligencia artificial tipo Wanda.
* Marketplace de barberías.
* Aplicación para consumidores.
* Procesamiento integrado de pagos.
* Wallet.
* Facturación electrónica con SRI.
* Múltiples sucursales completas.
* Membresías.
* Gift cards.
* Paquetes de servicios.
* Programa de puntos.
* Campañas masivas.
* Automatización de reseñas de Google.
* Control de asistencia.
* Nómina.
* Préstamos y multas a colaboradores.
* Renta automática de silla.
* Inventario avanzado.
* Proveedores.
* Predicción de demanda.
* Precios dinámicos.
* Reportes predictivos.
* Personalización completa del minisito.
* Aplicación con marca propia para cada barbería.

WeiBook presenta muchas de estas funciones como módulos premium o como parte de su versión más avanzada, lo cual confirma que no son necesarias para entregar el valor operativo inicial.

---

# 6. Estructura de pantallas del MVP

## Aplicación del propietario

1. Inicio.
2. Agenda.
3. Turnos sin cita.
4. Nueva cita.
5. Clientes.
6. Caja.
7. Nueva venta.
8. Productos.
9. Equipo.
10. Comisiones.
11. Reportes.
12. Configuración.
13. Suscripción.
14. Ayuda.

## Aplicación del barbero

1. Mi día.
2. Mi agenda.
3. Detalle de cita.
4. Ficha del cliente.
5. Notas del corte.
6. Finalizar servicio.
7. Mis comisiones.
8. Mi horario.
9. Mi perfil.

## Página pública del cliente

1. Información de la barbería.
2. Selección de servicio.
3. Selección de barbero.
4. Selección de horario.
5. Datos del cliente.
6. Confirmación.
7. Gestionar reserva.

---

# 7. Arquitectura técnica recomendada

## Recomendación principal: ecosistema TypeScript y React

Para cumplir el objetivo de comenzar en móvil y posteriormente crecer a escritorio utilizando tecnologías compatibles, recomiendo un monorepositorio con:

### Aplicación móvil

* React Native.
* Expo.
* Expo Router.
* TypeScript.

Expo Router permite crear rutas para Android, iOS y web, además de compartir componentes y lógica entre plataformas. Su documentación oficial contempla navegación universal, rutas tipadas, enlaces profundos y renderizado web.

### Aplicación web futura

* Next.js.
* React.
* TypeScript.

Next.js debería utilizarse para:

* Página pública de reservas.
* Panel administrativo de escritorio.
* Superadministración del SaaS.
* Páginas comerciales.
* SEO.
* Sitios públicos por barbería.

Next.js ofrece App Router, componentes de servidor y una estructura adecuada para aplicaciones web completas.

### Código compartido

El monorepositorio debería contener:

```text
apps/
  mobile/
  web/
  admin/

packages/
  domain/
  api-client/
  database-types/
  validation/
  permissions/
  design-tokens/
  utilities/
```

Se pueden compartir entre móvil y escritorio:

* TypeScript.
* Tipos de datos.
* Validaciones.
* Reglas de agenda.
* Cálculo de precios.
* Cálculo de comisiones.
* Permisos.
* Cliente de API.
* Estados.
* Utilidades de fecha.
* Tokens visuales.
* Algunos componentes.

No recomiendo perseguir una reutilización del 100% de la interfaz. Una agenda diseñada para una pantalla táctil necesita comportamientos diferentes a una agenda de escritorio. React Native permite mantener código común y crear implementaciones específicas cuando una plataforma lo requiere.

---

## Backend recomendado para el MVP

### Supabase

* PostgreSQL.
* Autenticación.
* Almacenamiento de imágenes.
* Realtime.
* Funciones de servidor.
* Row Level Security.

Supabase permite escuchar cambios de PostgreSQL en tiempo real y utilizar reglas de seguridad a nivel de fila. Esto es útil para que una cita creada desde el minisito aparezca inmediatamente en la aplicación de la barbería y para impedir que una barbería acceda a los datos de otra.

### Recomendación de arquitectura

Aunque se utilice Supabase, la lógica crítica no debería quedar dispersa directamente en las pantallas.

La aplicación debe incluir una capa de dominio para:

* Validar disponibilidad.
* Prevenir citas duplicadas.
* Calcular totales.
* Procesar cierres de caja.
* Calcular comisiones.
* Aplicar permisos.
* Registrar movimientos de inventario.
* Generar auditoría.

Esto facilitará cambiar o ampliar el backend en el futuro.

---

# 8. Modelo de datos mínimo

Las principales entidades deberían ser:

* `organizations`
* `locations`
* `users`
* `memberships`
* `roles`
* `professionals`
* `services`
* `professional_services`
* `working_hours`
* `schedule_blocks`
* `clients`
* `appointments`
* `appointment_services`
* `client_notes`
* `sales`
* `sale_items`
* `payments`
* `cash_sessions`
* `cash_movements`
* `commission_rules`
* `commission_entries`
* `commission_settlements`
* `products`
* `stock_movements`
* `notification_templates`
* `notification_logs`
* `subscriptions`
* `audit_logs`

Todas las tablas operativas deben identificar la organización y, cuando corresponda, la sucursal.

---

# 9. Roadmap recomendado

## Fase 1 — MVP operativo móvil

Objetivo: reemplazar agenda, libreta de clientes, caja manual y cálculo básico de comisiones.

Incluye:

* Registro de barbería.
* Profesionales.
* Servicios.
* Agenda.
* Reservas públicas.
* Turnos sin cita.
* Clientes.
* Notas de corte.
* Confirmaciones y recordatorios.
* Caja.
* POS básico.
* Comisiones.
* Inventario básico.
* Reportes diarios.
* Panel interno del SaaS.

## Fase 2 — Control y crecimiento

Incluye:

* Lista de espera automatizada.
* Cola virtual.
* Check-in mediante QR.
* Anticipos.
* Políticas de no-show.
* Membresías.
* Paquetes.
* Renta de silla.
* Préstamos y adelantos.
* Campañas de recuperación.
* Reseñas de Google.
* Segunda sucursal.
* Panel web para propietarios.

## Fase 3 — Automatización y expansión

Incluye:

* Asistente de WhatsApp con IA.
* Pagos integrados.
* Facturación electrónica por país.
* Marketing automatizado.
* Predicción de demanda.
* Recomendaciones de horarios.
* Multiempresa.
* Franquicias.
* API pública.
* Integraciones contables.
* Aplicación de escritorio avanzada.

---

# 10. Estrategia de precios inicial

Los documentos de investigación recomiendan evitar cobrar por cada barbero y utilizar una tarifa transparente por local.

## Plan Solo — USD 9 mensuales

* Un profesional.
* Agenda.
* Enlace de reservas.
* Clientes.
* Caja sencilla.
* Recordatorios limitados.

## Plan Local — USD 19 mensuales

* Una barbería.
* Barberos ilimitados o un límite amplio.
* Agenda por barbero.
* Reservas públicas.
* Clientes.
* Caja diaria.
* Comisiones básicas.
* Reportes.
* Cupo de mensajes.

## Plan Pro — USD 39 mensuales

Se habilitaría en la Fase 2:

* Lista de espera.
* Cola virtual.
* Inventario.
* Comisiones avanzadas.
* Renta de silla.
* Anticipos.
* Campañas.
* Reseñas.
* Membresías.

## Plan Multi — desde USD 59 por local

Se habilitaría cuando exista un módulo multi-sucursal estable.

La recomendación es comunicar:

> **Un precio por barbería, no por cada barbero. Sin comisión por tus reservas. WhatsApp y pagos con tarifas transparentes.**

El plan de USD 9 puede servir como puerta de entrada, pero no debería convertirse en el plan dominante porque difícilmente financiará soporte, onboarding y mensajería. El objetivo comercial debería ser mover a los negocios con equipo hacia los planes de USD 19 y USD 39.

---

# 11. Validación antes del desarrollo completo

Antes de construir todas las funciones, se recomienda trabajar con entre 8 y 15 barberías piloto.

## Hipótesis a validar

* ¿Administran las citas principalmente por WhatsApp?
* ¿Cierran caja diariamente?
* ¿Los barberos trabajan con comisión, silla rentada o ambos?
* ¿Cuántas inasistencias tienen por semana?
* ¿Cuánto tiempo emplean calculando comisiones?
* ¿Aceptarían pagar USD 19 mensuales?
* ¿Qué información desean guardar de cada corte?
* ¿Necesitan cola de clientes sin cita?
* ¿Quién administra realmente la aplicación?
* ¿Cuántos barberos tienen acceso al mismo teléfono?

## Indicadores de éxito recomendados

* Al menos 70% de los pilotos completan la configuración.
* Al menos 60% crean una cita durante el primer día.
* Al menos 50% utilizan la aplicación semanalmente después del primer mes.
* Al menos cinco negocios aceptan pagar al terminar el piloto.
* Más de 70% de las citas del negocio se registran en el sistema.
* Los negocios que usan caja realizan cierre al menos cuatro días por semana.
* El propietario puede obtener las comisiones sin utilizar Excel.

---

# 12. Recomendación final

El MVP no debe presentarse como:

> “Un WeiBook más barato”.

Debe presentarse como:

> **La aplicación móvil para controlar una barbería desde WhatsApp: agenda, clientes, caja y comisiones en un solo lugar, sin pagar por cada barbero.**

La primera versión debería concentrar aproximadamente el 80% del esfuerzo en:

1. Agenda confiable.
2. Reservas públicas.
3. WhatsApp.
4. Caja.
5. Clientes.
6. Comisiones.

Inventario y reportes deben mantenerse simples. Inteligencia artificial, pagos, marketplace, facturación electrónica y automatizaciones avanzadas deben desarrollarse únicamente después de comprobar que las barberías utilizan la aplicación todos los días.

La arquitectura recomendada —React Native con Expo para móvil, Next.js para web y PostgreSQL/Supabase como backend— permite conservar TypeScript, React, reglas de negocio y modelos de datos cuando se construya posteriormente el panel de escritorio. Esto ofrece más flexibilidad que intentar forzar exactamente la misma interfaz en móvil y computadora.
