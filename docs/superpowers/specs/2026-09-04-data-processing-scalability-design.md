# Diseño de escalabilidad para el tratamiento de datos

**Fecha:** 2026-09-04
**Estado:** aprobado en conversación, pendiente de revisión documental
**Alcance:** reservas públicas y privadas, agenda, clientes, inventario y lecturas resumidas del dashboard

## 1. Contexto

Nava usa una API Node/Fastify, Prisma y PostgreSQL alojado en Neon. La aplicación móvil consume la API con React Query. El comportamiento actual es funcional, pero varias rutas y pantallas fueron construidas para volúmenes pequeños y presentan patrones cuyo coste aumenta con el número de registros, sucursales o dispositivos concurrentes.

La revisión inicial encontró los siguientes riesgos concretos:

- `GET /v1/clients` devuelve el directorio completo con etiquetas. La aplicación vuelve a descargarlo cada 30 segundos y filtra la búsqueda en memoria.
- La selección de cliente al crear una reserva también descarga el directorio completo.
- La importación de contactos compara contra el directorio completo y después realiza una solicitud `POST /v1/clients` por contacto, hasta cuatro en paralelo.
- `GET /v1/inventory` devuelve todos los productos, incluye imágenes Base64 y carga inventario de todas las sedes accesibles aunque la respuesta se calcule para una sola sede.
- El dashboard solicita el inventario completo para mostrar un resumen.
- La agenda realiza una solicitud independiente por sede y mantiene polling cada 30 segundos aunque la ruta pueda permanecer montada sin estar enfocada.
- Disponibilidad consulta dos veces el horario de negocio y compara cada franja contra los rangos ocupados mediante búsquedas repetidas.
- Los movimientos de inventario usan `skip` y `count`, cuyo coste crece en páginas profundas.
- Cada solicitud autenticada lee la sesión y escribe `lastActiveAt`, incluso si la petición anterior ocurrió segundos antes.
- La prueba de rendimiento vigente solo mide `/health`; no ejecuta consultas ni representa los flujos operativos.

El problema no se limita a una búsqueda lineal. Incluye sobrelectura, respuestas pesadas, solicitudes duplicadas, polling no contextual, escrituras de sesión excesivas, paginación inadecuada y ausencia de mediciones representativas.

## 2. Objetivos

1. Mantener el comportamiento funcional, permisos, aislamiento multi-tenant y garantías de concurrencia actuales.
2. Diseñar los flujos para un objetivo inicial de 100.000 registros por negocio.
3. Mantener constante la cantidad de consultas por solicitud al crecer el número de registros y sucursales.
4. Reducir lecturas, escrituras y transferencia facturables en Neon.
5. Evitar que la aplicación móvil solicite datos que no está mostrando.
6. Introducir contratos escalables sin romper versiones móviles ya instaladas.
7. Demostrar las mejoras mediante consultas reales, planes de ejecución y pruebas con datos representativos.

## 3. Fuera de alcance

- Eliminar endpoints actuales o forzar la actualización de versiones móviles instaladas.
- Reescribir pagos, facturación SRI, suscripciones o Super Admin, salvo una dependencia directa requerida por los flujos incluidos.
- Incorporar Redis, una cola externa, CQRS o un nuevo proveedor de almacenamiento.
- Cambiar reglas comerciales, permisos, límites de planes o estados de reservas e inventario.
- Ejecutar pruebas destructivas, migraciones o cargas contra Neon de producción.

## 4. Principios de diseño

### 4.1 Compatibilidad aditiva

Los contratos escalables se agregarán como rutas nuevas. Los endpoints `v1` usados por aplicaciones instaladas conservarán su forma y semántica durante este trabajo. No se introducirá un cambio encubierto de respuesta, un límite silencioso ni un fallback que duplique solicitudes.

La aplicación móvil del repositorio migrará a los contratos nuevos. La retirada futura de rutas antiguas requerirá telemetría de uso, una ventana de compatibilidad y una decisión separada.

### 4.2 Consultar solo lo necesario

