import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomInt,
  scrypt,
  timingSafeEqual,
} from 'node:crypto';

const KEY_LENGTH = 64;
const SCRYPT_COST = 16_384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      KEY_LENGTH,
      {
        N: SCRYPT_COST,
        maxmem: 64 * 1024 * 1024,
        p: SCRYPT_PARALLELIZATION,
        r: SCRYPT_BLOCK_SIZE,
      },
      (error, key) => {
        if (error) reject(error);
        else resolve(key);
      },
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await deriveKey(password, salt);
  return [
    'scrypt',
    SCRYPT_COST,
    SCRYPT_BLOCK_SIZE,
    SCRYPT_PARALLELIZATION,
    salt.toString('base64url'),
    key.toString('base64url'),
  ].join('$');
}

export async function verifyPassword(
  password: string,
  encodedHash: string,
): Promise<boolean> {
  const [algorithm, cost, blockSize, parallelization, saltValue, keyValue] =
    encodedHash.split('$');
  if (
    algorithm !== 'scrypt' ||
    cost !== String(SCRYPT_COST) ||
    blockSize !== String(SCRYPT_BLOCK_SIZE) ||
    parallelization !== String(SCRYPT_PARALLELIZATION) ||
    !saltValue ||
    !keyValue
  ) {
    return false;
  }

  const expectedKey = Buffer.from(keyValue, 'base64url');
  const actualKey = await deriveKey(
    password,
    Buffer.from(saltValue, 'base64url'),
  );
  return (
    expectedKey.length === actualKey.length &&
    timingSafeEqual(expectedKey, actualKey)
  );
}

export function createOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

export function createVerificationCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function paymentCredentialsKey(encodedKey: string): Buffer {
  const key = Buffer.from(encodedKey, 'base64');
  if (key.length !== 32)
    throw new Error(
      'PAYPHONE_CREDENTIALS_ENCRYPTION_KEY debe codificar exactamente 32 bytes.',
    );
  return key;
}

function platformPaymentCredentialsKey(encodedKey: string): Buffer {
  const key = Buffer.from(encodedKey, 'base64');
  if (key.length !== 32)
    throw new Error(
      'PLATFORM_PAYPHONE_CREDENTIALS_ENCRYPTION_KEY debe codificar exactamente 32 bytes.',
    );
  return key;
}

const PLATFORM_PAYMENT_CREDENTIAL_AAD = 'nava:platform:payphone:v1';

/** Cifra secretos de un comercio y los liga criptograficamente a su organizacion. */
export function encryptPaymentCredential({
  organizationId,
  secret,
  encodedKey,
}: {
  readonly encodedKey: string;
  readonly organizationId: string;
  readonly secret: string;
}): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    'aes-256-gcm',
    paymentCredentialsKey(encodedKey),
    iv,
  );
  cipher.setAAD(Buffer.from(organizationId));
  const encrypted = Buffer.concat([
    cipher.update(secret, 'utf8'),
    cipher.final(),
  ]);
  return [
    'v1',
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
}

export function decryptPaymentCredential({
  organizationId,
  encryptedSecret,
  encodedKey,
}: {
  readonly encodedKey: string;
  readonly encryptedSecret: string;
  readonly organizationId: string;
}): string {
  const [version, ivValue, tagValue, value] = encryptedSecret.split('.');
  if (version !== 'v1' || !ivValue || !tagValue || !value)
    throw new Error('El formato de la credencial cifrada no es valido.');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    paymentCredentialsKey(encodedKey),
    Buffer.from(ivValue, 'base64url'),
  );
  decipher.setAAD(Buffer.from(organizationId));
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(value, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

/** Cifra el secreto de la cuenta PayPhone propiedad de Nava, aislado de tenants. */
export function encryptPlatformPaymentCredential({
  secret,
  encodedKey,
}: {
  readonly encodedKey: string;
  readonly secret: string;
}): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    'aes-256-gcm',
    platformPaymentCredentialsKey(encodedKey),
    iv,
  );
  cipher.setAAD(Buffer.from(PLATFORM_PAYMENT_CREDENTIAL_AAD));
  const encrypted = Buffer.concat([
    cipher.update(secret, 'utf8'),
    cipher.final(),
  ]);
  return [
    'v1',
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
}

export function decryptPlatformPaymentCredential({
  encryptedSecret,
  encodedKey,
}: {
  readonly encodedKey: string;
  readonly encryptedSecret: string;
}): string {
  const [version, ivValue, tagValue, value] = encryptedSecret.split('.');
  if (version !== 'v1' || !ivValue || !tagValue || !value)
    throw new Error('El formato de la credencial cifrada no es valido.');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    platformPaymentCredentialsKey(encodedKey),
    Buffer.from(ivValue, 'base64url'),
  );
  decipher.setAAD(Buffer.from(PLATFORM_PAYMENT_CREDENTIAL_AAD));
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(value, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
