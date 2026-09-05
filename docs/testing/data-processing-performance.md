# Línea base de procesamiento de datos

## Medición v2 local

La corrida v2 se guarda por separado en `.tmp/performance-v2.json`; no modifica la línea base v1. La ejecución vigente usó el mismo fixture local, volumen y concurrencia, no tuvo fallos HTTP ni violaciones de p95, tamaño de página o actividad de sesión. El contenedor local de pruebas usa 256 MiB de memoria compartida para evitar que las agregaciones simultáneas de PostgreSQL agoten `/dev/shm`.

| Escenario | p95 v1 ms | p95 v2 ms | Reducción p95 | Bytes p95 v2 | Fallos v2 |
| --- | ---: | ---: | ---: | ---: | ---: |
| clients-first-page | 201.71 | 114.11 | 43.4% | 12,149 | 0 |
| clients-search | — | 53.37 | — | 12,149 | 0 |
| contact-import-100 | 5,123.12 | 266.41 | 94.8% | 10,103 | 0 |
| agenda-week-five-locations | 272.88 | 62.74 | 77.0% | 26,408 | 0 |
| private-availability | 650.89 | 93.25 | 85.7% | 33 | 0 |
| appointment-create | no comparable* | 373.76 | — | 827 | 0 |
| inventory-first-page | 31,130.96 | 243.49 | 99.2% | 14,253 | 0 |
| inventory-summary | 26,154.41 | 233.29 | 99.1% | 150 | 0 |
| inventory-deep-cursor | 73.05 | 35.31 | 51.7% | 10,551 | 0 |
| inventory-adjustment | 288.22 | 144.78 | 49.8% | 315 | 0 |
| public-catalog | 12,304.25 | 52.86 | 99.6% | 15,946 | 0 |

\* La línea base v1 de alta de cita tenía 50 respuestas inválidas por una hora UTC fuera del horario local; no se usa para comparación. La corrida v2 del 5 de septiembre de 2026 cumple el presupuesto de escritura crítica de 500 ms p95. La actividad de sesión en 100 solicitudes recientes produjo 0 actualizaciones (p95 18.74 ms). Los presupuestos de consultas por ruta se verifican en las integraciones focalizadas con una solicitud aislada; el máximo de `x-nava-query-count` de carga concurrente queda como diagnóstico, pues el observador compartido de Prisma no atribuye de forma fiable cada evento de motor a una solicitud paralela.

## Entorno local aislado

- Fecha: 2026-09-05.
- Equipo: AMD Ryzen 9 5900X (12 núcleos / 24 hilos), 31.92 GiB de RAM.
- Node.js: v24.12.0.
- pnpm: 11.7.0.
- Base: PostgreSQL 18 en Docker, exclusivamente `127.0.0.1:5433/barber_saas_test`.
- Fixture: `perf-data-local`, con 100.000 clientes, citas, productos y movimientos de inventario; cinco sedes y 20 profesionales.

El comando `pnpm test:performance:data` inicia una API compilada propia en `127.0.0.1:4100`; no acepta una URL remota ni utiliza un servidor ya iniciado. Las lecturas se ejecutan con 200 interacciones y concurrencia 20. Las creaciones de citas y ajustes usan 50 interacciones y concurrencia 10. La importación realiza diez interacciones de 100 contactos con cuatro workers.

## Resultados

Los resultados se completan con la salida JSON de la ejecución v1. Los percentiles son por interacción; el runner también informa las solicitudes HTTP internas, bytes p95, máximo de consultas observadas y fallos.

| Escenario | Solicitudes HTTP | p50 ms | p95 ms | Bytes p95 | Máx. consultas | Fallos | v2 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| clients-list | 200 | 140.59 | 201.71 | 52,287 | 7 | 0 | no ejecutada |
| contact-import-100 | 1,000 | 4,978.70 | 5,123.12 | 568 | 39 | 0 | no ejecutada |
| agenda-week-five-locations | 200 | 227.13 | 272.88 | 201,522 | 9 | 0 | no ejecutada |
| private-availability | 200 | 581.31 | 650.89 | 33 | 12 | 0 | no ejecutada |
| appointment-create | 50 | 83.53 | 268.25 | 106 | 23 | 50* | no ejecutada |
| inventory-list | 200 | 27,247.66 | 31,130.96 | 36,844,907 | 11 | 0 | no ejecutada |
| inventory-dashboard-summary | 200 | 22,278.41 | 26,154.41 | 512 | 13 | 0 | no ejecutada |
| inventory-deep-page | 200 | 56.66 | 73.05 | 10,448 | 11 | 0 | no ejecutada |
| inventory-adjustment | 50 | 111.62 | 288.22 | 315 | 39 | 0 | no ejecutada |
| public-catalog | 200 | 11,141.38 | 12,304.25 | 15,797,918 | 50 | 0 | no ejecutada |

La actividad de sesión se registra aparte como el delta de `pg_stat_user_tables.n_tup_upd` alrededor de 100 solicitudes autenticadas. El runner elimina al finalizar las citas, contactos, ajustes, movimientos y auditorías marcados por la ejecución, sin afectar otros tenants.

En esta primera pasada, las 50 creaciones de cita fallaron porque el runner utilizaba 09:00 UTC, equivalente a 04:00 en `America/Guayaquil`, fuera del horario configurado. Se corrigió a 14:00 UTC (09:00 local); ese escenario debe repetirse antes de declarar completa la línea base. La actividad de sesión produjo 0 actualizaciones para 100 solicitudes recientes (p95 21.96 ms, 177 bytes p95 y máximo de 4 consultas).