- Toda colección potencialmente grande debe estar paginada o acotada por fecha.
- Prisma debe usar `select` para evitar columnas grandes y relaciones irrelevantes.
- Las imágenes Base64 no formarán parte de respuestas de listas.
- Los resúmenes se calcularán en PostgreSQL; no se cargará una colección completa para reducirla en Node o en el teléfono.
- La búsqueda y los filtros sobre datos persistentes se ejecutarán en PostgreSQL.

### 4.3 Coste proporcional a la página, no a la tabla

La paginación usará cursores opacos con un orden total estable. Cada cursor codificará la columna de orden y el identificador del último registro. Se solicitará `limit + 1` para determinar si existe una página posterior, evitando `count` en listados interactivos.

Los totales solo se calcularán cuando la interfaz realmente los necesite. Los rangos temporales tendrán límites explícitos.

### 4.4 Consistencia antes que caché

Las reservas y los ajustes de inventario conservarán sus transacciones, bloqueos y restricciones PostgreSQL. Ninguna escritura crítica confiará en una disponibilidad o existencia cacheada. El caché se limitará a lecturas que toleren una antigüedad breve.

## 5. Arquitectura objetivo

### 5.1 Aplicación móvil

React Query seguirá siendo la fuente de estado remoto, con estas reglas:

- Las claves incluirán organización, sede, filtros, orden y cursor.
- Las listas usarán consultas infinitas o paginadas y conservarán las páginas cargadas durante la navegación.
- La búsqueda remota se activará después de un debounce y cancelará solicitudes obsoletas en el cliente.
- El polling solo existirá mientras una pantalla que requiera frescura frecuente esté enfocada.
- Las mutaciones actualizarán el registro afectado o invalidarán la clave exacta. No se invalidarán prefijos amplios sin una dependencia real.
- Un cambio de tenant seguirá descartando datos pertenecientes al alcance anterior.

### 5.2 API

Las rutas delegarán lectura y escritura a servicios de aplicación pequeños, con entradas y salidas explícitas. Los servicios usarán repositorios o funciones de consulta focalizadas, sin introducir una capa genérica que oculte SQL importante.

Cada solicitud autenticada dispondrá de un contexto memoizado que contiene identidad, sesión y acceso a organización/sedes. Una ruta no volverá a consultar la misma membresía o permisos dentro de la misma petición.

La lectura de sesión continuará ocurriendo por solicitud para conservar revocación, suspensión e inactividad. `lastActiveAt` solo se escribirá cuando el valor leído tenga al menos cinco minutos de antigüedad. La escritura usará una condición temporal para tolerar solicitudes concurrentes. Cinco minutos es sustancialmente menor que el timeout de inactividad vigente de siete días; una interrupción abrupta podría adelantar la expiración efectiva un máximo de cinco minutos, a cambio de eliminar las escrituras por cada lectura.

### 5.3 PostgreSQL

Los índices se derivarán de consultas concretas, incluyendo igualdad por tenant/sede, columnas de orden y `id` como desempate. La búsqueda textual conservará la coincidencia parcial existente y usará un índice compatible, validado con PostgreSQL real.

Los índices de expresión u operador no representables por Prisma se crearán mediante una migración SQL explícita. La migración cumplirá la política de seguridad del proyecto: prueba desde cero, prueba sobre el estado anterior, análisis de locks, reintento, aplicación parcial y rollback.

## 6. Contratos de lectura

Las rutas aditivas de esta fase serán:

| Ruta | Propósito |
| --- | --- |
| `GET /v2/clients` | Directorio paginado y búsqueda de clientes |
| `GET /v2/clients/:clientId/notes` | Notas paginadas sin fotografías embebidas |
| `GET /v2/clients/:clientId/notes/:noteId/photo` | Fotografía privada bajo demanda |
| `POST /v2/clients/import` | Importación por lote |
| `GET /v2/appointments` | Agenda detallada para una o varias sedes |
| `GET /v2/appointments/calendar-summary` | Resumen mensual por fecha y sede |
| `GET /v2/availability` | Disponibilidad privada optimizada |
| `GET /v2/inventory/products` | Productos paginados y livianos |
| `GET /v2/inventory/products/:productId/image` | Imagen privada bajo demanda |
| `GET /v2/inventory/summary` | Agregado liviano de inventario |
| `GET /v2/inventory/movements` | Movimientos paginados por cursor |
| `GET /v2/public/:organizationSlug/:locationSlug/catalog` | Catálogo público liviano |
| `GET /v2/public/:organizationSlug/:locationSlug/availability` | Disponibilidad pública optimizada |
| `GET /v2/public/:organizationSlug/:locationSlug/media/:kind/:id` | Medio público bajo demanda |

