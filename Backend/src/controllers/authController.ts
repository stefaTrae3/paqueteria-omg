import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Response } from 'express';
import { LoginRequest, LoginResponse, Usuario } from '../types';
import { models as defaultModels } from '../db/sequelize';
import { generateAccessToken, createRefreshToken, verifyRefreshTokenPayload, createPasswordResetToken, verifyPasswordResetToken, createEmailVerificationToken, verifyEmailVerificationToken } from '../utils/jwt';

// Ventana y políticas anti-bruteforce (por email)
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutos
const LOGIN_MAX_ATTEMPTS = 10; // intentos permitidos por ventana
const LOGIN_BLOCK_MS = 30 * 60 * 1000; // bloqueo 30 minutos
const loginAttempts = new Map<string, { count: number; first: number; blockedUntil?: number }>();

export class AuthController {
  private UserModel: any;
  private RefreshTokenModel: any;
  private PasswordResetTokenModel: any;
  private EmailVerificationTokenModel: any;

  constructor(_models?: any) {
    const mdl = _models || defaultModels;
    this.UserModel = mdl.User;
    this.RefreshTokenModel = mdl.RefreshToken;
    this.PasswordResetTokenModel = mdl.PasswordResetToken;
    this.EmailVerificationTokenModel = mdl.EmailVerificationToken;
  }

  async login(req: any, res: Response) {
    try {
      const { email, password } = req.body as LoginRequest;

      // Bloqueo temporal por múltiples intentos fallidos
      const now = Date.now();
      const rec = loginAttempts.get(email);
      if (rec?.blockedUntil && now < rec.blockedUntil) {
        const retryAfterSec = Math.ceil((rec.blockedUntil - now) / 1000);
        res.setHeader('Retry-After', String(retryAfterSec));
        res.status(429).json({ error: 'Cuenta temporalmente bloqueada por intentos fallidos. Intenta más tarde', details: { retry_after_seconds: retryAfterSec } });
        return;
      }

      const incFailed = () => {
        const current = loginAttempts.get(email);
        const now2 = Date.now();
        if (!current) {
          loginAttempts.set(email, { count: 1, first: now2 });
          return;
        }
        // Reiniciar ventana si expiró
        if (now2 - current.first > LOGIN_WINDOW_MS) {
          loginAttempts.set(email, { count: 1, first: now2 });
          return;
        }
        const newCount = current.count + 1;
        const updated = { ...current, count: newCount } as { count: number; first: number; blockedUntil?: number };
        if (newCount >= LOGIN_MAX_ATTEMPTS) {
          updated.blockedUntil = now2 + LOGIN_BLOCK_MS;
        }
        loginAttempts.set(email, updated);
      };

      const resetAttempts = () => {
        loginAttempts.delete(email);
      };

      // Buscar usuario por email (activo)
      const user = await this.UserModel.findOne({ where: { email, is_active: 1 } });
      if (!user) {
        incFailed();
        res.status(401).json({ error: 'Credenciales inválidas' });
        return;
      }

      // Verificar contraseña
      const isValidPassword = await bcrypt.compare(password, user.password_hash);
      if (!isValidPassword) {
        incFailed();
        res.status(401).json({ error: 'Credenciales inválidas' });
        return;
      }

      // impiar contador de intentos
      resetAttempts();

      // Generar access token corto y refresh token persistido
      const accessToken = generateAccessToken({ 
        id: user.id!, 
        email: user.email, 
        rol: user.role 
      });

      const { token: refreshToken, tokenId } = createRefreshToken(user.id!);

      // Guardar/rotar refresh token en BD
      await this.RefreshTokenModel.create({ token_id: tokenId, user_id: user.id, revoked: 0, created_at: new Date() });

      // Setear cookie httpOnly con refresh token
      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: (process.env.NODE_ENV === 'production') || (process.env.COOKIE_SAMESITE?.toLowerCase() === 'none'),
        sameSite: (process.env.COOKIE_SAMESITE as any) || 'lax',
        domain: process.env.COOKIE_DOMAIN || undefined,
        path: '/',
        maxAge: this.getRefreshCookieMaxAge()
      });

