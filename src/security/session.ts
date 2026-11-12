import { Request, Response, NextFunction } from 'express';
import { Role, UserItem } from '../types';

export interface SessionPayload {
  id: string;
  name: string;
  email: string;
  role: Role;
  expiresAt: number;
}

const SESSION_SECRET = process.env.SESSION_SECRET || 'sriwedari-keraton-surakarta-secret-2026-production-grade';

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
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

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

async function getHmacKey(): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(SESSION_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function createSessionToken(user: UserItem): Promise<string> {
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
  const payload: SessionPayload = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    expiresAt,
  };

  const jsonStr = JSON.stringify(payload);
  const payloadBytes = textEncoder.encode(jsonStr);
  const base64Payload = base64UrlEncode(payloadBytes);

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

    const payloadBytes = base64UrlDecode(base64Payload);
    const jsonStr = textDecoder.decode(payloadBytes);
    const payload: SessionPayload = JSON.parse(jsonStr);

    if (!payload.expiresAt || Date.now() > payload.expiresAt) return null;

    return payload;
  } catch {
    return null;
  }
}

// ==========================================
// SECURE PASSWORD HASHING (PBKDF2 SHA-256)
// ==========================================
export async function hashPassword(plainText: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(plainText),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const derived = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );
  const hashHex = Array.from(new Uint8Array(derived)).map(b => b.toString(16).padStart(2, '0')).join('');
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
  const salt = new Uint8Array(saltMatches.map(byte => parseInt(byte, 16)));

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(plainText),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const derived = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );
  const derivedHex = Array.from(new Uint8Array(derived)).map(b => b.toString(16).padStart(2, '0')).join('');
  return derivedHex === originalHashHex;
}

// ==========================================
// EXPRESS SESSION & RBAC MIDDLEWARE
// ==========================================
export async function getSessionFromReq(req: Request): Promise<SessionPayload | null> {
  let token: string | undefined;

  // Check Authorization Bearer Header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  }

  // Check Cookie: sriwedari_session
  if (!token && (req as any).cookies?.sriwedari_session) {
    token = (req as any).cookies.sriwedari_session;
  }

  // Fallback: parse raw Cookie header if cookie-parser didn't run
  if (!token && req.headers.cookie) {
    const match = req.headers.cookie.match(/sriwedari_session=([^;]+)/);
    if (match) token = match[1];
  }

  if (!token) return null;
  return await verifySessionToken(token);
}

export function requireAuth(requiredRole?: Role) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const session = await getSessionFromReq(req);
    if (!session) {
      return res.status(401).json({
        success: false,
        error: 'Akses ditolak. Sesi autentikasi diperlukan.',
      });
    }

    if (requiredRole && session.role !== requiredRole && session.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Akses ditolak. Anda tidak memiliki wewenang untuk tindakan ini.',
      });
    }

    (req as any).user = session;
    next();
  };
}