La página pública mantendrá sus URLs navegables actuales para no romper enlaces compartidos. Los endpoints API `v1` también permanecerán intactos. La web del repositorio consumirá las rutas `v2`, cuyas implementaciones usarán las mismas consultas optimizadas y cargarán sus medios mediante identificadores no sensibles y política de caché.

### 6.1 Clientes

Se agregará un listado paginado con:

- cursor opaco;
- límite predeterminado de 50 y máximo de 100;
- búsqueda por nombre y, cuando el permiso lo permita, teléfono y correo;
- filtro opcional por etiqueta;
- orden estable;
- respuesta `items` y `nextCursor`, sin total obligatorio.

La respuesta incluirá solo los datos necesarios para la tarjeta. El detalle y las notas continuarán como recursos separados. Las notas se paginarán y su listado no incluirá el contenido Base64 de fotografías; este se obtendrá bajo demanda mediante un recurso protegido.

La selección de cliente durante una reserva usará el mismo servicio de búsqueda y mostrará resultados progresivos. No descargará el directorio completo.

### 6.2 Agenda

Una nueva consulta admitirá varias sedes autorizadas en una sola solicitud. El servidor validará todas las sedes antes de consultar datos.

- Vista diaria: detalles del día, paginados si exceden el límite.
- Vista semanal: detalles acotados al rango de siete días.
- Vista mensual: resumen por fecha/sede para dibujar el calendario; los detalles se cargarán al seleccionar un día.
- Rango máximo permitido: 31 días.

El detalle seleccionará solo campos y relaciones usados por la interfaz. El número de consultas no crecerá con la cantidad de sedes solicitadas.

### 6.3 Disponibilidad y reservas

La disponibilidad privada y pública compartirá una función pura para:

1. ordenar y fusionar rangos ocupados;
2. recorrer horarios y rangos con punteros monotónicos;
3. producir franjas disponibles y, donde corresponda, no disponibles.

La consulta seleccionará únicamente `startsAt` y `endsAt` de citas que reservan espacio. El horario de negocio se consultará una sola vez. La complejidad dejará de ser una búsqueda completa de rangos por cada franja.

Crear o reprogramar una cita volverá a verificar el conflicto en la operación. La restricción de exclusión de PostgreSQL continuará siendo la autoridad final contra reservas simultáneas.

El catálogo público separará datos livianos de medios pesados. Los metadatos poco variables usarán caché HTTP de corta duración. La disponibilidad nunca se considerará una garantía de escritura.

### 6.4 Inventario

El listado de productos admitirá cursor, búsqueda, sede, estado y filtro de stock bajo. Tendrá los mismos límites de 50/100 que clientes.

La consulta de productos:

- excluirá `imageData`;
- cargará el registro de `LocationInventory` de la sede seleccionada, no de todas las sedes;
- aplicará los filtros en PostgreSQL;
- devolverá una referencia al recurso de imagen cuando exista.

El resumen de inventario se calculará mediante agregación en PostgreSQL y tendrá un contrato liviano independiente, reutilizable por el dashboard. Los movimientos usarán cursor compuesto por `createdAt` e `id`, sin `skip` ni `count` obligatorio.

### 6.5 Dashboard

El dashboard consumirá recursos resumidos. No obtendrá listas completas para mostrar contadores o importes agregados. Las consultas independientes podrán ejecutarse en paralelo, pero compartirán claves y datos ya disponibles para evitar duplicación con otras pantallas.

## 7. Contratos de escritura

### 7.1 Importación de clientes

Se agregará una operación por lote de hasta 100 contactos. El servidor:

1. normalizará y validará el lote una vez;
2. eliminará duplicados dentro del lote;
3. consultará coincidencias existentes en una operación acotada;
4. validará una vez la capacidad restante del plan bajo el bloqueo de organización;
5. creará clientes y auditorías en lote dentro de una transacción;
6. devolverá por elemento `created`, `skipped` o `rejected` con una razón estable.