      res.json({
        token: accessToken,
        user: {
          id: user.id!,
          nombre: user.name,
          email: user.email,
          rol: user.role
        }
      });
    } catch (error) {
      console.error('Error en login:', error);
      res.status(500).json({
        error: 'Error interno del servidor'
      });
    }
  }

  async register(req: any, res: Response) {
    try {
      const { nombre, email, password, rol } = req.body;

      const strongPwdRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
      if (!strongPwdRegex.test(password)) {
        res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres e incluir mayúsculas, minúsculas, números y un carácter especial' });
        return;
      }

      // Verificar si el usuario ya existe
      const existingUser = await this.UserModel.findOne({ where: { email } });
      if (existingUser) {
        res.status(400).json({
          error: 'El email ya está registrado'
        });
        return;
      }

      // Encriptar contraseña
      const hashedPassword = await bcrypt.hash(password, 10);

      // Mapear rol recibido a ENUM de BD
      const mapRoleToDb = (value?: string): string | undefined => {
        if (!value) return value;
        const v = String(value).toLowerCase();
        switch (v) {
          case 'admin':
            return 'admin';
          case 'empleado':
          case 'employee':
            return 'employee';
          case 'cliente':
            return 'operator';
          case 'operador':
          case 'operator':
            return 'operator';
          case 'chofer':
          case 'driver':
            return 'driver';
          default:
            return value;
        }
      };

      // Crear usuario INACTIVO
      const created = await this.UserModel.create({
        name: nombre,
        email: email,
        password_hash: hashedPassword,
        role: mapRoleToDb(rol),
        is_active: 0
      });
      const insertId = created.id as number;

      // Crear token de verificación de email y persistir
      const { tokenId, token } = createEmailVerificationToken(insertId);
      await this.EmailVerificationTokenModel.create({ token_id: tokenId, user_id: insertId, is_used: 0 });

      // Nota: en producción se debe enviar el token por email. En desarrollo lo devolvemos para pruebas.
      const isProd = process.env.NODE_ENV === 'production';
      if (!isProd) {
        console.log(`[EmailVerification] Token para ${email}:`, token);
      }

      res.status(201).json({ message: 'Usuario creado. Revisa tu correo para activar la cuenta', ...(isProd ? {} : { verificationToken: token }) });
    } catch (error) {
      console.error('Error en registro:', error);
      res.status(500).json({
        error: 'Error interno del servidor'
      });
    }
  }

  async verify(req: any, res: Response) {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader && authHeader.split(' ')[1];

      if (!token) {
        res.status(401).json({
          error: 'Token no proporcionado'
        });
        return;
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as any;
      const user = await this.UserModel.findOne({ where: { id: decoded.id, is_active: 1 } });
      if (!user) {
        res.status(401).json({
          error: 'Usuario no válido'
        });
        return;
      }

      res.json({
        user,
        valid: true
      });
    } catch (error) {
      console.error('Error en verificación:', error);
      res.status(401).json({
        error: 'Token inválido'
      });
    }
  }

  async logout(req: any, res: Response) {
    try {
      const refreshToken = req.cookies?.refreshToken;
      if (!refreshToken) {
        res.status(400).json({ error: 'No hay token de refresco para cerrar sesión' });
        return;
      }

      const payload = verifyRefreshTokenPayload(refreshToken);
      await this.RefreshTokenModel.update({ revoked: 1 }, { where: { token_id: payload.tokenId } });

      res.clearCookie('refreshToken');
      res.json({ message: 'Sesión cerrada correctamente' });
    } catch (error) {
      console.error('Error en logout:', error);
      res.status(500).json({ error: 'Error del servidor al cerrar sesión' });
    }
  }

  async refresh(req: any, res: Response) {
    try {
      const refreshToken = req.cookies?.refreshToken;
      if (!refreshToken) {
        res.status(401).json({ error: 'No hay token de refresco' });
        return;
      }

      const payload = verifyRefreshTokenPayload(refreshToken);
      const tokenRow = await this.RefreshTokenModel.findOne({ where: { token_id: payload.tokenId } });
      if (!tokenRow || tokenRow.revoked) {
        res.status(401).json({ error: 'Token inválido o revocado' });
        return;
      }
      const userId = tokenRow.user_id;
      const user = await this.UserModel.findOne({ attributes: ['email', 'role'], where: { id: userId, is_active: 1 } });
      if (!user) {
        // Usuario inválido: revocar token actual y limpiar cookie
        await this.RefreshTokenModel.update({ revoked: 1 }, { where: { token_id: payload.tokenId } });
        try { res.clearCookie('refreshToken', { path: '/' }); } catch {}
        res.status(401).json({ error: 'Usuario no válido o inactivo' });
        return;
      }

      const { email: userEmail, role: userRole } = user.dataValues as { email: string; role: string };

      // Revocar token actual y emitir uno nuevo (rotación)
      await this.RefreshTokenModel.update({ revoked: 1 }, { where: { token_id: payload.tokenId } });

      const { token: newRefreshToken, tokenId: newTokenId } = createRefreshToken(userId);
      await this.RefreshTokenModel.create({ token_id: newTokenId, user_id: userId, revoked: 0 });

      // Setear nueva cookie
      res.cookie('refreshToken', newRefreshToken, {
        httpOnly: true,
        secure: (process.env.NODE_ENV === 'production') || (process.env.COOKIE_SAMESITE?.toLowerCase() === 'none'),
        sameSite: (process.env.COOKIE_SAMESITE as any) || 'lax',
        domain: process.env.COOKIE_DOMAIN || undefined,
        path: '/',
        maxAge: this.getRefreshCookieMaxAge()
      });

      // Emitir nuevo access token con datos del usuario obtenidos de la BD
      const accessToken = generateAccessToken({ id: userId, email: userEmail, rol: userRole });

      res.json({ accessToken });
    } catch (error) {
      console.error('Error en refresh:', error);
      res.status(401).json({ error: 'Token de refresco inválido' });
    }
  }

  async forgotPassword(req: any, res: Response) {
    try {
      const { email } = req.body as { email: string };
      if (!email) {
        res.status(400).json({ error: 'Email requerido' });
        return;
      }

      const user = await this.UserModel.findOne({ attributes: ['id', 'is_active'], where: { email } });
      if (user && user.is_active === 1) {
        const userId = user.id;
        const { tokenId, token } = createPasswordResetToken(userId);
        await this.PasswordResetTokenModel.create({ token_id: tokenId, user_id: userId, is_used: 0 });
        if (process.env.NODE_ENV !== 'production') {
          console.log(`[PasswordReset] Token para ${email}:`, token);
        }
        // Aquí se enviaría email con el enlace de restablecimiento
      }

      res.json({ message: 'Si el email existe, recibirás instrucciones para restablecer tu contraseña' });
    } catch (error) {
      console.error('Error en forgotPassword:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  }

  async resetPassword(req: any, res: Response) {
    try {
      const { token, newPassword } = req.body as { token: string; newPassword: string };
      if (!token || !newPassword) {
        res.status(400).json({ error: 'Datos incompletos' });
        return;
      }

      const strongPwdRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
      if (!strongPwdRegex.test(newPassword)) {
        res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres e incluir mayúsculas, minúsculas, números y un carácter especial' });
        return;
      }

      const payload = verifyPasswordResetToken(token);
      const tokenRow = await this.PasswordResetTokenModel.findOne({ where: { token_id: payload.tokenId } });
      if (!tokenRow || tokenRow.is_used === 1) {
        res.status(400).json({ error: 'Token inválido o ya utilizado' });
        return;
      }
      const userId = tokenRow.user_id;
      const hashed = await bcrypt.hash(newPassword, 10);
      await this.UserModel.update({ password_hash: hashed }, { where: { id: userId } });
      await this.PasswordResetTokenModel.update({ is_used: 1 }, { where: { token_id: payload.tokenId } });
      await this.RefreshTokenModel.update({ revoked: 1 }, { where: { user_id: userId, revoked: 0 } });

      res.json({ message: 'Contraseña actualizada. Vuelve a iniciar sesión.' });
    } catch (error) {
      console.error('Error en resetPassword:', error);
      res.status(400).json({ error: 'Token inválido o expirado' });
    }
  }

  async verifyEmail(req: any, res: Response) {
    try {
      const token = (req.query?.token as string) || (req.body?.token as string);
      if (!token) {
        res.status(400).json({ error: 'Token requerido' });
        return;
      }

      const payload = verifyEmailVerificationToken(token);
      const tokenRow = await this.EmailVerificationTokenModel.findOne({ where: { token_id: payload.tokenId } });
      if (!tokenRow || tokenRow.is_used === 1) {
        res.status(400).json({ error: 'Token inválido o ya utilizado' });
        return;
      }
      const userId = tokenRow.user_id;
      await this.UserModel.update({ is_active: 1 }, { where: { id: userId } });
      await this.EmailVerificationTokenModel.update({ is_used: 1 }, { where: { token_id: payload.tokenId } });

      res.json({ message: 'Email verificado. Ya puedes iniciar sesión.' });
    } catch (error) {
      console.error('Error en verifyEmail:', error);
      res.status(400).json({ error: 'Token inválido o expirado' });
    }
  }

  private getRefreshCookieMaxAge(): number {
    const days = parseInt(process.env.REFRESH_TOKEN_DAYS || '7', 10);
    return days * 24 * 60 * 60 * 1000;
  }
}