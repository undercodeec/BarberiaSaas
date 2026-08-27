# Web Invitation Acceptance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a collaborator register or sign in, verify their email, and accept a team invitation entirely from the web.

**Architecture:** A minimal API registration endpoint creates a pending verified account without business details. A dedicated Next.js proxy keeps its session token in an HTTP-only invitation cookie. The public invitation page replaces custom-scheme launching with web authentication, acceptance, and post-acceptance mobile-install guidance.

**Tech Stack:** Fastify, Prisma, Zod, Next.js App Router, React, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-26-web-invitation-acceptance-design.md`

## Global Constraints

- Never create a business, location, or registration profile for an invited user.
- The API endpoint `POST /v1/team/invitations/accept` remains the sole authority for accepting an invitation.
- Keep bearer tokens out of browser JavaScript with an HTTP-only cookie scoped to `/api/invitations`.
- Preserve current mobile deep-link handling.

---

### Task 1: Invitation-only API registration

**Files:**

- Modify: `packages/validation/src/index.ts`
- Modify: `apps/api/src/app.ts`
- Test: `packages/validation/src/index.test.ts`
- Test: `apps/api/src/app.integration.test.ts`

**Interfaces:**

- Produces `invitationSignUpSchema` / `InvitationSignUpInput`.
- Produces `POST /v1/auth/invitation-register` accepting `token`, `fullName`, `email`, `password`, `confirmPassword`, `privacyPolicyAccepted`.

- [x] **Step 1: Write the failing validation and API tests**

```ts
expect(
  invitationSignUpSchema.safeParse({
    confirmPassword: 'NavaSecure123!',
    email: 'invitee@example.com',
    fullName: 'Persona Invitada',
    password: 'NavaSecure123!',
    privacyPolicyAccepted: true,
    token: 'x'.repeat(32),
  }).success,
).toBe(true);
```

Add an API integration scenario: create a team invitation; register its exact email via `/v1/auth/invitation-register`; verify it with `/v1/auth/verify-email`; accept with `/v1/team/invitations/accept`; assert the user lacks `userRegistrationProfile` and has an active membership. Add a different-email registration case expecting `400 INVALID_INVITATION`.

- [x] **Step 2: Run tests to verify RED**

Run: `pnpm --filter @barber-saas/validation test -- index.test.ts` and `pnpm --filter @barber-saas/api test -- app.integration.test.ts`

Expected: FAIL because the schema and route do not exist.

- [x] **Step 3: Implement the smallest route**

Define the schema with required privacy acceptance and matching passwords. In the route, apply `AUTH_REGISTER_RATE_LIMIT_MAX`, normalize email, find a pending unexpired invitation matching both `hashOpaqueToken(token)` and email, then call `issueVerificationCode` without `registrationProfile`. Return the same safe verification response as normal registration.

- [x] **Step 4: Run tests to verify GREEN**

Run: `pnpm --filter @barber-saas/validation test -- index.test.ts` and `pnpm --filter @barber-saas/api test -- app.integration.test.ts`

Expected: PASS.

### Task 2: Invitation session proxy

**Files:**

- Create: `apps/web/app/api/invitations/[...path]/route.ts`
- Test: `apps/web/app/api/invitations/[...path]/route.test.ts`

**Interfaces:**

- Produces POST-only routes: `auth/login`, `auth/invitation-register`, `auth/verify-email`, `accept`, `auth/logout`.
- Stores API sessions in `nava_invitation_session`.

- [x] **Step 1: Write the failing proxy tests**

Mock upstream fetch. Assert successful login removes `session.token` from JSON and sets an HTTP-only cookie; assert `accept` forwards `Authorization: Bearer <cookie>`; assert no cookie returns `401`; assert logout deletes the cookie.

- [x] **Step 2: Run test to verify RED**

Run: `pnpm --filter @barber-saas/web test -- route.test.ts`

Expected: FAIL because the route module does not exist.

- [x] **Step 3: Implement an allowlisted proxy**

Use this mapping:

```ts
const routes = {
  'auth/login': 'v1/auth/login',
  'auth/invitation-register': 'v1/auth/invitation-register',
  'auth/verify-email': 'v1/auth/verify-email',
  accept: 'v1/team/invitations/accept',
  'auth/logout': 'v1/auth/logout',
} as const;
```

Store login and verification sessions with `httpOnly: true`, `sameSite: 'lax'`, `secure: production`, and `path: '/api/invitations'`. Strip token from returned JSON. Require the cookie for `accept` and logout.

- [x] **Step 4: Run test to verify GREEN**

Run: `pnpm --filter @barber-saas/web test -- route.test.ts`

Expected: PASS.

### Task 3: Web acceptance page

**Files:**

- Modify: `apps/web/app/accept-invitation/InvitationLauncher.tsx`
- Test: `apps/web/app/accept-invitation/invitation-flow.test.ts`

**Interfaces:**

- Consumes `/api/invitations/*`.
- Reads opaque invitation token using `useSearchParams`.
- Produces states `invalid`, `login`, `register`, `verify`, `accepting`, `success`, `error`.

- [x] **Step 1: Write failing flow tests**

Validate the token boundary and initial web state in a dependency-free flow helper. The page behavior is covered by Next.js typecheck and production build because this application has no React DOM testing harness.

- [x] **Step 2: Run test to verify RED**

Run: `pnpm --filter @barber-saas/web test -- invitation-flow.test.ts`

Expected: FAIL because the current component only launches the mobile scheme.

- [x] **Step 3: Implement the stateful UI**

Keep the token in component memory and call `history.replaceState` after it is read. Add forms for login and minimal registration. After registration show six-digit verification, then post acceptance. On success, show the install Nava instruction and same-email login reminder; do not redirect to a mobile scheme.

- [x] **Step 4: Run test to verify GREEN**

Run: `pnpm --filter @barber-saas/web test -- invitation-flow.test.ts`

Expected: PASS.

### Task 4: Verification and handoff

**Files:**

- Modify: `docs/superpowers/specs/2026-08-26-web-invitation-acceptance-design.md`

- [x] **Step 1: Run final affected verification**

```bash
pnpm --filter @barber-saas/validation test
pnpm --filter @barber-saas/api test
pnpm --filter @barber-saas/api typecheck
pnpm --filter @barber-saas/web test
pnpm --filter @barber-saas/web typecheck
pnpm --filter @barber-saas/web build
```

- [x] **Step 2: Add the VPS acceptance checklist**

Record manual checks for an existing account, a newly verified account, mismatched email, expired invitation, and success confirmation on desktop without Nava installed.

- [x] **Step 3: Commit the feature**

```bash
git add apps/api/src/app.ts apps/api/src/app.integration.test.ts packages/validation/src apps/web/app/api/invitations apps/web/app/accept-invitation docs/superpowers/specs/2026-08-26-web-invitation-acceptance-design.md docs/superpowers/plans/2026-08-27-web-invitation-acceptance.md
git commit -m "feat(web): aceptar invitaciones desde navegador"
```
