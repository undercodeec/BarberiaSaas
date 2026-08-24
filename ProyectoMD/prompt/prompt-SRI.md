# Implementación de facturación electrónica SRI propia para Nava

Lee primero y toma como contexto obligatorio:

1. `ESTADO_PROYECTO.md`
2. `Politicas_y_terminos_Nava.md`
3. `DEFINICIONES_LEGALES_COMERCIALES_NAVA.md`, si existe en el repositorio.
4. `README.md`
5. esquema Prisma actual;
6. migraciones existentes;
7. implementación actual de suscripciones;
8. integración actual de PayPhone;
9. sistema actual de correo SMTP;
10. cualquier modelo, tabla o servicio existente relacionado con `invoice`, `billing`, `subscription`, `payment` o `PayPhone`.

No empieces creando tablas o módulos nuevos hasta comprobar qué existe.

## Objetivo

Implementar el módulo mínimo de **facturación electrónica propia de Nava contra el SRI de Ecuador**, sin contratar ni integrar un proveedor externo de facturación.

Esta facturación corresponde exclusivamente a:

> Nava → negocio/barbería que paga una suscripción Nava.

NO corresponde a:

> barbería → cliente final de la barbería.

No implementar facturación electrónica para las ventas, servicios, productos o caja de las barberías.

La finalidad de esta fase es cerrar el requisito actualmente pendiente indicado en `ESTADO_PROYECTO.md`:

* una suscripción Nava pagada y verificada;
* genera una factura electrónica;
* Nava genera el XML;
* Nava firma el XML;
* Nava lo transmite directamente al SRI;
* Nava consulta su autorización;
* una vez autorizado genera el RIDE;
* Nava envía XML + RIDE al correo de facturación del cliente;
* Nava conserva trazabilidad del comprobante.

No utilizar APIs de terceros como Datil, Contífico, Facturero Móvil, Perseo, Siigo, etc.

La integración debe ser directamente:

```text
Nava Backend
      ↓
Generador XML
      ↓
Firma electrónica Nava
      ↓
Web Services SRI
      ↓
Autorización
      ↓
XML autorizado
      ↓
RIDE PDF
      ↓
SMTP Hostinger
      ↓
Cliente Nava
```

---

# 1. Norma técnica a seguir

Utilizar como referencia la documentación oficial vigente del SRI:

**Ficha Técnica de Comprobantes Electrónicos Esquema Offline — versión 2.34 — actualizada julio de 2026.**

No utilizar implementaciones antiguas del esquema online.

No inventar estructuras XML.

No copiar ejemplos antiguos encontrados en blogs.

Utilizar los esquemas XSD oficiales de factura publicados actualmente por el SRI.

Antes de implementar elegir y documentar la versión oficial de XML de factura que resulte suficiente para una factura normal de prestación del servicio SaaS Nava.

No cambiar arbitrariamente algoritmos, nodos o formatos definidos por el SRI aunque técnicamente existan alternativas modernas.

---

# 2. Arquitectura

Mantener la arquitectura actual:

```text
Web / Admin
      ↓
Fastify API
      ↓
PostgreSQL / Prisma
      ↓
Módulo SRI
```

Toda interacción con firma electrónica y SRI debe ocurrir exclusivamente en backend.

Crear una separación clara, por ejemplo:

```text
packages/
  sri/
    access-key.ts
    invoice-xml.ts
    xsd-validator.ts
    signer.ts
    sri-client.ts
    ride.ts
    types.ts

apps/api/
  services/
    electronic-invoicing/
```

Adaptar los nombres a la estructura real existente.

No mover arquitectura existente innecesariamente.

---

# 3. Emisor

Existe un único emisor fiscal:

**Nava.**

Los datos fiscales del emisor son configuración de plataforma y NO configuración de cada organización/barbería.

No crear certificados SRI independientes por organización.

No pedir a las barberías firma electrónica ni contraseña SRI.

