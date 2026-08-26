ALTER TABLE "platform_operators"
  ADD COLUMN "admin_password_hash" TEXT,
  ADD COLUMN "admin_password_set_at" TIMESTAMPTZ(3);

-- Las contraseñas de la cuenta Nava no se copian a estas columnas. Cada
-- operador debe aprovisionar una credencial administrativa independiente.
