# Estrategia de pruebas

## Capas

- **Unitarias:** Vitest para paquetes compartidos y Jest Expo con Testing Library para React Native.
- **Integración:** Supabase local para migraciones, RLS, RPC y concurrencia desde la Fase 1.
- **End-to-end:** Playwright con viewport móvil y escritorio para la aplicación web.

## Comandos

```bash
pnpm test
pnpm test:e2e
pnpm exec supabase db lint --local --level warning
```

## Reglas

Las pruebas de reglas financieras y de agenda serán obligatorias al introducir esas funciones. Los casos de concurrencia y aislamiento no se sustituirán por mocks: se ejecutarán contra PostgreSQL/Supabase local.