Configurar mediante variables/secretos del servidor los datos necesarios del emisor:

```text
SRI_ENV
SRI_ISSUER_RUC
SRI_ISSUER_LEGAL_NAME
SRI_ISSUER_TRADE_NAME
SRI_MAIN_ADDRESS
SRI_ESTABLISHMENT_CODE
SRI_EMISSION_POINT_CODE
SRI_ACCOUNTING_REQUIRED
SRI_TAX_REGIME
SRI_CERTIFICATE_PATH
SRI_CERTIFICATE_PASSWORD
```

Agregar únicamente variables adicionales realmente necesarias.

Crear dos ambientes:

```text
test
production
```

Por defecto debe utilizarse `test`.

Producción debe necesitar activación explícita.

---

# 4. Firma electrónica

El comprobante XML debe firmarse conforme a la especificación oficial SRI:

```text
XAdES_BES
XML UTF-8
firma enveloped
certificado PKCS#12 (.p12)
```

El certificado debe cargarse únicamente en backend.

Nunca:

* guardar la firma electrónica dentro del repositorio;
* subirla a Git;
* exponerla a Web o Mobile;
* mostrar la contraseña en el panel;
* registrar la contraseña en logs;
* guardar la contraseña en texto dentro de PostgreSQL;
* devolver el certificado mediante una API.

La contraseña debe obtenerse desde un secreto seguro del servidor.

Si se almacena el archivo `.p12` en disco, debe quedar fuera del directorio público de las aplicaciones y con permisos mínimos.

Crear validación de:

* archivo existente;
* contraseña válida;
* certificado vigente;
* error comprensible si expiró;
* imposibilidad de iniciar facturación productiva sin certificado válido.

No almacenar la clave o contenido privado del certificado en logs.

---

# 5. Clave de acceso SRI

Implementar el generador de clave de acceso conforme a la ficha técnica actual.

La clave tiene 49 dígitos e incluye los campos exigidos por SRI, incluyendo:

* fecha de emisión;
* tipo de comprobante;
* RUC;
* ambiente;
* serie;
* secuencial;
* código numérico;
* tipo de emisión;
* dígito verificador módulo 11.

Crear una función pura, testeable y determinista para calcular el dígito verificador.

Agregar pruebas unitarias utilizando casos conocidos.

La clave de acceso debe ser única.

Nunca generar dos facturas con la misma clave.

---

# 6. Secuencial de factura

Implementar un control transaccional de secuenciales.

Cada factura debe obtener un secuencial único según:

```text
tipo de documento
establecimiento
punto de emisión
```

Crear o reutilizar una entidad semejante a:

```text
SriDocumentSequence
```

Debe soportar concurrencia.

Dos pagos procesados simultáneamente nunca deben recibir el mismo secuencial.

Usar transacción PostgreSQL / bloqueo apropiado.

No calcular el siguiente secuencial con:

```text
MAX(sequential) + 1
```

sin protección transaccional.

---

# 7. Datos del comprador

Antes de iniciar el pago de una suscripción pagada, el usuario debe disponer de datos de facturación.

Reutiliza los datos existentes cuando sea posible.

El perfil de facturación debe contemplar como mínimo:

```text
tipo de identificación
identificación
nombre / razón social
correo electrónico
dirección cuando sea exigida por SRI
teléfono opcional
```

La validación exacta de identificación y campos obligatorios debe seguir las reglas SRI/XSD vigentes.

No inventar algoritmos de validación de RUC para bloquear identificaciones que el propio SRI pueda considerar válidas.

Permitir al usuario editar sus datos de facturación antes del pago.

Cuando se genera una factura, crear un **snapshot** de los datos.

Ejemplo:

```text
usuario cambia razón social mañana
↓
factura emitida ayer NO cambia
```

---

# 8. Integración con la suscripción Nava

La factura se genera únicamente después de comprobar que el pago PayPhone fue exitoso y verificable.