Esto conserva la importación parcial visible para el usuario, pero evita una solicitud, autenticación, escritura de sesión, verificación del plan y auditoría separadas por contacto.

### 7.2 Reservas e inventario

No se agruparán escrituras independientes que requieran decisiones del usuario. Se optimizarán lecturas previas redundantes y se usarán escrituras en lote solo cuando mantengan las mismas garantías transaccionales y de auditoría.

Los bloqueos por organización, cita o producto/sede continuarán siendo específicos. No se introducirá un bloqueo global.

## 8. Medios y tamaño de respuesta

Las columnas Base64 existentes permanecerán en PostgreSQL durante esta fase para evitar una migración de almacenamiento no relacionada. Sin embargo:

- las listas seleccionarán solo un indicador de existencia o metadatos livianos;
- el contenido se servirá mediante endpoints dedicados y protegidos;
- las respuestas usarán `ETag`, `Cache-Control` adecuado a su privacidad y soporte condicional;
- la interfaz cargará medios solo cuando sean visibles o necesarios.

Una futura migración a almacenamiento de objetos será una decisión independiente basada en transferencia y volumen observados.

## 9. Invalidación y frescura

- Clientes: sin polling periódico. Se refrescan al entrar cuando estén obsoletos, al solicitarlo el usuario y después de una mutación relacionada.
- Agenda: polling de 30 segundos solo con la pantalla enfocada y la aplicación en primer plano. Crear, cancelar, completar o reprogramar invalida el rango y sede afectados.
- Inventario: sin polling general. Ajustes, ventas, reversiones y recepción de pedidos actualizan o invalidan producto, resumen y movimientos afectados.
- Dashboard: cada resumen tendrá una política de frescura acorde a su uso; no se forzará `staleTime: 0` de manera global.
- Solicitudes con búsquedas superadas por una entrada nueva se cancelarán en el cliente y sus resultados no sustituirán el estado actual.

## 10. Validación, errores y seguridad

- Todo cursor incluirá versión, tipo de recurso, valor de orden e identificador, codificados como Base64 URL-safe. Un cursor malformado, incompatible o perteneciente a otro tipo de recurso devolverá `400` con un código estable. El cursor no otorgará acceso: el alcance multi-tenant se aplicará de nuevo en cada página.
- Límites de página, lote y rango se validarán antes de consultar PostgreSQL.
- Toda consulta mantendrá el filtro de organización y, cuando aplique, sede, profesional o rol.
- No se registrarán tokens, términos de búsqueda, datos personales, cuerpos ni parámetros SQL.
- Los endpoints de medios privados exigirán la misma autenticación y permiso que el recurso de origen.
- Un elemento eliminado entre páginas no invalidará el cursor; el cliente podrá continuar con los registros posteriores.
- Los errores parciales de importación se expresarán por elemento. Un fallo de infraestructura revertirá la transacción completa y devolverá un error de solicitud.

## 11. Observabilidad

Cada ruta incluida emitirá métricas o logs estructurados con:

- identificador de solicitud;
- plantilla de ruta, nunca la URL con datos;
- estado HTTP;
- duración total;
- cantidad de operaciones de base de datos;
- tiempo acumulado de base de datos;
- tamaño aproximado de respuesta;
- resultado de cumplimiento del presupuesto.

La instrumentación usará contexto por solicitud y no cambiará la semántica de consultas. Las pruebas podrán leer los contadores sin depender del texto de logs productivos.

## 12. Presupuestos y criterios de aceptación

Los presupuestos de operaciones de base de datos en estado estable incluyen autenticación y contexto de acceso, pero excluyen la escritura condicional de sesión que puede ocurrir una vez cada cinco minutos:

| Operación | Máximo inicial | Condición de escala |
| --- | ---: | --- |
| Página de clientes | 4 | No aumenta con el total de clientes o etiquetas |
| Búsqueda de clientes | 4 | No aumenta con el total de coincidencias |
| Página de agenda para varias sedes | 4 | No aumenta con el número de sedes solicitado |
| Resumen mensual de agenda | 4 | No aumenta con el número de sedes solicitado |
| Disponibilidad privada | 6 | No aumenta con citas del profesional fuera del día |
| Página de inventario | 4 | No aumenta con productos ni sedes accesibles |
| Resumen de inventario | 4 | No carga filas completas en Node |
| Página de movimientos | 4 | No aumenta en páginas profundas |
| Importación de hasta 100 contactos | 8 | No aumenta por cada contacto del lote |

