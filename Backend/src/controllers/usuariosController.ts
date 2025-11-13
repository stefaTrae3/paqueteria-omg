import bcrypt from 'bcryptjs';
import { Response } from 'express';
import { Usuario, AuthRequest } from '../types';
import { models as defaultModels } from '../db/sequelize';
import { Op } from 'sequelize';

export class UsuariosController {
  private UsuarioModel: any;
  private RefreshTokenModel: any;

  constructor(_models?: any) {
    const mdl = _models || defaultModels;
    this.UsuarioModel = mdl.User;
    this.RefreshTokenModel = mdl.RefreshToken;
  }

  // Mapea valores de rol recibidos (es/en) a los valores del ENUM en BD
  private mapRoleToDb(value?: string): string | undefined {
    if (!value) return value;
    const v = String(value).toLowerCase();
    switch (v) {
      case 'admin':
        return 'admin';
      case 'empleado':
      case 'employee':
        return 'employee';
      case 'cliente':
        // No existe 'cliente' en BD; usar 'operator' como rol de acceso más limitado
        return 'operator';
      case 'operador':
      case 'operator':
        return 'operator';
      case 'chofer':
      case 'driver':
        return 'driver';
      default:
        return value; // pasar tal cual por si ya es un valor válido
    }
  }

  async getAll(req: any, res: Response) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const offset = (page - 1) * limit;
      const rol = req.query.rol;
      const search = req.query.search || '';
      const estado = String(req.query.estado || 'activo').toLowerCase();
      const sortBy = String(req.query.sortBy || 'fecha_creacion').toLowerCase();
      const sortOrder = String(req.query.sortOrder || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';

      const where: any = {};
      // Filtrar por estado
      if (estado === 'activo') {
        where.is_active = 1;
      } else if (estado === 'inactivo') {
        where.is_active = 0;
      } // 'todos' no aplica filtro por is_active

      if (rol) where.role = this.mapRoleToDb(rol);
      if (search) {
        const like = `%${search}%`;
        where[Op.or] = [
          { name: { [Op.like]: like } },
          { email: { [Op.like]: like } }
        ];
      }
      // Mapear sortBy del query a columnas reales
      const sortMap: Record<string, string> = {
        nombre: 'name',
        email: 'email',
        rol: 'role',
        fecha_creacion: 'created_at'
      };
      const orderColumn = sortMap[sortBy] || 'created_at';

      const result = await this.UsuarioModel.findAndCountAll({
        where,
        order: [[orderColumn, sortOrder]],
        limit,
        offset,
        attributes: ['id', 'name', 'email', 'role', 'is_active', 'created_at', 'updated_at']
      });

      const rows = result.rows as Omit<Usuario, 'password'>[];
      const total = result.count as number;
      const totalPages = Math.ceil(total / limit);

      res.json({
        data: rows,
        pagination: { page, limit, total, totalPages }
      });
    } catch (error) {
      console.error('Error al obtener usuarios:', error);
      res.status(500).json({
        error: 'Error interno del servidor'
      });
    }
  }

  async getById(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const currentUser = req.user;

      // Solo admins pueden ver cualquier usuario, otros solo su propio perfil
      if (currentUser?.rol !== 'admin' && currentUser?.id !== parseInt(id)) {
        res.status(403).json({
          error: 'No tienes permisos para ver este usuario'
        });
        return;
      }
      
      const usuario = await this.UsuarioModel.findOne({
        where: { id, is_active: 1 },
        attributes: [
          'id',
          'name',
          'email',
          'role',
          'is_active',
          'created_at',
          'updated_at'
        ]
      });

      if (!usuario) {
        res.status(404).json({
          error: 'Usuario no encontrado'
        });
        return;
      }
      res.json(usuario as Omit<Usuario, 'password'>);
    } catch (error) {
      console.error('Error al obtener usuario:', error);
      res.status(500).json({
        error: 'Error interno del servidor'
      });
    }
  }

  async create(req: any, res: Response) {
    try {
      const { nombre, email, password, rol } = req.body;
      const existingUser = await this.UsuarioModel.findOne({ where: { email } });
      if (existingUser) {
        res.status(400).json({
          error: 'El email ya está registrado'
        });
        return;
      }

      // Encriptar contraseña
      const hashedPassword = await bcrypt.hash(password, 10);

      const created = await this.UsuarioModel.create({
        name: nombre,
        email: email,
        password_hash: hashedPassword,
        role: this.mapRoleToDb(rol),
        is_active: 1
      });

      const usuario = await this.UsuarioModel.findOne({
        where: { id: created.id },
        attributes: ['id', 'name', 'email', 'role', 'is_active', 'created_at', 'updated_at']
      });

      res.status(201).json(usuario as Omit<Usuario, 'password'>);
    } catch (error) {
      console.error('Error al crear usuario:', error);
      res.status(500).json({
        error: 'Error interno del servidor'
      });
    }
  }

  async update(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { nombre, email, rol } = req.body;
      const currentUser = req.user;

      // Solo admins pueden actualizar cualquier usuario, otros solo su propio perfil
      if (currentUser?.rol !== 'admin' && currentUser?.id !== parseInt(id)) {
        res.status(403).json({
          error: 'No tienes permisos para actualizar este usuario'
        });
        return;
      }

      const existingUser = await this.UsuarioModel.findOne({ where: { id, is_active: 1 }, attributes: ['id', 'role'] });
      if (!existingUser) {
        res.status(404).json({
          error: 'Usuario no encontrado'
        });
        return;
      }
      const userRow = existingUser;
      // Solo admins pueden cambiar roles
      let updateRol = userRow.role;
      if (currentUser?.rol === 'admin' && rol) {
        updateRol = this.mapRoleToDb(rol)!;
      }

      // Verificar si el email ya existe en otro usuario
      const emailCheck = await this.UsuarioModel.findOne({ where: { email, id: { [Op.ne]: id }, is_active: 1 } });
      if (emailCheck) {
        res.status(400).json({
          error: 'El email ya está registrado por otro usuario'
        });
        return;
      }
      await this.UsuarioModel.update({ name: nombre, email: email, role: updateRol }, { where: { id } });
      const updatedUser = await this.UsuarioModel.findOne({
        where: { id },
        attributes: ['id', 'name', 'email', 'role', 'is_active', 'created_at', 'updated_at']
      });

      res.json(updatedUser as Omit<Usuario, 'password'>);
    } catch (error) {
      console.error('Error al actualizar usuario:', error);
      res.status(500).json({
        error: 'Error interno del servidor'
      });
    }
  }

  async changePassword(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { current_password, new_password } = req.body;
      const currentUser = req.user;

      // Solo el propio usuario puede cambiar su contraseña
      if (currentUser?.id !== parseInt(id)) {
        res.status(403).json({
          error: 'Solo puedes cambiar tu propia contraseña'
        });
        return;
      }

      const usuario = await this.UsuarioModel.findOne({ where: { id, is_active: 1 }, attributes: ['id', 'password_hash'] });
      if (!usuario) {
        res.status(404).json({
          error: 'Usuario no encontrado'
        });
        return;
      }
      const user = usuario as any;
      // Verificar contraseña actual
      const isValidPassword = await bcrypt.compare(current_password, user.password_hash);
      if (!isValidPassword) {
        res.status(400).json({
          error: 'Contraseña actual incorrecta'
        });
        return;
      }

      // Política básica de contraseña ya debería validarse en la ruta, pero por seguridad
      const strongPwdRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
      if (!strongPwdRegex.test(new_password)) {
        res.status(400).json({
          error: 'La nueva contraseña no cumple con la política de seguridad'
        });
        return;
      }

      const hashedNewPassword = await bcrypt.hash(new_password, 10);
      await this.UsuarioModel.update({ password_hash: hashedNewPassword }, { where: { id } });
      try {
        await this.RefreshTokenModel.update({ revoked: 1 }, { where: { user_id: id, revoked: 0 } });
      } catch (e) {
        console.warn('No se pudo revocar algunos tokens de refresco para el usuario', e);
      }

      // Borrar cookie refreshToken para forzar re-login
      try {
        (res as any).clearCookie('refreshToken', { path: '/' });
      } catch {}

      res.json({ message: 'Contraseña actualizada exitosamente. Por seguridad, se cerró la sesión en otros dispositivos.' });
    } catch (error) {
      console.error('Error al cambiar contraseña:', error);
      res.status(500).json({
        error: 'Error interno del servidor'
      });
    }
  }

  async delete(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const currentUser = req.user;

      // No permitir que un usuario se elimine a sí mismo
      if (currentUser?.id === parseInt(id)) {
        res.status(400).json({
          error: 'No puedes eliminar tu propia cuenta'
        });
        return;
      }

      const existingUser = await this.UsuarioModel.findOne({ where: { id, is_active: 1 }, attributes: ['id'] });
      if (!existingUser) {
        res.status(404).json({
          error: 'Usuario no encontrado'
        });
        return;
      }

      await this.UsuarioModel.update({ is_active: 0 }, { where: { id } });

      // Revocar todos los refresh tokens activos del usuario desactivado
      try {
        await this.RefreshTokenModel.update({ revoked: 1 }, { where: { user_id: id, revoked: 0 } });
      } catch (e) {
        console.warn('No se pudo revocar tokens de refresco al desactivar usuario', e);
      }

      res.json({ message: 'Usuario desactivado exitosamente' });
    } catch (error) {
      console.error('Error al desactivar usuario:', error);
      res.status(500).json({
        error: 'Error interno del servidor'
      });
    }
  }

  // Desactivar usuario
  async deactivate(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const currentUser = req.user;

      // No permitir que un usuario se desactive a sí mismo
      if (currentUser?.id === parseInt(id)) {
        res.status(400).json({
          error: 'No puedes desactivar tu propia cuenta'
        });
        return;
      }

      const existingUser = await this.UsuarioModel.findOne({ where: { id, is_active: 1 }, attributes: ['id'] });
      if (!existingUser) {
        res.status(404).json({
          error: 'Usuario no encontrado o ya inactivo'
        });
        return;
      }

      await this.UsuarioModel.update({ is_active: 0 }, { where: { id } });

      // Revocar todos los refresh tokens activos del usuario desactivado
      try {
        await this.RefreshTokenModel.update({ revoked: 1 }, { where: { user_id: id, revoked: 0 } });
      } catch (e) {
        console.warn('No se pudo revocar tokens de refresco al desactivar usuario', e);
      }

      res.json({ message: 'Usuario desactivado exitosamente' });
    } catch (error) {
      console.error('Error al desactivar usuario:', error);
      res.status(500).json({
        error: 'Error interno del servidor'
      });
    }
  }

  async getProfile(req: AuthRequest, res: Response) {
    try {
      const currentUser = req.user;

      if (!currentUser) {
        res.status(401).json({
          error: 'Usuario no autenticado'
        });
        return;
      }

      const usuario = await this.UsuarioModel.findOne({
        where: { id: currentUser.id, is_active: 1 },
        attributes: [
          'id',
          'name',
          'email',
          'role',
          'is_active',
          'created_at',
          'updated_at'
        ]
      });

      if (!usuario) {
        res.status(404).json({
          error: 'Usuario no encontrado'
        });
        return;
      }
      res.json(usuario as Omit<Usuario, 'password'>);
    } catch (error) {
      console.error('Error al obtener perfil:', error);
      res.status(500).json({
        error: 'Error interno del servidor'
      });
    }
  }

  // Editar el propio perfil (nombre, email) usando columnas reales y alias en salida
  async updateProfile(req: AuthRequest, res: Response) {
    try {
      const currentUser = req.user;
      if (!currentUser) {
        res.status(401).json({ error: 'Usuario no autenticado' });
        return;
      }

      const { nombre, email } = req.body as { nombre?: string; email?: string };

      // Validación mínima
      if ((nombre === undefined || nombre === null) && (email === undefined || email === null)) {
        res.status(400).json({ error: 'Debe enviar al menos un campo a actualizar' });
        return;
      }

      // Si viene email, verificar unicidad en usuarios activos
      if (email) {
        const emailExists = await this.UsuarioModel.findOne({
          where: { email: email, id: { [Op.ne]: currentUser.id }, is_active: 1 },
          attributes: ['id']
        });
        if (emailExists) {
          res.status(400).json({ error: 'El email ya está registrado por otro usuario' });
          return;
        }
      }

      const updateData: any = {};
      if (typeof nombre === 'string') updateData.name = nombre;
      if (typeof email === 'string') updateData.email = email;
      if (Object.keys(updateData).length === 0) {
        res.status(400).json({ error: 'Sin cambios para aplicar' });
        return;
      }

      await this.UsuarioModel.update(updateData, { where: { id: currentUser.id, is_active: 1 } });
      const updated = await this.UsuarioModel.findOne({
        where: { id: currentUser.id },
        attributes: [
          'id',
          'name',
          'email',
          'role',
          'is_active',
          'created_at',
          'updated_at'
        ]
      });

      res.json(updated as Omit<Usuario, 'password'>);
    } catch (error) {
      console.error('Error al actualizar perfil:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  }

  // Restaurar usuario (soft-deleted)
  async restore(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params as { id: string };
      const inactive = await this.UsuarioModel.findOne({ where: { id, is_active: 0 }, attributes: ['id'] });
      if (!inactive) {
        res.status(404).json({ error: 'Usuario no encontrado o ya activo' });
        return;
      }
      await this.UsuarioModel.update({ is_active: 1 }, { where: { id } });
      const usuario = await this.UsuarioModel.findOne({
        where: { id },
        attributes: [
          'id',
          'name',
          'email',
          'role',
          'is_active',
          'created_at',
          'updated_at'
        ]
      });
      res.json(usuario as Omit<Usuario, 'password'>);
    } catch (error) {
      console.error('Error al restaurar usuario:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  }

  async activate(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
  
      const inactive = await this.UsuarioModel.findOne({ where: { id, is_active: 0 }, attributes: ['id'] });
      if (!inactive) {
        res.status(404).json({ error: 'Usuario no encontrado o ya activo' });
        return;
      }
      await this.UsuarioModel.update({ is_active: 1 }, { where: { id } });
      const usuario = await this.UsuarioModel.findOne({
        where: { id },
        attributes: [
          'id',
          'name',
          'email',
          'role',
          'is_active',
          'created_at',
          'updated_at'
        ]
      });

      res.json(usuario as Omit<Usuario, 'password'>);
    } catch (error) {
      console.error('Error al activar usuario:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  }
}