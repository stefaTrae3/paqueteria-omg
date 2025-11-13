import { Router } from 'express';
import { body, validationResult, query } from 'express-validator';
import { models as defaultModels } from '../db/sequelize';
import { Usuario, ApiResponse, PaginatedResponse, PaginationParams, AuthRequest } from '../types';
import { authenticateToken, authorizeRoles } from '../middleware/auth';
import { UsuariosController } from '../controllers/usuariosController';

const router = Router();

// Proteger todas las rutas de usuarios por defecto
router.use(authenticateToken);

// Validaciones
const usuarioValidation = [
  body('nombre').notEmpty().withMessage('El nombre es requerido'),
  body('email').isEmail().withMessage('Email inválido'),
  body('password').optional().isLength({ min: 6 }).withMessage('La contraseña debe tener al menos 6 caracteres'),
  body('rol').isIn(['admin', 'empleado', 'cliente']).withMessage('Rol inválido')
];

const usuarioCreateValidation = [
  body('nombre').notEmpty().withMessage('El nombre es requerido'),
  body('email').isEmail().withMessage('Email inválido'),
  body('password').isLength({ min: 6 }).withMessage('La contraseña debe tener al menos 6 caracteres'),
  body('rol').isIn(['admin', 'empleado', 'cliente']).withMessage('Rol inválido')
];

const paginationValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('La página debe ser un número mayor a 0'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('El límite debe estar entre 1 y 100'),
  query('sortBy').optional().isIn(['nombre', 'email', 'rol', 'fecha_creacion']).withMessage('Campo de ordenamiento inválido'),
  query('sortOrder').optional().isIn(['asc', 'desc']).withMessage('Orden inválido'),
  query('estado').optional().isIn(['activo', 'inactivo', 'todos']).withMessage('Estado inválido')
];

// Middleware para validar entrada y pasar al controlador
const validateAndPassToController = (req: any, res: any, next: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Datos de entrada inválidos',
      details: errors.array()
    });
  }
  next();
};

// Obtener todos los usuarios con paginación (solo admins)
/**
 * @swagger
 * /api/usuarios:
 *   get:
 *     summary: Obtener lista de usuarios paginada
 *     tags: [Usuarios]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Número de página
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         description: Cantidad de elementos por página
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [nombre, email, rol, fecha_creacion]
 *         description: Campo por el cual ordenar
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *         description: Orden de clasificación
 *     responses:
 *       200:
 *         description: Lista de usuarios obtenida correctamente
 *       400:
 *         description: Parámetros de paginación inválidos
 *       401:
 *         description: No autorizado
 *       403:
 *         description: Acceso prohibido
 */
router.get('/', authorizeRoles('admin'), paginationValidation, async (req: any, res: any) => {
  const mdl = req.app.locals.models || defaultModels;
  const usuariosController = new UsuariosController(mdl);
  await usuariosController.getAll(req, res);
});

// Obtener usuario por ID (admins pueden ver cualquier usuario, otros solo su propio perfil)
/**
 * @swagger
 * /api/usuarios/{id}:
 *   get:
 *     summary: Obtener usuario por ID
 *     description: Los administradores pueden ver cualquier usuario, otros usuarios solo pueden ver su propio perfil
 *     tags: [Usuarios]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del usuario
 *     responses:
 *       200:
 *         description: Usuario obtenido correctamente
 *       401:
 *         description: No autorizado
 *       403:
 *         description: Acceso prohibido
 *       404:
 *         description: Usuario no encontrado
 */
router.get('/:id', async (req: any, res: any) => {
  const mdl = req.app.locals.models || defaultModels;
  const usuariosController = new UsuariosController(mdl);
  await usuariosController.getById(req, res);
});

// Crear nuevo usuario (solo admins)
/**
 * @swagger
 * /api/usuarios:
 *   post:
 *     summary: Crear nuevo usuario
 *     tags: [Usuarios]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - nombre
 *               - email
 *               - password
 *               - rol
 *             properties:
 *               nombre:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 6
 *               rol:
 *                 type: string
 *                 enum: [admin, empleado, cliente]
 *     responses:
 *       201:
 *         description: Usuario creado correctamente
 *       400:
 *         description: Datos inválidos
 *       401:
 *         description: No autorizado
 *       403:
 *         description: Acceso prohibido
 */
router.post('/', authorizeRoles('admin'), usuarioCreateValidation, validateAndPassToController, async (req: any, res: any) => {
  const mdl = req.app.locals.models || defaultModels;
  const usuariosController = new UsuariosController(mdl);
  await usuariosController.create(req, res);
});

// Actualizar usuario
/**
 * @swagger
 * /api/usuarios/{id}:
 *   put:
 *     summary: Actualizar usuario
 *     tags: [Usuarios]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del usuario
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - nombre
 *               - email
 *               - rol
 *             properties:
 *               nombre:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 6
 *               rol:
 *                 type: string
 *                 enum: [admin, empleado, cliente]
 *     responses:
 *       200:
 *         description: Usuario actualizado correctamente
 *       400:
 *         description: Datos inválidos
 *       401:
 *         description: No autorizado
 *       403:
 *         description: Acceso prohibido
 *       404:
 *         description: Usuario no encontrado
 */