NO generar factura cuando:

* se abre el checkout;
* se genera el enlace PayPhone;
* el pago está pendiente;
* el pago fue rechazado;
* el usuario cancela el checkout.

Flujo:

```text
PayPhone confirmado
      ↓
registrar pago de suscripción
      ↓
activar/renovar plan
      ↓
crear factura interna de forma idempotente
      ↓
encolar emisión SRI
```

La activación de la suscripción y la emisión fiscal deben quedar desacopladas.

Si PayPhone confirma correctamente el pago pero el SRI está temporalmente caído:

**NO quitar el plan al usuario.**

La suscripción queda activa y la factura queda pendiente de emisión/autorización.

---

# 9. Idempotencia

Debe existir exactamente:

```text
1 pago de suscripción
=
1 factura
```

Agregar restricción única apropiada entre factura y pago.

Si PayPhone, el backend o un job ejecutan el flujo varias veces:

* no crear facturas duplicadas;
* no consumir nuevos secuenciales;
* no generar nuevas claves de acceso;
* no enviar correos duplicados innecesariamente.

---

# 10. XML de factura

Generar el XML exclusivamente desde backend.

No construirlo mediante concatenación insegura de strings.

Crear tipos y estructuras explícitas.

Los valores monetarios deben provenir de los importes ya calculados por el backend.

Nava ya maneja dinero utilizando unidades mínimas; conservar ese principio.

Nunca utilizar `float` como fuente de verdad financiera.

La factura debe tomar un snapshot de:

```text
plan
descripción
precio
descuento aplicable
precio fundador si corresponde
subtotal
impuestos
total
fecha
método de pago
referencia PayPhone
datos del comprador
```

El precio de un plan NO debe hardcodearse dentro del módulo SRI.

Debe provenir de la misma fuente de verdad utilizada actualmente por Suscripciones.

---

# 11. Impuestos

NO asumir automáticamente:

```text
IVA 0%
IVA 15%
IVA incluido
IVA no incluido
```

Crear una configuración fiscal de Nava.

La tasa, código SRI y régimen utilizados deben estar centralizados.

No duplicar reglas tributarias dentro del frontend.

El XML debe calcular subtotal, impuestos y total conforme a la configuración fiscal vigente.

El precio mostrado al usuario continúa siendo el valor comercial definido por Nava.

Si existe duda entre el régimen tributario actual y los códigos SRI correspondientes, NO inventar la respuesta.

Dejar la configuración requerida documentada para que pueda ser validada con SRI/contador antes de producción.

---

# 12. RIMPE

El módulo debe soportar la configuración fiscal del emisor.

Contemplar:

```text
GENERAL
RIMPE
RIMPE_NEGOCIO_POPULAR
```

Si el emisor está bajo un régimen RIMPE, incluir en XML y RIDE la leyenda exacta exigida por la ficha técnica vigente.

No mostrar la leyenda si la configuración fiscal no corresponde.

No hardcodear el régimen dentro del generador XML.

---

# 13. RUC de proveedor de software

La Ficha Técnica SRI vigente incluye un requisito de `RUC Proveedor` para contribuyentes que utilicen un **sistema de facturación electrónica de terceros**.

Nava utilizará un sistema propio.

Por tanto:

* no integrar un proveedor de facturación;
* no llenar automáticamente `RUC Proveedor` como si existiera un tercero;
* mantener el campo opcional/configurable para futura compatibilidad;
* activarlo únicamente si posteriormente Nava utiliza un sistema externo y la normativa obliga a informarlo.

---

# 14. Validación XSD

Antes de firmar y enviar un comprobante:

```text
generar XML
↓
validar contra XSD oficial
↓
firmar
↓
enviar al SRI
```

Si el XML no valida:

* no enviarlo;
* registrar el error técnico;
* mostrarlo en administración;
* preservar la factura;
* permitir corregir la causa.

