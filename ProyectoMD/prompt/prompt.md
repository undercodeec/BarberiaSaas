Quiero que actualices el procedimiento oficial de despliegue de Nava para evitar que vuelva a ocurrir una desincronización entre `schema.prisma` y el Prisma Client generado.

## Problema que ocurrió

Durante un despliegue en producción:

* `pnpm db:migrate:deploy` aplicó correctamente las migraciones.
* `pnpm db:status` confirmó que PostgreSQL estaba actualizado.
* `schema.prisma` contenía nuevos enums:

  * `SubscriptionDiscountGrantStatus`
  * `SubscriptionPaymentReceiptDeliveryStatus`
* Pero el Prisma Client generado en `packages/database/src/generated/prisma` estaba desactualizado.
* Como consecuencia, `pnpm build:production` falló con errores del tipo:

```text
No matching export in "../../packages/database/src/index.ts"
for import "SubscriptionDiscountGrantStatus"

No matching export in "../../packages/database/src/index.ts"
for import "SubscriptionPaymentReceiptDeliveryStatus"
```

El problema se solucionó ejecutando:

```bash
pnpm --filter @barber-saas/database exec prisma generate
```

Después de eso:

```bash
pnpm --filter @barber-saas/api build
pnpm build:production
```

compilaron correctamente.

## Regla obligatoria nueva

A partir de ahora, TODO despliegue en VPS debe regenerar explícitamente Prisma Client después de actualizar dependencias y antes de comprobar/aplicar migraciones y antes del build.

El flujo canónico debe quedar conceptualmente así:

```bash
cd /opt/nava/app

git status --short
git pull --ff-only origin main

pnpm install --frozen-lockfile

pnpm --filter @barber-saas/database exec prisma generate

pnpm db:status

# SOLO si db:status informa migraciones pendientes:
pnpm db:migrate:deploy
pnpm db:status

pnpm env:check:production
pnpm build:production

sudo systemctl daemon-reload
sudo systemctl restart nava-api
sudo systemctl restart nava-web
sudo systemctl restart nava-admin
```

## Reglas de seguridad que debes conservar

1. `prisma generate` NO reemplaza `prisma migrate deploy`.
2. `prisma generate` regenera código del Prisma Client y no debe interpretarse como una modificación de PostgreSQL.
3. `pnpm db:migrate:deploy` solamente se ejecutará si `pnpm db:status` informa migraciones pendientes.
4. Nunca usar `prisma migrate dev` en producción.
5. Nunca usar `source /etc/nava/api.env`.
6. No crear `.env.production` como mecanismo productivo si el runbook vigente indica que systemd administra las variables.
7. No reiniciar ningún servicio si `pnpm build:production` falla.
8. Un build de API fallido puede haber limpiado `apps/api/dist` antes de fallar. Por tanto, ante un fallo de build, NO reiniciar `nava-api`.
9. Antes de reiniciar la API debe existir:

```bash
test -f apps/api/dist/index.js
```

10. El reinicio de los servicios solamente puede hacerse después de que `pnpm build:production` termine exitosamente.

## Mejora preventiva

Revisa el repositorio y determina si es conveniente incorporar `prisma generate` dentro de un script canónico de despliegue o preparación del build para que el operador no dependa de recordarlo manualmente.

La solución debe evitar regeneraciones innecesariamente peligrosas, pero `prisma generate` debe ejecutarse siempre que pueda haber cambiado:

* `packages/database/prisma/schema.prisma`;
* la versión de Prisma;
* el código generado;
* las migraciones relacionadas con modelos/enums;
* o después de actualizar el repositorio en una VPS antes del build.

No introduzcas una actualización de Prisma como parte de este cambio. Mantén las versiones actualmente fijadas en el proyecto.

## Documentación

Actualiza:

```text
ProyectoMD/ESTADO_PROYECTO.md
```

en la sección vigente de:

```text
REGLAS DE DESPLIEGUE — NO REGRESIONAR
```

para que `prisma generate` sea un paso obligatorio y quede documentado también el incidente que originó esta regla.

Debe quedar explícitamente documentado que:

```text
Migraciones aplicadas correctamente ≠ Prisma Client actualizado
```

y que es posible tener:

```text
PostgreSQL actualizado
schema.prisma actualizado
Prisma Client generado desactualizado
```

## Validación

Después de implementar el cambio, ejecuta las validaciones apropiadas del repositorio y verifica como mínimo que:

```bash
pnpm --filter @barber-saas/database exec prisma generate
pnpm --filter @barber-saas/api build
```

terminen correctamente.

Si existe un script productivo que pueda modificarse de manera segura para incorporar esta protección automáticamente, hazlo y valida también:

```bash
pnpm build:production
```

No modifiques migraciones ya aplicadas.
No crees migraciones nuevas para resolver este problema.
No alteres datos de producción.
No actualices Prisma a una versión mayor.
No hagas cambios manuales en la VPS.

Al finalizar, explícame:

* qué archivos modificaste;
* dónde quedó establecida la nueva regla;
* si automatizaste `prisma generate`;
* qué validaciones ejecutaste;
* y cuál será a partir de ahora el procedimiento canónico de despliegue.
