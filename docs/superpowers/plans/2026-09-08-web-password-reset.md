# Web Password Reset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send a selectable HTTPS recovery link and let users set a new password from `reservas.navacloud.app`.

**Architecture:** The API stays the token authority and emits the canonical HTTPS URL. Web adds a public reset form and a constrained Next.js proxy to the existing reset endpoint. Mobile retains support for the same HTTPS App Link.

**Tech Stack:** Fastify, Zod, Next.js App Router, React 19, Vitest, TypeScript.

**Spec:** `docs/superpowers/specs/2026-09-08-web-password-reset-design.md`

## Global Constraints

- Recovery links must be `https://reservas.navacloud.app/reset-password?token=<opaque-token>` in production.
- Tokens stay opaque, single-use, and valid for 30 minutes; never log or display them after browser initialization.
- Web uses existing `POST /v1/auth/reset-password`; no dependencies are added.
- Existing mobile HTTPS deep-link coverage remains green.

---

### Task 1: Canonical recovery URL configuration

**Files:**
- Modify: `apps/api/src/config.ts:69-74`
- Modify: `apps/api/src/config.test.ts`
- Modify: `.env.example:34-37`

**Interfaces:**
- Produces: `ApiConfig.MOBILE_RESET_URL`, an HTTPS URL ending in `/reset-password` by default and in production.
- Consumes: existing `readConfig(environment)`.

- [ ] **Step 1: Write the failing test**

```ts
it('uses the canonical HTTPS recovery URL by default', () => {
  expect(readConfig(baseEnvironment).MOBILE_RESET_URL).toBe(
    'https://reservas.navacloud.app/reset-password',
  );
});

it('rejects a non-HTTPS recovery URL in production', () => {
  expect(() =>
    readConfig({ ...productionEnvironment, MOBILE_RESET_URL: 'barbersaas://reset-password' }),
  ).toThrow('MOBILE_RESET_URL');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @barber-saas/api test -- config.test.ts`

Expected: FAIL because the default is `barbersaas://reset-password` and production permits it.

- [ ] **Step 3: Implement the minimal configuration change**

Set the default to `https://reservas.navacloud.app/reset-password`. In the production refinement, reject a URL unless it is HTTPS, has no credentials, uses exactly host `reservas.navacloud.app`, path `/reset-password`, and no query or hash. Update `.env.example` to the same URL and clarify that production places it in `/etc/nava/api.env`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @barber-saas/api test -- config.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add apps/api/src/config.ts apps/api/src/config.test.ts .env.example && git commit -m "fix(api): use HTTPS password recovery links"`

### Task 2: Reset-password API proxy for web

**Files:**
- Create: `apps/web/app/api/password-recovery/reset/route.ts`
- Create: `apps/web/app/api/password-recovery/reset/route.test.ts`

**Interfaces:**
- Consumes: browser JSON `{ password: string; token: string }`.
- Produces: upstream reset response status and JSON error body, or 204 on success.
- Depends on: `getWebApiBaseUrl()` from `apps/web/app/api-url.ts`.

- [ ] **Step 1: Write the failing tests**

```ts
it('forwards password and token to the API', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
  const response = await POST(request({ password: 'Clave-segura-123', token: 'x'.repeat(32) }));
  expect(response.status).toBe(204);
  expect(fetch).toHaveBeenCalledWith(
    new URL('v1/auth/reset-password', 'http://localhost:4000/'),
    expect.objectContaining({ method: 'POST' }),
  );
});
```

Add a 400 upstream response test that asserts its `{ code, message }` JSON reaches the browser.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @barber-saas/web test -- app/api/password-recovery/reset/route.test.ts`

Expected: FAIL because the route does not exist.

- [ ] **Step 3: Implement the constrained proxy**

Forward only `POST` to `new URL('v1/auth/reset-password', `${API_URL}/`)`, with the original JSON body and explicit JSON headers. Preserve upstream status and body; return `{ code: 'API_UNAVAILABLE', message: 'No pudimos conectar con Nava.' }` with 502 if fetch throws. Do not proxy a caller-provided path.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @barber-saas/web test -- app/api/password-recovery/reset/route.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add apps/web/app/api/password-recovery/reset && git commit -m "feat(web): proxy password reset requests"`

### Task 3: Browser reset-password form

**Files:**
- Create: `apps/web/app/reset-password/page.tsx`
- Create: `apps/web/app/reset-password/ResetPasswordLauncher.tsx`
- Create: `apps/web/app/reset-password/reset-password-flow.ts`
- Create: `apps/web/app/reset-password/reset-password-flow.test.ts`

**Interfaces:**
- Produces: `resetTokenFromSearch(token: string | null): string | null` accepting `[A-Za-z0-9_-]{32,512}` only.
- Produces: `passwordValidationError(password: string, confirmation: string): string | null`.
- Consumes: `POST /api/password-recovery/reset` with `{ password, token }`.

- [ ] **Step 1: Write the failing flow tests**

```ts
it('only accepts an opaque reset token from the URL', () => {
  expect(resetTokenFromSearch('x'.repeat(32))).toBe('x'.repeat(32));
  expect(resetTokenFromSearch('barbersaas://reset-password')).toBeNull();
  expect(resetTokenFromSearch(null)).toBeNull();
});

it('rejects different password confirmation', () => {
  expect(passwordValidationError('Clave-segura-123', 'Otra-clave-123')).toBe(
    'Las contraseñas no coinciden.',
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @barber-saas/web test -- app/reset-password/reset-password-flow.test.ts`

Expected: FAIL because the flow module does not exist.

- [ ] **Step 3: Implement page and launcher**

Render the client launcher inside `Suspense`. It reads `token` using `useSearchParams`, stores it once, immediately calls `window.history.replaceState` to remove it from the address bar, and displays a light-card form with password and confirmation fields (`autoComplete="new-password"`, `minLength={8}`). Invalid or absent token displays “Enlace no válido”. A successful 204 displays “Contraseña actualizada”; an API error displays its controlled message and keeps the form for retry. Reuse accept-invitation's visual structure without changing global styles.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @barber-saas/web test -- app/reset-password/reset-password-flow.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add apps/web/app/reset-password && git commit -m "feat(web): add password reset form"`

### Task 4: Cross-platform verification

**Files:**
- Verify: `apps/api/src/config.test.ts`
- Verify: `apps/web/app/api/password-recovery/reset/route.test.ts`
- Verify: `apps/web/app/reset-password/reset-password-flow.test.ts`
- Verify: `apps/mobile/src/lib/incoming-link.test.ts`

- [ ] **Step 1: Run focused suites**

Run:

```bash
pnpm --filter @barber-saas/api test -- config.test.ts
pnpm --filter @barber-saas/web test
pnpm --filter @barber-saas/mobile test -- incoming-link.test.ts
```

Expected: all targeted suites pass.

- [ ] **Step 2: Run type checks and web build**

Run:

```bash
pnpm --filter @barber-saas/api typecheck
pnpm --filter @barber-saas/web typecheck
pnpm --filter @barber-saas/web build
```

Expected: each command exits 0.

- [ ] **Step 3: Verify deployed behavior**

Run:

```bash
sudo grep '^MOBILE_RESET_URL=https://reservas.navacloud.app/reset-password$' /etc/nava/api.env
curl -fIs https://reservas.navacloud.app/reset-password
```

Request a recovery email and verify its URL starts with `https://reservas.navacloud.app/reset-password?token=` and that the web form completes the password update.