Agregar pruebas automáticas utilizando el XSD oficial.

---

# 15. Comunicación directa con SRI

Implementar dos servicios separados:

```text
Recepción de comprobante
Autorización de comprobante
```

Los endpoints deben ser configurables por ambiente.

No hardcodear certificados SSL del SRI.

No almacenar usuario ni contraseña de SRI en Línea para consumir los Web Services.

El acceso al portal SRI y cualquier habilitación administrativa se realiza fuera del sistema.

---

# 16. Flujo SRI

Implementar:

```text
XML generado
      ↓
XML validado
      ↓
XML firmado
      ↓
WS Recepción
      ↓
RECIBIDA
      ↓
espera configurable
      ↓
WS Autorización
      ↓
PPR / AUT / NAT
```

La consulta de autorización debe ser asíncrona.

No asumir que la autorización será instantánea.

El tiempo entre recepción y consulta debe ser configurable.

---

# 17. Estados

No mezclar estado SRI con estado de correo.

Crear estados semejantes a:

```text
SRI:
PENDING
GENERATED
SIGNED
RECEIVED
PROCESSING
AUTHORIZED
NOT_AUTHORIZED
ERROR
```

Y:

```text
EMAIL:
PENDING
SENT
FAILED
```

Adaptarlos al dominio existente.

Una factura `AUTHORIZED` no debe volver a emitirse.

---

# 18. Reintentos

Para errores de red o timeout:

* reintentar la misma operación;
* reutilizar clave de acceso;
* reutilizar secuencial;
* no crear una factura nueva.

Después de obtener `RECIBIDA`, consultar autorización usando la misma clave.

Si sigue `PPR`, programar nueva consulta.

Usar backoff con límite.

No crear un bucle infinito.

---

# 19. DEVUELTA / NO AUTORIZADA

Persistir todos los códigos y mensajes devueltos por el SRI.

Mostrar:

```text
código
mensaje
información adicional
fecha
intento
```

Si el SRI rechaza un comprobante por inconsistencia corregible, la ficha técnica indica que debe corregirse y reenviarse utilizando la misma clave de acceso y secuencial cuando corresponda.

No generar automáticamente otra factura solo porque fue rechazada.

---

# 20. Persistencia

Primero revisa los modelos actuales de factura.

Si ya existe una factura interna de suscripción, extenderla.

NO crear una segunda entidad que represente exactamente lo mismo.

La factura electrónica necesita conservar como mínimo:

```text
subscriptionPaymentId
environment
documentType
establishment
emissionPoint
sequential
accessKey
authorizationNumber
authorizationDate
sriStatus
deliveryStatus

buyerIdentificationType
buyerIdentification
buyerName
buyerEmail
buyerAddress

planCode
description

subtotalAmount
discountAmount
taxAmount
totalAmount

signedXml
authorizedXml

sriErrorCode
sriErrorMessage

issuedAt
authorizedAt
emailedAt
createdAt
updatedAt
```

Ajustar campos según el esquema real.

No almacenar información redundante innecesariamente.

---

# 21. RIDE

Después de obtener `AUTHORIZED`:

Generar una representación PDF RIDE basada en el XML autorizado.

El RIDE debe incluir la información requerida por el SRI.

Debe incluir como mínimo cuando corresponda:

* datos del emisor;
* datos del comprador;
* número de factura;
* clave de acceso;
* fecha;
* descripción;
* subtotal;
* impuestos;
* total;
* forma de pago;
* información tributaria obligatoria;
* leyenda RIMPE si corresponde.

No inventar campos obligatorios.

Seguir el formato mínimo definido en la ficha técnica.

No es necesario crear un editor visual de facturas.

Diseño simple, limpio y profesional con marca Nava.

---

# 22. Correo electrónico

Cuando la factura llegue al estado:

```text
AUTHORIZED
```

enviar por SMTP Hostinger:

