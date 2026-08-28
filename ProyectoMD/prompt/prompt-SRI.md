
## Estado de desarrollo — cupones de descuento para suscripciones

**Actualizado:** 2026-08-28

### Rama y aislamiento

- Trabajo aislado: `D:\Documentos\BarberiaSaas\.worktrees\subscription-discount-coupons`
- Rama: `feat/subscription-discount-coupons`
- Base: `main` en `21e8169`
- El cambio local existente en `main` (`ProyectoMD/prompt/prompt-SRI.md`) no se tocó desde el worktree.

### Diseño y plan aprobados

- Diseño: `docs/superpowers/specs/2026-08-28-subscription-discount-coupons-design.md`
- Plan: `docs/superpowers/plans/2026-08-28-subscription-discount-coupons.md`
- Alcance aprobado: cupones porcentuales de 1–99 %, un canje por cupón y organización, descuentos temporales con fecha fija, beneficios vitalicios revocados al concluir el período de gracia, administración/auditoría y compatibilidad con el precio fundador legado.

### Implementado y revisado

La **Tarea 1 — Persistencia y dominio de descuentos** está completa y aprobada por una revisión independiente.

- Commit: `7c9fd63 feat(billing): add subscription discount domain`
- Incluye los enums y modelos Prisma para cupón, planes aplicables, concesión y reserva; columnas opcionales de snapshot en la factura; migración y rollback; normalización de código; cálculo porcentual; y selección/reserva de descuento por organización.
- Verificaciones ejecutadas: validación y generación Prisma; 8 pruebas de dominio; regresión focalizada de fundador; typecheck de API.
- La base inicial también quedó verificada: 14 pruebas pasaron y 1 fue omitida en política/pagos de suscripción.
- Hallazgo menor pendiente para la revisión final: agregar cobertura directa de la rama que rechaza una reserva activa; la Tarea 2 la cubre desde el checkout PostgreSQL.

### Punto exacto de pausa

La **Tarea 2 — Checkout, factura y confirmación transaccional** fue preparada, pero se interrumpió antes de realizar cambios o commits.

Al reanudar, debe:

1. Integrar `resolveOrganizationDiscount` en `apps/api/src/subscription-payments.ts`.
2. Aplicar el descuento antes del desglose tributario y guardar snapshots inmutables en `SubscriptionInvoice`.
3. Crear la concesión solo al confirmarse el pago de PayPhone.
4. Liberar la reserva ante pago fallido, rechazado o vencido.
5. Mantener idempotencia, recibos, SRI y fundador legado sin cambios de contrato.
6. Ejecutar pruebas PostgreSQL de checkout, recibos y typecheck, luego revisión independiente.

No hay cambios sin commit en el worktree al momento de esta pausa. No se ejecutaron migraciones contra una base de datos ni pagos reales.

### Cómo reanudar

1. Entrar en `D:\Documentos\BarberiaSaas\.worktrees\subscription-discount-coupons`.
2. Confirmar que la rama sigue en `feat/subscription-discount-coupons` y que `git status --short --branch` está limpio.
3. Retomar desde la Tarea 2 del plan indicado, conservando la evidencia de pruebas y revisando cada tarea antes de iniciar la siguiente.
4. Al terminar todas las tareas y la revisión final, fusionar `feat/subscription-discount-coupons` hacia `main` mediante merge o pull request.
