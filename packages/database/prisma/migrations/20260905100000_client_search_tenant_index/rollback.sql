DROP INDEX IF EXISTS "clients_organization_full_name_trgm_idx";

-- btree_gin puede ser compartida por otros índices; no se elimina aquí.
