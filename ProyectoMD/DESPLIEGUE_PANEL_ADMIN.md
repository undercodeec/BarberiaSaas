# Despliegue del panel Admin de Nava

> Estado: procedimiento preparado, todavía no ejecutado ni validado en la VPS.

## Requisitos

- DNS y TLS para el dominio elegido, por ejemplo `admin.navacloud.app`.
- API y migraciones actualizadas, incluida `20260820190000_platform_operations_center`.
- `PLATFORM_ADMIN_EMAILS`, `PLATFORM_ADMIN_PASSWORD_HASH` y SMTP configurados en la API.
- `NEXT_PUBLIC_API_URL` con la URL pública HTTPS de la API durante el build del Admin.

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
2. Verificar usuario, grupo, rutas y ubicación de `pnpm` con `command -v pnpm`.
3. Ejecutar:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now nava-admin.service
sudo systemctl status nava-admin.service --no-pager
curl -fsS http://127.0.0.1:3001/ >/dev/null
```

## Nginx y TLS

Usar `deploy/nginx/nava-admin.conf.example` como base, instalarlo en el directorio de sitios de Nginx, validar con `nginx -t` y recargar. Las rutas de certificado del ejemplo deben existir antes de activar el sitio.

## Aceptación obligatoria

- Login con operador bootstrap y segundo factor OTP.
- Alta de un operador de soporte, acceso con su contraseña individual y verificación de que no puede suspender ni cambiar planes.
- Ficha 360° sin correo completo del propietario ni secretos PayPhone.
- Creación/seguimiento de incidencia, reconocimiento de alerta y reintento de notificación.
- Exportación CSV de auditoría y aparición de `platform.export.downloaded` en la bitácora.
- Revisión responsive y Axe en escritorio/móvil.
- Revisión de logs de API/Admin sin contraseñas, OTP, tokens ni secretos.

El despliegue solo se marca completado después de registrar URL, commit, migraciones aplicadas y evidencia del recorrido autenticado.
