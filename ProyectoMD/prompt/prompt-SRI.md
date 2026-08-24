Quiero preparar y auditar completamente el backend de Nava para realizar las primeras pruebas reales de **facturación electrónica contra el ambiente de PRUEBAS/CERTIFICACIÓN del SRI de Ecuador**.

Antes de modificar nada, lee completamente:

* `ESTADO_PROYECTO.md` / `Politicas_y_terminos_Nava.md`, usando como autoridad la versión más reciente;
* `.env.example`;
* configuración del paquete de base de datos y Prisma;
* todas las migraciones relacionadas con suscripciones y SRI;
* todo el código relacionado con:

  * `SriInvoice`;
  * `SubscriptionInvoice`;
  * `SubscriptionPaymentAttempt`;
  * generación de clave de acceso;
  * secuenciales;
  * XML factura 2.1.0;
  * XAdES_BES;
  * PKCS#12 / `.p12`;
  * SOAP recepción SRI;
  * SOAP autorización SRI;
  * RIDE;
  * SMTP;
  * workers/reintentos;
  * configuración mediante variables de entorno.

## Contexto externo que ya está resuelto

Ya tengo:

* autorización del SRI aprobada para emitir **Factura** en el ambiente correspondiente de pruebas;
* certificado de firma electrónica en archivo `.p12`;
* contraseña válida del `.p12`;
* razón social fiscal real registrada ante el SRI.

IMPORTANTE:

La marca del producto es:

`Nava`

pero **Nava NO es necesariamente la razón social fiscal del emisor**.

La factura electrónica debe utilizar como emisor los datos fiscales reales configurados mediante variables de entorno/configuración de servidor.

No reemplaces branding, textos comerciales, dominio ni nombre de producto Nava.

Debes separar claramente:

`Marca comercial / producto = Nava`

de:

`Razón social del emisor SRI = [RAZÓN SOCIAL REAL]`

La razón social real NO debe quedar hardcodeada en el código fuente.

Debe configurarse mediante variable de entorno o mediante el mecanismo fiscal ya existente en el proyecto.

---

# OBJETIVO DE ESTA TAREA

No quiero todavía activar facturación SRI en producción.

Quiero dejar el backend listo para ejecutar:

`Nava -> factura -> XML -> validación XSD -> firma .p12 -> recepción SRI pruebas -> autorización SRI pruebas -> XML autorizado -> RIDE -> SMTP`

y posteriormente realizar manualmente una primera prueba controlada.

---

# FASE 1 — AUDITORÍA DEL BACKEND

Primero NO modifiques código.

Revisa la implementación existente y entrégame una tabla:

| Componente | Estado | Archivo(s) | Prueba existente | Pendiente |
| ---------- | ------ | ---------- | ---------------- | --------- |

Como mínimo revisa:

1. `SriInvoice`.
2. Relación única factura fiscal ↔ pago de suscripción.
3. Secuencial fiscal concurrente.
4. Clave de acceso de 49 dígitos.
5. Módulo 11.
6. Factura XML 2.1.0.
7. Datos del emisor.
8. Datos del comprador.
9. Totales/subtotales/impuestos.
10. Forma de pago.
11. Ambiente SRI.
12. Firma XAdES_BES.
13. Lectura PKCS#12.
14. Contraseña PKCS#12.
15. Validación XSD oficial.
16. SOAP de Recepción.
17. SOAP de Autorización.
18. interpretación de estados SRI.
19. almacenamiento XML enviado.
20. almacenamiento XML autorizado.
21. número de autorización.
22. generación de RIDE PDF.
23. SMTP XML + RIDE.
24. cola/reintentos.
25. idempotencia.
26. recuperación tras reinicio del proceso.
27. protección contra factura duplicada.
28. logs sin secretos.
29. descarga de XML/RIDE.
30. endpoints administrativos/owner relacionados.

No confíes únicamente en `ESTADO_PROYECTO.md`.

Verifica el código real.

---

# FASE 2 — BUSCAR DATOS FISCALES HARDCODEADOS

Busca en TODO el repositorio referencias fiscales como:

* `Nava`;
* razón social;
* RUC;
* nombre comercial;
* dirección matriz;
* establecimiento;
* punto de emisión;
* obligado a llevar contabilidad;
* régimen;
* contribuyente especial;
* agente de retención;
* códigos tributarios;
* IVA;
* forma de pago.

Quiero saber específicamente si `"Nava"` aparece incorrectamente como:

* `<razonSocial>`;
* emisor;
* razón social fiscal;
* propietario tributario;
* nombre legal en XML.

Si aparece hardcodeado, corrígelo.

El XML debe tomar los datos fiscales reales desde configuración segura.

`Nava` puede permanecer como nombre comercial únicamente si la implementación y los datos fiscales configurados lo permiten, pero **nunca debe sustituir la razón social legal obligatoria**.

---

# FASE 3 — VARIABLES DE ENTORNO SRI

Inspecciona primero cuáles variables YA EXISTEN.

No inventes nombres nuevos si el proyecto ya tiene equivalentes.

Necesito que al finalizar me entregues una sección:

## Variables SRI requeridas en `/etc/nava/api.env`

Con formato:

```env
VARIABLE=valor_de_ejemplo
```

pero:

* NO escribas mi contraseña real;
* NO escribas secretos reales;
* NO escribas la contraseña del `.p12`;
* usa placeholders.

Como mínimo deben quedar cubiertos conceptualmente:

```text
SRI_ENV=test
SRI_EMISSION_ENABLED=true
SRI_PRODUCTION_ENABLED=false

RUC emisor
razón social emisor
nombre comercial, si corresponde
dirección matriz
establecimiento
punto de emisión
obligado a contabilidad
régimen/leyenda aplicable
códigos tributarios
IVA/tarifa configurada
forma de pago
ruta del certificado
contraseña del certificado
timeout/espera autorización SRI
SMTP necesario para factura
```

Si alguna de esas variables no existe porque se obtiene por otro mecanismo, explica exactamente dónde se obtiene.

### Regla crítica de seguridad

En esta etapa debe quedar:

```env
SRI_ENV=test
SRI_PRODUCTION_ENABLED=false
```

No permitas accidentalmente facturación en producción.

Si existe doble protección adicional, mantenla.

---

# FASE 4 — VALIDACIÓN DEL `.p12`

Añade o identifica una comprobación segura que permita verificar:

* archivo existe;
* proceso tiene permisos de lectura;
* formato PKCS#12 válido;
* contraseña correcta;
* certificado no está vencido;
* certificado contiene clave privada;
* certificado permite firmar;
* sujeto/emisor del certificado puede visualizarse de manera segura.

NO imprimir:

* contraseña;
* clave privada;
* contenido binario;
* secretos;
* certificado completo en logs.

Quiero un comando o script seguro que pueda ejecutar en la VPS para comprobar que Nava puede abrir correctamente el `.p12`.

---

# FASE 5 — VALIDACIÓN XSD

El estado del proyecto indica que este punto era pendiente.

Comprueba si actualmente el XML de factura 2.1.0 se valida contra el XSD oficial antes de enviarlo.

Si NO existe, impleméntalo.

Flujo esperado:

```text
crear XML
↓
validar XSD factura 2.1.0
↓
si es inválido:
    detener envío
    persistir error
    NO consumir secuenciales incorrectamente si la arquitectura permite evitarlo
    NO enviar al SRI
↓
si es válido:
    firmar
↓
enviar SRI
```

Utiliza esquemas oficiales del SRI y documenta:

* origen;
* versión;
* ubicación dentro del proyecto;
* mecanismo para actualizarlos.

No descargues XSD desde Internet durante cada factura en producción.

---

# FASE 6 — FIRMA ELECTRÓNICA

Verifica realmente la implementación XAdES_BES.

Confirma:

* firma enveloped;
* certificado incluido según lo requerido;
* digest correcto;
* referencia al documento;
* algoritmo utilizado por la implementación actual;
* canonicalización;
* SignedProperties;
* Ids/referencias XML;
* lectura del `.p12`.

Añade pruebas automatizadas donde falten.

No reemplaces una implementación funcional solo por preferencia de librería.

---

# FASE 7 — SRI AMBIENTE TEST

Verifica que cuando:

```env
SRI_ENV=test
```