```text
XML autorizado
+
RIDE PDF
```

al email de facturación guardado en la factura.

El correo es una comunicación operacional y no depende del consentimiento de marketing.

Ejemplo de asunto:

```text
Factura electrónica Nava - [número de factura]
```

Si falla el correo:

* NO emitir otra factura;
* mantener factura autorizada;
* marcar entrega fallida;
* permitir reintento;
* reenviar exactamente el mismo comprobante.

---

# 23. Historial para usuario

En la sección existente de Suscripción agregar una subsección sencilla:

```text
Mis facturas
```

Mostrar únicamente las facturas pertenecientes a esa organización.

Campos:

```text
Fecha
Plan
Total
Número
Estado
```

Acciones:

```text
Descargar RIDE
Descargar XML
Reenviar al correo
```

El usuario no puede modificar una factura autorizada.

---

# 24. Control administrativo

Agregar al panel Nava Control Center una vista mínima:

```text
Facturación SRI
```

Solo para `platform_admin`.

Permitir:

* buscar factura;
* filtrar por estado;
* ver organización;
* ver pago asociado;
* ver clave de acceso;
* ver autorización;
* ver errores SRI;
* descargar XML autorizado;
* descargar RIDE;
* reintentar un error técnico;
* volver a consultar autorización;
* reenviar correo.

Todas las acciones manuales deben quedar auditadas.

No permitir editar silenciosamente una factura ya autorizada.

---

# 25. Seguridad

Nunca registrar en logs:

```text
contraseña de certificado
contenido privado del certificado
credenciales PayPhone
CVV
número completo de tarjeta
contraseña SRI
```

Sanitizar respuestas antes de logs cuando corresponda.

Solo backend y procesos autorizados pueden utilizar la firma electrónica.

Ningún endpoint público puede descargar el certificado.

---

# 26. Conservación

Los comprobantes tributarios no deben desaparecer automáticamente al eliminar una cuenta si existe obligación legal de conservación.

Separar:

```text
eliminación de cuenta SaaS
```

de:

```text
conservación tributaria de facturas emitidas
```

Mantener únicamente los datos necesarios para dicha obligación.

Documentar esta decisión.

---

# 27. Reembolsos y correcciones

La política de Nava contempla excepcionalmente devoluciones por errores atribuibles a Nava.

No implementar en esta fase un sistema contable completo.

Sin embargo:

* dejar preparada la arquitectura para notas de crédito;
* no eliminar ni alterar una factura autorizada;
* no implementar una devolución que haga desaparecer el comprobante original;
* documentar que una devolución posterior a una factura autorizada requerirá el mecanismo tributario correspondiente.

Si actualmente existe un flujo automático de reembolso real que pueda afectar facturas autorizadas, detenerte y reportarlo antes de finalizar esta fase para determinar si debe implementarse también nota de crédito.

---

# 28. Jobs

No agregar Redis, RabbitMQ, Kafka u otro proveedor únicamente para esta función.

Reutilizar el sistema existente de tareas periódicas/jobs.

Si no existe uno apropiado, implementar un worker sencillo respaldado por PostgreSQL.

Debe sobrevivir reinicios.

Los estados pendientes deben poder retomarse después de una caída del servidor.

---

# 29. Pruebas

Agregar como mínimo:

### Unitarias

* generación correcta de clave de acceso;
* módulo 11;
* formato secuencial;
* cálculos monetarios;
* cálculo fiscal;
* construcción XML;
* reglas RIMPE;
* máquina de estados.

### Integración

* XML válido contra XSD;
* firma XAdES_BES utilizando certificado exclusivo de pruebas;
* generación de factura a partir de pago verificado;
* idempotencia;
* dos pagos concurrentes sin secuenciales duplicados;
* `RECIBIDA → AUTORIZADO`;
* `RECIBIDA → PPR → AUTORIZADO`;
* `DEVUELTA`;
* `NO AUTORIZADO`;
* timeout de recepción;
* timeout de autorización;
* fallo SMTP;
* reenvío sin duplicar factura.

