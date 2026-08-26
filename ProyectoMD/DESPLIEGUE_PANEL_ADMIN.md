# Despliegue del panel Admin de Nava

> Estado: desplegado y validado el 21 de agosto de 2026 en
> `https://admin.navacloud.app`.

## Registro de ejecución

- Commit desplegado: `0ead479`.
- Base Neon: 58 migraciones aplicadas; la última fue
  `20260821100000_subscription_billing_period_days`.
- Servicio: `nava-admin.service` activo y atendiendo localmente en el puerto
  `3001`.
- Publicación: Nginx y Certbot entregan `https://admin.navacloud.app` con
  respuesta `HTTP/2 200`.
- Acceso: bootstrap protegido con contraseña derivada mediante scrypt y OTP por
  correo. `PLATFORM_ADMIN_PASSWORD_HASH` debe comenzar por
  `scrypt$32768$8$1$`; no admite hashes bcrypt ni se pega en el formulario.

La plantilla systemd inicia el binario local de Next directamente. Así conserva
`ProtectHome=true` sin depender de la caché de Corepack/pnpm en `/home/nava`.

## Requisitos

- DNS y TLS para el dominio elegido, por ejemplo `admin.navacloud.app`.
- API y migraciones actualizadas, incluida `20260820190000_platform_operations_center`.
- `PLATFORM_ADMIN_EMAILS`, `PLATFORM_ADMIN_PASSWORD_HASH` y SMTP configurados en la API.
- `NEXT_PUBLIC_API_URL` con la URL pública HTTPS de la API durante el build del Admin.

Genere el hash bootstrap en una terminal interactiva y copie únicamente la salida
en el gestor de secretos:

```bash
pnpm --filter @barber-saas/api password:hash
```

El comando no muestra ni guarda la contraseña y genera el formato
`scrypt$32768$8$1$` exigido en producción.

La contraseña bootstrap del panel debe ser distinta a la contraseña de la
cuenta Nava que usa Mobile. Los operadores registrados también mantienen un hash
administrativo separado (`platform_operators.admin_password_hash`); después de
aplicar la migración, asígnelo desde la VPS sin imprimirlo:

```bash
pnpm --filter @barber-saas/api platform:operator:password -- operador@nava.ec
```

El comando exige una clave de 12 a 72 caracteres, pide confirmación y rechaza
una clave que coincida con la contraseña de Mobile. Los operadores existentes
no podrán acceder al panel hasta recibir esta credencial independiente.

## Preparación

Desde `/opt/nava/app`, después de revisar el commit que se va a publicar:

```bash
git pull --ff-only origin main
corepack enable
pnpm install --frozen-lockfile
pnpm db:migrate:deploy
pnpm db:status
NEXT_PUBLIC_API_URL=https://api.navacloud.app pnpm --filter @barber-saas/admin build
```

No usar `prisma migrate dev` ni modificar manualmente la base productiva.

## Servicio

1. Copiar `deploy/systemd/nava-admin.service.example` a `/etc/systemd/system/nava-admin.service`.
2. Verificar que `/usr/bin/node` y
   `apps/admin/node_modules/next/dist/bin/next` existan.
3. Ejecutar:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now nava-admin.service
sudo systemctl status nava-admin.service --no-pager
curl -fsS http://127.0.0.1:3001/ >/dev/null
```

## Nginx y TLS

Usar `deploy/nginx/nava-admin.conf.example` como base, instalarlo en el directorio de sitios de Nginx, validar con `nginx -t` y recargar. Las rutas de certificado del ejemplo deben existir antes de activar el sitio. En la VPS se emitió el certificado de `admin.navacloud.app` con Certbot; su renovación quedó programada automáticamente.

## Aceptación obligatoria

- Login con operador bootstrap y segundo factor OTP.
- Alta de un operador de soporte, acceso con su contraseña individual y verificación de que no puede suspender ni cambiar planes.
- Ficha 360° sin correo completo del propietario ni secretos PayPhone.
- Creación/seguimiento de incidencia, reconocimiento de alerta y reintento de notificación.
- Exportación CSV de auditoría y aparición de `platform.export.downloaded` en la bitácora.
- Revisión responsive y Axe en escritorio/móvil.
- Revisión de logs de API/Admin sin contraseñas, OTP, tokens ni secretos.

El despliegue quedó completado con URL, commit, migraciones, servicio y HTTPS
verificados. La aceptación funcional restante se limita a las comprobaciones de
roles, PII y flujos operativos enumeradas arriba cuando se incorporen operadores
adicionales.

## Actualización de Suscripciones — desplegada y validada operativamente

El Admin incorpora una sección **Suscripciones** para los roles `billing` y
`super_admin`. Consulta en tiempo real la suscripción vigente, la última
factura, el último intento de pago y movimientos recientes desde rutas internas
de la API. No expone URLs de cobro, referencias de proveedor ni secretos
PayPhone. El pull en la VPS y la comprobación de estados activos y otros estados
de suscripción se realizaron el 26 de agosto de 2026.

Comprobaciones realizadas o a conservar como regresión:

- [x] Login con `billing` o `super_admin`: aparece **Suscripciones** en el menú.
- [ ] Login con `support`, `operations` o `read_only`: la entrada no aparece y
      `GET /v1/platform/subscriptions` responde `403` si se intenta acceder.
- [x] Buscar una organización conocida y contrastar plan y estado con la ficha
      de Organización.
- [x] Afinar la tarjeta de suscripción activa para mostrar de forma inequívoca
      el inicio del período y su fecha de vencimiento.
- [ ] Verificar una factura pagada y un intento `APPLIED` contra el registro
      transaccional de la misma organización.
- [ ] Verificar una organización sin factura o sin intento: se muestra como
      ausencia de evidencia de cobro, no como pago confirmado.
- [ ] Confirmar que la pantalla no contiene URL de pago, token, StoreId,
      referencia de proveedor ni datos PayPhone sensibles.
- [ ] Revisar escritorio y móvil, y ejecutar Axe autenticado.

El build, typecheck y pruebas unitarias locales no sustituyen esta aceptación
contra PostgreSQL y credenciales reales. Al completarla, registrar aquí fecha,
commit desplegado, operador/rol de prueba y resultado de cada punto.

## Relación con suscripciones PayPhone

El panel Admin y la API comercial comparten la misma base PostgreSQL: el panel
puede consultar el estado de organizaciones, planes, facturas e incidencias,
pero no administra ni expone tokens PayPhone. La configuración de plataforma
(`PlatformPaymentConfiguration`) se aprovisiona exclusivamente desde la VPS con
el comando interactivo de la API y conserva el token cifrado. A 25 de agosto de
2026 existe configuración TEST aprovisionada; los cobros siguen deshabilitados
hasta configurar el origen verificable del webhook y superar una compra sandbox.
