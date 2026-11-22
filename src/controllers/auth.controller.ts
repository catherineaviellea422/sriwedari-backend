import { Request, Response } from 'express';
import { ServerDB } from '../db';
import { createSessionToken, hashPassword, verifyPassword } from '../lib/crypto';
import { getSessionFromReq } from '../middleware/auth';
import { env } from '../config/env';
import { Role, UserItem } from '../types/models';

export async function login(req: Request, res: Response, forcedRole?: Role) {
  try {
    const { email, password, role } = req.body;
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanPassword = (password || '').trim();
    const targetRole: Role | undefined = forcedRole || role;

    if (!cleanEmail || !cleanPassword) {
      return res.status(400).json({ success: false, error: 'Email dan kata sandi wajib diisi.' });
    }

    let user: UserItem | undefined;
    if (targetRole === 'admin') {
      const admins = ServerDB.getAdminAccounts();
      user = admins.find((u) => u.email.toLowerCase() === cleanEmail);
      if (!user && ['admin', 'admin@sriwedari.id', 'admin@galerisriwedari.id'].includes(cleanEmail)) {
        user = admins[0];
      }
    } else if (targetRole === 'user') {
      const users = ServerDB.getUserAccounts();
      user = users.find((u) => u.email.toLowerCase() === cleanEmail);
      if (!user && ['tamu', 'user', 'tamu@sriwedari.id'].includes(cleanEmail)) {
        user = users[0];
      }
    } else {
      const allUsers = ServerDB.getUsers();
      user = allUsers.find((u) => u.email.toLowerCase() === cleanEmail);
      if (!user) {
        if (['admin', 'admin@sriwedari.id', 'admin@galerisriwedari.id'].includes(cleanEmail)) {
          user = allUsers.find((u) => u.role === 'admin');
        } else if (['tamu', 'user', 'tamu@sriwedari.id'].includes(cleanEmail)) {
          user = allUsers.find((u) => u.role === 'user');
        }
      }
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        error:
          targetRole === 'admin'
            ? 'Kredensial tidak cocok di basis data Kurator/Admin.'
            : 'Kredensial tidak cocok. Pengguna dengan email ini tidak terdaftar.',
      });
    }

    if (targetRole && user.role !== targetRole) {
      return res.status(403).json({
        success: false,
        error:
          targetRole === 'admin'
            ? 'Akses ditolak. Akun ini tidak memiliki wewenang Kurator / Administrator.'
            : 'Akun kurator harus masuk melalui gerbang Admin.',
      });
    }

    const isMatch = await verifyPassword(cleanPassword, user.password || '');
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Kata sandi tidak sesuai.' });
    }

    if (user.password && !user.password.startsWith('pbkdf2:')) {
      user.password = await hashPassword(cleanPassword);
      ServerDB.saveUser(user);
    }

    if (user.status !== 'active') {
      return res.status(403).json({ success: false, error: 'Akun dinonaktifkan oleh administrator.' });
    }

    const token = await createSessionToken(user);
    const safeUser = { ...user };
    delete safeUser.password;

    res.cookie('sriwedari_session', token, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    ServerDB.logAudit(
      'UPDATE_SETTINGS',
      `Sesi login untuk ${user.email} (${user.role.toUpperCase()})`,
      'info',
      user.name,
      user.role === 'admin' ? 'Admin' : 'User'
    );

    return res.json({
      success: true,
      user: safeUser,
      token,
      dbScope: user.role === 'admin' ? 'sriwedari-admin-db' : 'sriwedari-user-db',
      message: `Sugeng rawuh, ${user.name}! Sesi berhasil dibuat.`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Terjadi kesalahan server.';
    return res.status(500).json({ success: false, error: message });
  }
}

export async function register(req: Request, res: Response) {
  try {
    const { name, email, phone, password } = req.body;
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanPassword = (password || '').trim();
    const cleanName = (name || '').trim();

    if (!cleanName || !cleanEmail || !cleanPassword) {
      return res.status(400).json({
        success: false,
        error: 'Nama lengkap, email, dan kata sandi wajib diisi.',
      });
    }

    if (ServerDB.getUsers().some((u) => u.email.toLowerCase() === cleanEmail)) {
      return res.status(409).json({ success: false, error: 'Alamat email sudah terdaftar.' });
    }

    const hashedPassword = await hashPassword(cleanPassword);
    const newUser: UserItem = {
      id: `usr-${Date.now()}`,
      name: cleanName,
      email: cleanEmail,
      phone: (phone || '').trim(),
      role: 'user',
      status: 'active',
      points: 50,
      registeredAt: new Date().toISOString().split('T')[0],
      password: hashedPassword,
    };

    ServerDB.saveUser(newUser);
    const token = await createSessionToken(newUser);
    const safeUser = { ...newUser };
    delete safeUser.password;

    res.cookie('sriwedari_session', token, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(201).json({
      success: true,
      user: safeUser,
      token,
      dbScope: 'sriwedari-user-db',
      message: 'Registrasi berhasil! Akun Anda aktif dengan bonus 50 poin budaya.',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Gagal mendaftarkan akun.';
    return res.status(500).json({ success: false, error: message });
  }
}

export async function me(req: Request, res: Response, requiredRole?: Role) {
  const session = await getSessionFromReq(req);
  if (!session) {
    return res.status(401).json({ success: false, error: 'Belum ada sesi aktif.' });
  }
  if (requiredRole && session.role !== requiredRole) {
    return res.status(403).json({ success: false, error: 'Sesi tidak sesuai dengan peran yang diminta.' });
  }

  const user = ServerDB.getUserById(session.id, session.role);
  if (!user || user.status !== 'active') {
    return res.status(401).json({ success: false, error: 'Sesi tidak lagi valid.' });
  }

  const safeUser = { ...user };
  delete safeUser.password;
  return res.json({ success: true, user: safeUser });
}

export function logout(_req: Request, res: Response) {
  res.clearCookie('sriwedari_session', { path: '/' });
  return res.json({ success: true, message: 'Sesi logout berhasil.' });
}

export async function forgotPassword(req: Request, res: Response) {
  const identifier = (req.body.identifier || req.body.email || '').trim();
  if (!identifier) {
    return res.status(400).json({ success: false, error: 'Email atau nomor WhatsApp wajib diisi.' });
  }
  const result = ServerDB.requestPasswordReset(identifier);
  return res.json({
    success: true,
    found: result.found,
    message: result.message,
    ...(env.NODE_ENV !== 'production' && result.code ? { resetCode: result.code } : {}),
  });
}

export async function resetPassword(req: Request, res: Response) {
  const { identifier, email, code, newPassword } = req.body;
  const target = (identifier || email || '').trim();
  const cleanCode = (code || '').trim();
  const cleanPass = (newPassword || '').trim();

  if (!target || !cleanCode || cleanPass.length < 6) {
    return res.status(400).json({
      success: false,
      error: 'Identifier, kode pemulihan, dan kata sandi baru (minimal 6 karakter) wajib diisi.',
    });
  }

  const hashed = await hashPassword(cleanPass);
  const result = ServerDB.confirmPasswordReset(target, cleanCode, hashed);
  if (!result.success) {
    return res.status(400).json(result);
  }
  return res.json(result);
}