La medición contará operaciones lógicas emitidas por Prisma y, en las pruebas PostgreSQL representativas, sentencias SQL reales. Si el mecanismo de carga de una relación emite más de una sentencia, todas cuentan. Una operación podrá exceder temporalmente el presupuesto solo cuando ejecute la escritura condicional de `lastActiveAt`; ese incremento deberá ser exactamente una escritura y quedar identificado por la instrumentación.

Con PostgreSQL local preparado con 100.000 registros por entidad grande y datos distribuidos entre tenants/sedes:

- una interacción de listado de clientes, inventario o agenda produce una solicitud HTTP inicial;
- ninguna pantalla no enfocada mantiene polling;
- una importación produce una solicitud por cada lote de hasta 100 contactos;
- las lecturas principales alcanzan p95 menor a 300 ms en el perfil local acordado;
- las escrituras críticas alcanzan p95 menor a 500 ms en el mismo perfil;
- una página sin imágenes no supera aproximadamente 250 KB;
- la cantidad de consultas SQL por endpoint no crece con el tamaño de la tabla ni con el número de sedes solicitado dentro del límite;
- las consultas sobre tablas grandes muestran un plan compatible con los índices diseñados bajo `EXPLAIN (ANALYZE, BUFFERS)`;
- las pruebas existentes de permisos, aislamiento, reservas e inventario continúan pasando;
- las pruebas nuevas demuestran que los contratos `v1` conservan su comportamiento durante la transición.

Los umbrales absolutos se ejecutarán en un entorno local documentado y estable. Además se guardará la comparación antes/después para evitar atribuir una mejora a diferencias de hardware.

## 13. Estrategia de pruebas

1. Pruebas unitarias para cursores, fusión de intervalos, validación de rangos, debounce, enfoque de pantalla e invalidaciones.
2. Pruebas de integración de API para paginación sin duplicados ni omisiones, aislamiento multi-tenant, permisos y respuestas parciales de importación.
3. Pruebas PostgreSQL de concurrencia para doble reserva y stock no negativo.
4. Pruebas de compatibilidad que ejerciten rutas `v1` antes y después de agregar contratos nuevos.
5. Pruebas de conteo de solicitudes desde los flujos móviles incluidos.
6. Perfil de rendimiento autenticado para clientes, agenda, disponibilidad, reservas e inventario; `/health` permanecerá solo como control de transporte.
7. `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` sobre consultas representativas con el conjunto grande.
8. Validación completa de migraciones en PostgreSQL temporal y en `TEST_DATABASE_URL` local conforme a la política del proyecto.
9. Al finalizar: validación de Prisma, pruebas relacionadas y completas, lint, typecheck y build.

Las pruebas que limpian o generan datos solo podrán usar `TEST_DATABASE_URL` si el host es `127.0.0.1`, el puerto es `5433` y la base es `barber_saas_test`. La URL no se imprimirá. Neon de producción queda expresamente excluido.

## 14. Despliegue gradual

1. Incorporar instrumentación y capturar línea base sin modificar contratos.
2. Crear y validar índices aditivos.
3. Agregar contratos escalables y mantener `v1`.
4. Migrar cada flujo móvil de manera independiente, con pruebas de solicitudes y regresión.
5. Comparar p50, p95, consultas, escrituras y bytes contra la línea base.
6. Desplegar API antes o junto con la nueva aplicación; nunca desplegar una app que dependa de una ruta aún inexistente.
7. Observar errores, latencia y uso de rutas antiguas. La eliminación de `v1` no forma parte de esta fase.

Si una optimización no reduce el coste medido o degrada comportamiento, se conserva el contrato estable y se revierte únicamente esa optimización. Redis o modelos de lectura separados solo se evaluarán si PostgreSQL optimizado incumple los presupuestos con evidencia reproducible.