### Seguridad

* usuario normal no accede a facturas de otra organización;
* owner solo accede a facturas de su organización;
* solo platform admin accede a diagnóstico global;
* certificado nunca aparece en respuestas;
* contraseña nunca aparece en logs.

---

# 30. Ambiente de pruebas SRI

Primero implementar y probar exclusivamente contra:

```text
SRI_ENV=test
```

No activar producción todavía.

La fase se considerará técnicamente preparada cuando:

1. el XML se genera;
2. valida XSD;
3. firma correctamente;
4. SRI recibe el documento;
5. se obtiene `RECIBIDA`;
6. se consulta la autorización;
7. se obtiene una respuesta válida del ambiente de pruebas;
8. se conserva el XML;
9. se genera RIDE;
10. se prueba envío SMTP.

Solo después crear checklist para producción.

---

# 31. Activación productiva

Producción debe exigir expresamente:

```text
SRI_ENV=production
SRI_PRODUCTION_ENABLED=true
```

Además comprobar:

* datos fiscales configurados;
* certificado instalado;
* certificado vigente;
* establecimiento configurado;
* punto de emisión configurado;
* secuencial inicial confirmado;
* régimen tributario confirmado;
* impuestos confirmados;
* conexión con servicios SRI;
* SMTP operativo.

Si falta uno:

```text
NO emitir en producción.
```

Mostrar diagnóstico claro al administrador.

---

# 32. No hacer

No implementar:

* facturación de las barberías a sus clientes;
* contabilidad general;
* declaraciones tributarias;
* ATS automático;
* retenciones;
* compras;
* guías de remisión;
* notas de débito;
* inventario fiscal;
* conciliación bancaria;
* sistema ERP;
* proveedor externo;
* carga de firma electrónica desde usuarios de barberías.

No modificar módulos de Caja ni POS de las barberías para convertirlos en facturación SRI.

---

# 33. Definition of Done

La tarea solo se considera completada cuando:

* existe factura electrónica real desde un pago de suscripción;
* no puede duplicarse;
* genera XML conforme al XSD SRI;
* genera correctamente la clave de acceso;
* firma con XAdES_BES;
* transmite al servicio SRI;
* procesa recepción;
* procesa autorización;
* persiste errores;
* genera RIDE;
* envía XML + RIDE por correo;
* usuario puede consultar sus facturas;
* administrador puede diagnosticar errores;
* certificado y contraseña están protegidos;
* existe ambiente test/production;
* pruebas pasan;
* typecheck pasa;
* lint pasa en archivos modificados;
* build de paquetes afectados pasa;
* migraciones son reversibles;
* documentación queda actualizada.

Actualizar al finalizar:

```text
ESTADO_PROYECTO.md
```

Solo marcar la facturación SRI como `Completa` cuando exista evidencia real del ambiente de pruebas y luego evidencia de producción.

Si únicamente está implementado el código pero falta configurar certificado, datos fiscales o probar contra SRI, marcar:

```text
Funcional / pendiente de validación externa
```

---

# 34. Entrega de Codex

Al terminar informa:

1. estado encontrado antes de modificar;
2. modelos existentes reutilizados;
3. archivos modificados;
4. archivos creados;
5. migraciones creadas;
6. nuevas variables de entorno;
7. librería utilizada para XAdES_BES y por qué;
8. versión XML/XSD utilizada;
9. pruebas realizadas;
10. resultado de pruebas;
11. configuración que debo realizar manualmente;
12. qué debo hacer en SRI en Línea;
13. cómo instalar mi archivo `.p12`;
14. cómo probar una factura en certificación;
15. cómo habilitar producción;
16. limitaciones pendientes.

No ocultes ninguna tarea externa necesaria para que el módulo funcione realmente.