solo se utilicen endpoints de certificación/pruebas.

Y que cuando:

```env
SRI_PRODUCTION_ENABLED=false
```

sea imposible enviar accidentalmente una factura al ambiente productivo.

Quiero que exista un fallo explícito si alguien intenta usar producción sin la doble autorización prevista.

---

# FASE 8 — IDEMPOTENCIA

La facturación NO puede duplicarse si:

* PayPhone repite una respuesta;
* se reinicia la API;
* el worker reintenta;
* SRI tarda;
* SMTP falla;
* el usuario solicita reenvío;
* una petición HTTP se repite.

Verifica mediante restricciones de base de datos y código que:

```text
1 pago aplicado
=
máximo 1 comprobante fiscal
```

El reenvío por correo debe reutilizar:

* XML autorizado existente;
* RIDE existente;

y NO emitir una factura nueva.

---

# FASE 9 — SMTP

Verifica que:

```text
Factura AUTORIZADA
↓
generar RIDE
↓
enviar XML autorizado + RIDE PDF
```

El fallo SMTP debe ser independiente del estado tributario.

Es decir:

```text
SRI = AUTORIZADA
SMTP = FALLÓ
```

debe mantener la factura autorizada y permitir reintentar únicamente el correo.

No debe crear otra factura.

---

# FASE 10 — PRUEBAS AUTOMATIZADAS

Ejecuta como mínimo las pruebas relacionadas con SRI y posteriormente:

```bash
pnpm db:validate
pnpm typecheck
pnpm test
pnpm build
```

Si existe lint específico de los archivos modificados, ejecútalo también.

Sabemos que el estado histórico del proyecto puede contener errores globales de lint/formato no relacionados con SRI.

No ocultes esos fallos.

Diferencia:

* errores introducidos por esta tarea;
* errores preexistentes.

Si hay pruebas PostgreSQL que requieren `TEST_DATABASE_URL`, indícame exactamente cómo ejecutarlas sin tocar la base productiva.

NUNCA uses Neon productivo como base de pruebas automatizadas destructivas.

---

# FASE 11 — MIGRACIONES

Revisa las migraciones reales disponibles.

Debe existir o verificarse la migración relacionada con facturación SRI, históricamente identificada como:

```text
20260823180000_sri_electronic_invoicing
```

No asumas que ya está aplicada en Neon.

No modifiques migraciones previamente aplicadas.

No utilices:

```bash
pnpm db:migrate:dev
```

en producción.

El despliegue debe usar:

```bash
pnpm db:migrate:deploy
pnpm db:status
```

Antes de indicarme que puedo desplegar, determina qué migraciones están pendientes según el repositorio ACTUAL.

---

# FASE 12 — PREPARAR CARGA SEGURA DEL `.p12` EN VPS

La VPS actual utiliza aproximadamente:

```text
/opt/nava/app
/etc/nava/api.env
```

No metas el certificado dentro de:

```text
/opt/nava/app
```

ni dentro del repositorio Git.

Propón utilizar una ruta de secretos fuera del proyecto, preferiblemente:

```text
/etc/nava/secrets/sri/
```

o, si la arquitectura existente utiliza otra ruta de secretos, reutiliza esa convención.

Necesito que al finalizar me entregues los comandos exactos para:

1. crear directorio seguro;
2. subir/copiar el `.p12`;
3. asignar propietario correcto;
4. aplicar permisos mínimos;
5. verificar permisos;
6. configurar la ruta en `/etc/nava/api.env`;
7. reiniciar únicamente los servicios necesarios.

IMPORTANTE:

No asumas que el usuario de `nava-api.service` se llama `nava`.

Primero dame el comando para descubrirlo, por ejemplo inspeccionando:

```bash
systemctl cat nava-api.service
```

y luego construye los comandos según el usuario real configurado en `User=`.

No uses permisos `777`.

El `.p12` debe quedar accesible únicamente al proceso que necesita firmar facturas.

---

# FASE 13 — MÉTODO DE CARGA DEL ARCHIVO

Dame dos alternativas:

### A. Desde Windows mediante SCP

Debe producir un comando equivalente a:

```powershell
scp "C:\RUTA\mi-firma.p12" root@IP_VPS:/ruta-temporal/
```

