export type InvitationStep =
  'choice' | 'invalid' | 'login' | 'register' | 'success' | 'verify';

const INVITATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,512}$/u;

export function invitationTokenFromSearch(token: string | null): string | null {
  return token && INVITATION_TOKEN_PATTERN.test(token) ? token : null;
}

export function initialInvitationStep(token: string | null): InvitationStep {
  return invitationTokenFromSearch(token) ? 'choice' : 'invalid';
}
