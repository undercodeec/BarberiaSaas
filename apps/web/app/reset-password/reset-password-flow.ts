const OPAQUE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,512}$/u;

export function resetTokenFromSearch(token: string | null): string | null {
  return token && OPAQUE_TOKEN_PATTERN.test(token) ? token : null;
}

export function passwordValidationError(
  password: string,
  confirmation: string,
): string | null {
  if (password.length < 12)
    return 'La nueva contraseña debe tener al menos 12 caracteres.';
  if (password.length > 72)
    return 'La nueva contraseña debe tener máximo 72 caracteres.';
  if (password !== confirmation) return 'Las contraseñas no coinciden.';
  return null;
}