pero con placeholders para:

```text
IP_VPS
RUTA_LOCAL
NOMBRE_ARCHIVO
```

Después dame los comandos Linux necesarios para moverlo desde la ruta temporal al directorio seguro.

### B. Si el archivo ya está dentro del servidor

Dame los comandos `mv`, `chown` y `chmod` correspondientes.

No quiero subir el `.p12` a GitHub.

---

# FASE 14 — CONFIGURACIÓN DE LA RAZÓN SOCIAL

Necesito configurar:

```text
Razón social fiscal:
[RAZÓN SOCIAL REAL]
```

La razón social real es distinta a la marca `Nava`.

Quiero que me indiques:

1. nombre exacto de la variable de entorno existente;
2. archivo donde se lee;
3. función que la inserta en `<razonSocial>`;
4. si existe `<nombreComercial>`;
5. cómo debo configurar Nava como nombre comercial, si corresponde;
6. cómo comprobar mediante una factura XML generada que:

```xml
<razonSocial>[RAZÓN SOCIAL REAL]</razonSocial>
```

y no:

```xml
<razonSocial>Nava</razonSocial>
```

No expongas datos tributarios reales en pruebas públicas.

---

# FASE 15 — CONFIGURACIÓN DE DATOS FISCALES

Dame una plantilla que yo pueda completar manualmente:

```text
RUC:
RAZON_SOCIAL:
NOMBRE_COMERCIAL:
DIRECCION_MATRIZ:
ESTABLECIMIENTO:
PUNTO_EMISION:
OBLIGADO_CONTABILIDAD:
REGIMEN:
LEYENDA_REGIMEN:
CODIGO_IVA:
TARIFA_IVA:
FORMA_PAGO:
```

No adivines ninguno.

Si algún dato no es requerido por la implementación actual, explica por qué.

Si falta información tributaria que deba confirmar con contador/SRI, márcala como:

```text
REQUIERE_CONFIRMACION_TRIBUTARIA
```

y NO la hardcodees.

---

# FASE 16 — DESPLIEGUE VPS

La infraestructura histórica indica:

```text
Repositorio: /opt/nava/app
Backend: nava-api.service
Web pública: nava-web.service
Base de datos: Neon PostgreSQL
Variables backend: /etc/nava/api.env
```

Verifica primero que eso continúe siendo cierto.

No asumas que existe:

```text
nava-admin.service
```

Compruébalo antes.

Quiero un runbook exacto, seguro y copiable para mi VPS.

Debe comenzar por inspecciones sin cambios:

```bash
cd /opt/nava/app
git status
git branch --show-current
git rev-parse HEAD
systemctl status nava-api.service --no-pager
systemctl cat nava-api.service
```

Luego indicar:

```bash
git pull --ff-only origin main
corepack enable
pnpm install --frozen-lockfile
pnpm db:migrate:deploy
pnpm db:status
pnpm db:generate
pnpm build
```

Antes de reiniciar servicios, verifica que la configuración SRI pueda cargarse.

Después reinicia únicamente los servicios afectados.

Como mínimo:

```bash
systemctl restart nava-api.service
systemctl status nava-api.service --no-pager
curl -fsS https://api.navacloud.app/health
```

Si realmente se necesita reiniciar Web/Admin, explícame por qué.

No reinicies servicios innecesarios.

---

# FASE 17 — VERIFICACIÓN POST-DESPLIEGUE

Dame comandos para comprobar sin exponer secretos:

* API está levantada;
* variables SRI existen;
* `SRI_ENV=test`;
* producción está deshabilitada;
* ruta `.p12` existe;
* permisos correctos;
* proceso puede leer `.p12`;
* Prisma está actualizado;
* worker de facturación está funcionando;
* no existen errores SRI al iniciar;
* SMTP está configurado.

No quiero comandos que impriman la contraseña del `.p12`.

No uses:

```bash
cat /etc/nava/api.env
```

si eso mostraría secretos.

Usa comprobaciones seguras.

---

# FASE 18 — PRIMERA PRUEBA SRI

Después del despliegue, NO generes automáticamente una factura real.

