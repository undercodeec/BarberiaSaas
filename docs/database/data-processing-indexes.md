# Índices para procesamiento escalable

La migración `20260904150000_data_processing_indexes` añade `pg_trgm` y nueve índices que respaldan los recorridos por cursor, búsquedas e inventario de las rutas v2. La migración aditiva `20260905100000_client_search_tenant_index` añade `btree_gin` y el índice compuesto de búsqueda por tenant. Ninguna modifica datos ni elimina índices existentes.

## Operación

`CREATE INDEX` sin `CONCURRENTLY` puede adquirir bloqueos breves de escritura sobre su tabla. Debe ejecutarse primero en una copia local o de ensayo con el tamaño de producción y mediante `node scripts/test-database-env.mjs` cuando se trabaje localmente. En el fixture local de 100.000 clientes, crear y eliminar un B-tree temporal equivalente al cursor de clientes tomó 263 ms de pared el 2026-09-04; esa cifra incluye la invocación local de Docker y no es una promesa para producción.

Antes de un despliegue productivo se debe registrar el tiempo de cada sentencia con un fixture de al menos 100.000 filas. Si esa duración o el bloqueo no es aceptable, dividir los índices en una migración operativa con `CREATE INDEX CONCURRENTLY`, ejecutada fuera de una transacción, conservando exactamente los mismos nombres y la prueba de objetos.

## Estado parcial y rollback

Las sentencias son independientes: si la migración se interrumpe, consultar `pg_indexes` y aplicar únicamente las sentencias que falten. Cada `rollback.sql` elimina únicamente los índices de su migración y no elimina `pg_trgm` ni `btree_gin`, porque las extensiones pueden ser compartidas por otros objetos.

| Objeto | Uso | Rollback |
| --- | --- | --- |
| `clients_active_name_cursor_idx` | Paginación de clientes activos | `DROP INDEX` del objeto |
| `clients_*_trgm_idx` | Búsqueda por nombre, teléfono y correo | `DROP INDEX` del objeto |
| `clients_organization_full_name_trgm_idx` | Búsqueda de nombre acotada por tenant | `DROP INDEX` del objeto |
| `clients_phone_digits_idx` | Dedupe de importación por teléfono | `DROP INDEX` del objeto |
| `appointments_location_starts_cursor_idx` | Agenda por cursor | `DROP INDEX` del objeto |
| `products_*` | Catálogo e inventario | `DROP INDEX` del objeto |
| `stock_movements_location_created_cursor_idx` | Historial de movimientos | `DROP INDEX` del objeto |