router.put('/:id', usuarioValidation, validateAndPassToController, async (req: any, res: any) => {
  const mdl = req.app.locals.models || defaultModels;
  const usuariosController = new UsuariosController(mdl);
  await usuariosController.update(req, res);
});

// Cambiar contraseña
/**
 * @swagger
 * /api/usuarios/{id}/password:
 *   patch:
 *     summary: Cambiar contraseña de usuario
 *     tags: [Usuarios]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del usuario
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - current_password
 *               - new_password
 *             properties:
 *               current_password:
 *                 type: string
 *               new_password:
 *                 type: string
 *                 description: Debe tener al menos 8 caracteres e incluir mayúsculas, minúsculas, números y un carácter especial
 *     responses:
 *       200:
 *         description: Contraseña actualizada correctamente
 *       400:
 *         description: Datos inválidos
 *       401:
 *         description: No autorizado
 *       403:
 *         description: Acceso prohibido
 *       404:
 *         description: Usuario no encontrado
 */
router.patch('/:id/password', [
  body('current_password').notEmpty().withMessage('La contraseña actual es requerida'),
  body('new_password')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/)
    .withMessage('La nueva contraseña debe tener al menos 8 caracteres e incluir mayúsculas, minúsculas, números y un carácter especial')
], validateAndPassToController, async (req: any, res: any) => {
  const mdl = req.app.locals.models || defaultModels;
  const usuariosController = new UsuariosController(mdl);
  await usuariosController.changePassword(req, res);
});

// Desactivar usuario (soft delete) - solo admins
/**
 * @swagger
 * /api/usuarios/{id}:
 *   delete:
 *     summary: Desactivar usuario (soft delete)
 *     tags: [Usuarios]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del usuario
 *     responses:
 *       200:
 *         description: Usuario desactivado correctamente
 *       401:
 *         description: No autorizado
 *       403:
 *         description: Acceso prohibido
 *       404:
 *         description: Usuario no encontrado
 */
router.delete('/:id', authorizeRoles('admin'), async (req: any, res: any) => {
  const mdl = req.app.locals.models || defaultModels;
  const usuariosController = new UsuariosController(mdl);
  await usuariosController.delete(req, res);
});

// Obtener perfil del usuario actual
/**
 * @swagger
 * /api/usuarios/me/profile:
 *   get:
 *     summary: Obtener perfil del usuario actual
 *     tags: [Usuarios]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Perfil obtenido correctamente
 *       401:
 *         description: No autorizado
 */
router.get('/me/profile', async (req: any, res: any) => {
  const mdl = req.app.locals.models || defaultModels;
  const usuariosController = new UsuariosController(mdl);
  await usuariosController.getProfile(req, res);
});

// Editar perfil del usuario actual
/**
 * @swagger
 * /api/usuarios/me/profile:
 *   patch:
 *     summary: Editar perfil del usuario actual
 *     tags: [Usuarios]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nombre:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Perfil actualizado correctamente
 *       400:
 *         description: Datos inválidos
 *       401:
 *         description: No autorizado
 */
router.patch('/me/profile', [
  body('nombre').optional().isString().notEmpty().withMessage('Nombre inválido'),
  body('email').optional().isEmail().withMessage('Email inválido')
], validateAndPassToController, async (req: any, res: any) => {
  const mdl = req.app.locals.models || defaultModels;
  const usuariosController = new UsuariosController(mdl);
  await usuariosController.updateProfile(req, res);
});

// Restaurar usuario (solo admins)
/**
 * @swagger
 * /api/usuarios/{id}/restore:
 *   patch:
 *     summary: Restaurar usuario desactivado
 *     tags: [Usuarios]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del usuario
 *     responses:
 *       200:
 *         description: Usuario restaurado correctamente
 *       401:
 *         description: No autorizado
 *       403:
 *         description: Acceso prohibido
 *       404:
 *         description: Usuario no encontrado
 */
router.patch('/:id/restore', authorizeRoles('admin'), async (req: any, res: any) => {
  const mdl = req.app.locals.models || defaultModels;
  const usuariosController = new UsuariosController(mdl);
  await usuariosController.restore(req, res);
});

// Activar usuario (solo admins)
/**
 * @swagger
 * /api/usuarios/{id}/activate:
 *   patch:
 *     summary: Activar usuario desactivado
 *     tags: [Usuarios]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del usuario
 *     responses:
 *       200:
 *         description: Usuario activado correctamente
 *       401:
 *         description: No autorizado
 *       403:
 *         description: Acceso prohibido
 *       404:
 *         description: Usuario no encontrado
 */
router.patch('/:id/activate', authorizeRoles('admin'), async (req: any, res: any) => {
  const mdl = req.app.locals.models || defaultModels;
  const usuariosController = new UsuariosController(mdl);
  await usuariosController.activate(req, res);
});

// Desactivar usuario (cambiar estado a inactivo)
router.patch('/:id/deactivate', authorizeRoles('admin'), async (req: any, res: any) => {
  const mdl = req.app.locals.models || defaultModels;
  const usuariosController = new UsuariosController(mdl);
  await usuariosController.deactivate(req, res);
});

export default router;