Dame las instrucciones para ejecutar UNA factura controlada en ambiente:

```text
SRI_ENV=test
```

Quiero comprobar:

```text
1. creación SriInvoice
2. clave acceso 49 dígitos
3. XML 2.1.0
4. XSD OK
5. firma OK
6. SRI Recepción = RECIBIDA
7. SRI Autorización = AUTORIZADO
8. número de autorización
9. XML autorizado almacenado
10. RIDE PDF generado
11. SMTP enviado
```

Si el SRI devuelve:

```text
DEVUELTA
NO AUTORIZADO
EN PROCESO
```

quiero que los errores queden visibles y persistidos sin borrar evidencia.

---

# FASE 19 — PRUEBAS DE FALLO

Después de lograr una factura autorizada en TEST, define pruebas para:

### Caso A

SMTP falla.

Resultado esperado:

```text
Factura sigue AUTORIZADA
Correo queda pendiente/fallido
Reintento NO crea nueva factura
```

### Caso B

Worker se reinicia.

Resultado:

```text
Retoma factura pendiente
No duplica comprobante
```

### Caso C

Misma operación se dispara dos veces.

Resultado:

```text
Una sola SriInvoice
Un solo secuencial fiscal
```

### Caso D

SRI temporalmente no responde.

Resultado:

```text
estado persistido
reintento controlado
suscripción no se desactiva
```

### Caso E

`.p12` inválido o contraseña incorrecta.

Resultado:

```text
error explícito
NO envío al SRI
NO secreto en logs
```

---

# FASE 20 — NO ACTIVAR PRODUCCIÓN

Durante toda esta tarea debe permanecer:

```env
SRI_ENV=test
SRI_PRODUCTION_ENABLED=false
```

No cambies a:

```env
SRI_ENV=production
```

aunque todas las pruebas pasen.

Cuando terminemos las pruebas SRI de certificación, haremos una tarea separada para habilitar producción.

---

# SALIDA OBLIGATORIA DE CODEX

Al terminar quiero exactamente estas secciones:

## 1. Estado actual encontrado

Qué ya estaba implementado y qué faltaba.

## 2. Cambios realizados

Archivos modificados y motivo.

## 3. Problemas encontrados

Especialmente hardcodes de `Nava`, XSD, certificado, SRI o SMTP.

## 4. Variables de entorno necesarias

Plantilla completa sin secretos reales.

## 5. Datos que debo proporcionar yo

Solo lo que realmente falte.

## 6. Comandos Windows para subir `.p12`

Copiables.

## 7. Comandos VPS para instalar `.p12`

Copiables y seguros.

## 8. Comandos VPS para configurar `/etc/nava/api.env`

Sin imprimir secretos.

## 9. Comandos para aplicar migraciones

Usando exclusivamente flujo productivo seguro.

## 10. Comandos de build/reinicio

Según los servicios que realmente existan.

## 11. Comandos de verificación

API, certificado, DB, SRI TEST y worker.

## 12. Procedimiento primera factura TEST

Paso por paso.

## 13. Resultado de pruebas automatizadas

Comando + resultado.

## 14. Checklist GO / NO-GO

Formato:

```text
[ ] Migraciones aplicadas
[ ] Certificado instalado
[ ] Certificado legible
[ ] Contraseña válida
[ ] Razón social correcta
[ ] RUC correcto
[ ] Establecimiento correcto
[ ] Punto de emisión correcto
[ ] Régimen confirmado
[ ] IVA/código confirmado
[ ] Forma de pago confirmada
[ ] XSD aprobado
[ ] Firma XAdES válida
[ ] Recepción SRI TEST aprobada
[ ] Autorización SRI TEST aprobada
[ ] XML autorizado almacenado
[ ] RIDE generado
[ ] SMTP entregado
[ ] Reintento no duplica factura
[ ] Producción SRI sigue deshabilitada
```

Al final debes decir únicamente una de estas dos conclusiones:

```text
LISTO PARA PRUEBA SRI EN VPS
```

o

```text
NO LISTO PARA PRUEBA SRI EN VPS
```

Si es `NO LISTO`, enumera exactamente los bloqueantes.

No declares el sistema listo para PRODUCCIÓN en esta tarea.
