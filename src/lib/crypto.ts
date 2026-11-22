import { env } from '../config/env';
import { SessionPayload, UserItem } from '../types/models';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str: string): Uint8Array {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function getHmacKey(): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(env.SESSION_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function createSessionToken(user: UserItem): Promise<string> {
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const payload: SessionPayload = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    expiresAt,
  };
  const base64Payload = base64UrlEncode(textEncoder.encode(JSON.stringify(payload)));
  const key = await getHmacKey();
  const signatureBytes = await crypto.subtle.sign('HMAC', key, textEncoder.encode(base64Payload));
  const base64Signature = base64UrlEncode(new Uint8Array(signatureBytes));
  return `${base64Payload}.${base64Signature}`;
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 2) return null;

    const [base64Payload, sigPart] = parts;
    const key = await getHmacKey();
    const sigBytes = base64UrlDecode(sigPart);

    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes as unknown as BufferSource,
      textEncoder.encode(base64Payload)
    );
    if (!isValid) return null;

    const payload: SessionPayload = JSON.parse(textDecoder.decode(base64UrlDecode(base64Payload)));
    if (!payload.expiresAt || Date.now() > payload.expiresAt) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function hashPassword(plainText: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltHex = Array.from(salt)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(plainText),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  const hashHex = Array.from(new Uint8Array(derived))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `pbkdf2:100000:${saltHex}:${hashHex}`;
}

export async function verifyPassword(plainText: string, storedHash: string): Promise<boolean> {
  if (!storedHash) return false;
  if (!storedHash.startsWith('pbkdf2:')) {
    return plainText === storedHash;
  }
  const parts = storedHash.split(':');
  if (parts.length !== 4) return false;
  const iterations = parseInt(parts[1], 10);
  const saltHex = parts[2];
  const originalHashHex = parts[3];

  const saltMatches = saltHex.match(/.{1,2}/g);
  if (!saltMatches) return false;
  const salt = new Uint8Array(saltMatches.map((byte) => parseInt(byte, 16)));

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(plainText),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  const derivedHex = Array.from(new Uint8Array(derived))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return derivedHex === originalHashHex;
}
