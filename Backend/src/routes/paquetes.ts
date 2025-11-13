import { Router } from 'express';
import { body, query, validationResult } from 'express-validator';
import { models as defaultModels } from '../db/sequelize';
import { PaquetesController } from '../controllers/paquetesController';
import { authenticateToken, authorizeRoles } from '../middleware/auth';

const router = Router();

// Endpoint público de rastreo
/**
 * @swagger
 * /api/paquetes/public/track/{code}:
 *   get:
 *     summary: Rastrear paquete públicamente por código
 *     tags: [Paquetes]
 *     parameters:
 *       - in: path
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *         description: Código de rastreo público del paquete
 *     responses:
 *       200:
 *         description: Información del paquete obtenida correctamente
 *       404:
 *         description: Paquete no encontrado
 */
router.get('/public/track/:code', async (req: any, res: any) => {
  const mdl = req.app.locals.models || defaultModels;
  const paquetesController = new PaquetesController(mdl);
  await paquetesController.getByPublicCode(req, res);
});

// Aplicar autenticación a todas las rutas restantes
router.use(authenticateToken);

// Validaciones
const paqueteValidation = [
  body('sender_name').notEmpty().withMessage('El nombre del remitente es requerido'),
  body('sender_email').isEmail().withMessage('El email del remitente debe ser válido'),
  body('sender_phone').notEmpty().withMessage('El teléfono del remitente es requerido'),
  body('sender_address').notEmpty().withMessage('La dirección del remitente es requerida'),
  body('recipient_name').notEmpty().withMessage('El nombre del destinatario es requerido'),
  body('recipient_email').isEmail().withMessage('El email del destinatario debe ser válido'),
  body('recipient_phone').notEmpty().withMessage('El teléfono del destinatario es requerido'),
  body('recipient_address').notEmpty().withMessage('La dirección del destinatario es requerida'),
  body('weight').isFloat({ min: 0.1 }).withMessage('El peso debe ser mayor a 0'),
  body('dimensions').notEmpty().withMessage('Las dimensiones son requeridas'),
  body('description').notEmpty().withMessage('La descripción es requerida'),
  body('quantity').isInt({ min: 1 }).withMessage('La cantidad debe ser mayor a 0'),
  body('estimated_delivery').optional().isISO8601().withMessage('La fecha estimada de entrega debe ser válida'),
  body('notes').optional().isString().withMessage('Las notas deben ser texto'),
  body('status').optional().isIn(['pendiente', 'en_transito', 'entregado', 'devuelto']).withMessage('Estado inválido')
];

const paginationValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('La página debe ser un número mayor a 0'),
  query('limit').optional().isInt({ min: 1 }).withMessage('El límite debe ser un número mayor a 0'),
  query('sortBy').optional().isIn(['numero_seguimiento', 'descripcion', 'peso', 'fecha_creacion', 'estado']).withMessage('Campo de ordenamiento inválido'),
  query('sortOrder').optional().isIn(['asc', 'desc']).withMessage('Orden inválido')
];

// Función para generar número de seguimiento único
const generateTrackingNumber = (): string => {
  const timestamp = Date.now().toString();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `PKG${timestamp.slice(-6)}${random}`;
};

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

// Obtener todos los paquetes con paginación
/**
 * @swagger
 * /api/paquetes:
 *   get:
 *     summary: Obtener lista de paquetes paginada
 *     tags: [Paquetes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Número de página
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 10
 *         description: Cantidad de elementos por página
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [numero_seguimiento, descripcion, peso, fecha_creacion, estado]
 *           default: numero_seguimiento
 *         description: Campo por el cual ordenar
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Orden de clasificación
 *     responses:
 *       200:
 *         description: Lista de paquetes obtenida correctamente
 *       400:
 *         description: Parámetros de paginación inválidos
 *       401:
 *         description: No autorizado
 */
router.get('/', paginationValidation, async (req: any, res: any) => {
  // Deshabilitar caché 304
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  const mdl = req.app.locals.models || defaultModels;
  const paquetesController = new PaquetesController(mdl);
  await paquetesController.getAll(req, res);
});

/**
 * @swagger
 * /api/paquetes/stats:
 *   get:
 *     summary: Obtener estadísticas de paquetes
 *     tags: [Paquetes]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Estadísticas obtenidas con éxito
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     pendientes:
 *                       type: integer
 *                     en_transito:
 *                       type: integer
 *                     entregados:
 *                       type: integer
 *       401:
 *         description: No autorizado
 *       403:
 *         description: Acceso prohibido
 */
router.get('/stats', authorizeRoles('admin', 'empleado'), async (req: any, res: any) => {
  const mdl = req.app.locals.models || defaultModels;
  const paquetesController = new PaquetesController(mdl);
  await paquetesController.getStats(req, res);
});

// Obtener paquete por ID
/**
 * @swagger
 * /api/paquetes/{id}:
 *   get:
 *     summary: Obtener paquete por ID
 *     tags: [Paquetes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del paquete
 *     responses:
 *       200:
 *         description: Paquete obtenido correctamente
 *       401:
 *         description: No autorizado
 *       404:
 *         description: Paquete no encontrado
 */
router.get('/:id', async (req: any, res: any) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  const mdl = req.app.locals.models || defaultModels;
  const paquetesController = new PaquetesController(mdl);
  await paquetesController.getById(req, res);
});

// Buscar paquete por número de seguimiento
/**
 * @swagger
 * /api/paquetes/tracking/{numero}:
 *   get:
 *     summary: Buscar paquete por número/código de seguimiento
 *     tags: [Paquetes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: numero
 *         required: true
 *         schema:
 *           type: string
 *         description: Número de seguimiento, código privado o código público del paquete
 *     responses:
 *       200:
 *         description: Paquete encontrado correctamente
 *       401:
 *         description: No autorizado
 *       404:
 *         description: Paquete no encontrado
 */
router.get('/tracking/:numero', async (req: any, res: any) => {
  const mdl = req.app.locals.models || defaultModels;
  const paquetesController = new PaquetesController(mdl);
  await paquetesController.getByTracking(req, res);
});

// Crear nuevo paquete
/**
 * @swagger
 * /api/paquetes:
 *   post:
 *     summary: Crear nuevo paquete
 *     tags: [Paquetes]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sender_name
 *               - sender_email
 *               - sender_phone
 *               - sender_address
 *               - recipient_name
 *               - recipient_email
 *               - recipient_phone
 *               - recipient_address
 *               - weight
 *               - dimensions
 *               - description
 *               - quantity
 *             properties:
 *               sender_name:
 *                 type: string
 *                 description: Nombre del remitente
 *               sender_email:
 *                 type: string
 *                 format: email
 *                 description: Email del remitente
 *               sender_phone:
 *                 type: string
 *                 description: Teléfono del remitente
 *               sender_address:
 *                 type: string
 *                 description: Dirección del remitente
 *               recipient_name:
 *                 type: string
 *                 description: Nombre del destinatario
 *               recipient_email:
 *                 type: string
 *                 format: email
 *                 description: Email del destinatario
 *               recipient_phone:
 *                 type: string
 *                 description: Teléfono del destinatario
 *               recipient_address:
 *                 type: string
 *                 description: Dirección del destinatario
 *               weight:
 *                 type: number
 *                 minimum: 0.1
 *                 description: Peso del paquete
 *               dimensions:
 *                 type: string
 *                 description: Dimensiones del paquete
 *               description:
 *                 type: string
 *                 description: Descripción del paquete
 *               quantity:
 *                 type: integer
 *                 minimum: 1
 *                 description: Cantidad de paquetes
 *               estimated_delivery:
 *                 type: string
 *                 format: date-time
 *                 description: Fecha estimada de entrega (opcional)
 *               notes:
 *                 type: string
 *                 description: Notas adicionales (opcional)
 *               status:
 *                 type: string
 *                 enum: [pendiente, en_transito, entregado, devuelto]
 *                 description: Estado del paquete (opcional)
 *     responses:
 *       201:
 *         description: Paquete creado correctamente
 *       400:
 *         description: Datos inválidos
 *       401:
 *         description: No autorizado
 *       403:
 *         description: Acceso prohibido
 */
router.post('/', authorizeRoles('admin', 'empleado'), paqueteValidation, validateAndPassToController, async (req: any, res: any) => {
  console.log("status", req.body.status);
  const mdl = req.app.locals.models || defaultModels;
  const paquetesController = new PaquetesController(mdl);
  await paquetesController.create(req, res);
});

// Creación masiva de paquetes
/**
 * @swagger
 * /api/paquetes/bulk:
 *   post:
 *     summary: Crear múltiples paquetes
 *     tags: [Paquetes]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - items
 *             properties:
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - sender_name
 *                     - sender_email
 *                     - sender_phone
 *                     - sender_address
 *                     - recipient_name
 *                     - recipient_email
 *                     - recipient_phone
 *                     - recipient_address
 *                     - weight
 *                     - dimensions
 *                     - description
 *                     - quantity
 *                   properties:
 *                     sender_name:
 *                       type: string
 *                       description: Nombre del remitente
 *                     sender_email:
 *                       type: string
 *                       format: email
 *                       description: Email del remitente
 *                     sender_phone:
 *                       type: string
 *                       description: Teléfono del remitente
 *                     sender_address:
 *                       type: string
 *                       description: Dirección del remitente
 *                     recipient_name:
 *                       type: string
 *                       description: Nombre del destinatario
 *                     recipient_email:
 *                       type: string
 *                       format: email
 *                       description: Email del destinatario
 *                     recipient_phone:
 *                       type: string
 *                       description: Teléfono del destinatario
 *                     recipient_address:
 *                       type: string
 *                       description: Dirección del destinatario
 *                     weight:
 *                       type: number
 *                       minimum: 0.1
 *                       description: Peso del paquete
 *                     dimensions:
 *                       type: string
 *                       description: Dimensiones del paquete
 *                     description:
 *                       type: string
 *                       description: Descripción del paquete
 *                     quantity:
 *                       type: integer
 *                       minimum: 1
 *                       description: Cantidad de paquetes
 *                     estimated_delivery:
 *                       type: string
 *                       format: date-time
 *                       description: Fecha estimada de entrega (opcional)
 *                     notes:
 *                       type: string
 *                       description: Notas adicionales (opcional)
 *                     status:
 *                       type: string
 *                       enum: [pendiente, en_transito, entregado, devuelto]
 *                       description: Estado del paquete (opcional)
 *     responses:
 *       201:
 *         description: Paquetes creados correctamente
 *       400:
 *         description: Datos inválidos
 *       401:
 *         description: No autorizado
 *       403:
 *         description: Acceso prohibido
 */
router.post('/bulk', authorizeRoles('admin', 'empleado'), [
  body('items').isArray({ min: 1 }).withMessage('items debe ser un arreglo con al menos un elemento'),
  body('items.*.sender_name').notEmpty().withMessage('sender_name requerido'),
  body('items.*.sender_email').isEmail().withMessage('sender_email inválido'),
  body('items.*.sender_phone').notEmpty().withMessage('sender_phone requerido'),
  body('items.*.sender_address').notEmpty().withMessage('sender_address requerida'),
  body('items.*.recipient_name').notEmpty().withMessage('recipient_name requerido'),
  body('items.*.recipient_email').isEmail().withMessage('recipient_email inválido'),
  body('items.*.recipient_phone').notEmpty().withMessage('recipient_phone requerido'),
  body('items.*.recipient_address').notEmpty().withMessage('recipient_address requerida'),
  body('items.*.weight').isFloat({ min: 0.1 }).withMessage('weight inválido'),
  body('items.*.dimensions').notEmpty().withMessage('dimensions requeridas'),
  body('items.*.description').notEmpty().withMessage('description requerida'),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('quantity inválida'),
  body('items.*.estimated_delivery').optional().isISO8601().withMessage('estimated_delivery inválida'),
  body('items.*.notes').optional().isString().withMessage('notes inválidas'),
  body('items.*.status').optional().isIn(['pendiente', 'en_transito', 'entregado', 'devuelto']).withMessage('status inválido')
], validateAndPassToController, async (req: any, res: any) => {
  const mdl = req.app.locals.models || defaultModels;
  const paquetesController = new PaquetesController(mdl);
  await paquetesController.bulkCreate(req, res);
});

// Obtener etiqueta SVG del paquete
/**
 * @swagger
 * /api/paquetes/{id}/etiqueta:
 *   get:
 *     summary: Obtener etiqueta SVG del paquete
 *     tags: [Paquetes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del paquete
 *     responses:
 *       200:
 *         description: Etiqueta SVG obtenida correctamente
 *         content:
 *           image/svg+xml:
 *             schema:
 *               type: string
 *       401:
 *         description: No autorizado
 *       403:
 *         description: Acceso prohibido
 *       404:
 *         description: Paquete no encontrado
 */
router.get('/:id/etiqueta', authorizeRoles('admin', 'empleado'), async (req: any, res: any) => {
  const mdl = req.app.locals.models || defaultModels;
  const paquetesController = new PaquetesController(mdl);
  await paquetesController.getLabel(req, res);
});

// Historial del paquete
/**
 * @swagger
 * /api/paquetes/{id}/historial:
 *   get:
 *     summary: Obtener historial del paquete
 *     tags: [Paquetes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del paquete
 *     responses:
 *       200:
 *         description: Historial obtenido correctamente
 *       401:
 *         description: No autorizado
 *       403:
 *         description: Acceso prohibido
 *       404:
 *         description: Paquete no encontrado
 */
router.get('/:id/historial', authorizeRoles('admin', 'empleado'), async (req: any, res: any) => {
  const mdl = req.app.locals.models || defaultModels;
  const paquetesController = new PaquetesController(mdl);
  await paquetesController.getHistory(req, res);
});

// Actualizar paquete
/**
 * @swagger
 * /api/paquetes/{id}:
 *   put:
 *     summary: Actualizar paquete
 *     tags: [Paquetes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del paquete
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               sender_name:
 *                 type: string
 *                 description: Nombre del remitente
 *               sender_email:
 *                 type: string
 *                 format: email
 *                 description: Email del remitente
 *               sender_phone:
 *                 type: string
 *                 description: Teléfono del remitente
 *               sender_address:
 *                 type: string
 *                 description: Dirección del remitente
 *               recipient_name:
 *                 type: string
 *                 description: Nombre del destinatario
 *               recipient_email:
 *                 type: string
 *                 format: email
 *                 description: Email del destinatario
 *               recipient_phone:
 *                 type: string
 *                 description: Teléfono del destinatario
 *               recipient_address:
 *                 type: string
 *                 description: Dirección del destinatario
 *               weight:
 *                 type: number
 *                 minimum: 0.1
 *                 description: Peso del paquete
 *               dimensions:
 *                 type: string
 *                 description: Dimensiones del paquete
 *               description:
 *                 type: string
 *                 description: Descripción del paquete
 *               quantity:
 *                 type: integer
 *                 minimum: 1
 *                 description: Cantidad de paquetes
 *               estimated_delivery:
 *                 type: string
 *                 format: date-time
 *                 description: Fecha estimada de entrega
 *               notes:
 *                 type: string
 *                 description: Notas adicionales
 *     responses:
 *       200:
 *         description: Paquete actualizado correctamente
 *       400:
 *         description: Datos inválidos
 *       401:
 *         description: No autorizado
 *       403:
 *         description: Acceso prohibido
 *       404:
 *         description: Paquete no encontrado
 */
// Validaciones para actualización
const updatePaqueteValidation = [
  body('sender_name').optional().notEmpty().withMessage('El nombre del remitente no puede estar vacío'),
  body('sender_email').optional().isEmail().withMessage('El email del remitente debe ser válido'),
  body('sender_phone').optional().notEmpty().withMessage('El teléfono del remitente no puede estar vacío'),
  body('sender_address').optional().notEmpty().withMessage('La dirección del remitente no puede estar vacía'),
  body('recipient_name').optional().notEmpty().withMessage('El nombre del destinatario no puede estar vacío'),
  body('recipient_email').optional().isEmail().withMessage('El email del destinatario debe ser válido'),
  body('recipient_phone').optional().notEmpty().withMessage('El teléfono del destinatario no puede estar vacío'),
  body('recipient_address').optional().notEmpty().withMessage('La dirección del destinatario no puede estar vacía'),
  body('weight').optional().isFloat({ min: 0.1 }).withMessage('El peso debe ser mayor a 0.1'),
  body('dimensions').optional().notEmpty().withMessage('Las dimensiones no pueden estar vacías'),
  body('description').optional().notEmpty().withMessage('La descripción no puede estar vacía'),
  body('quantity').optional().isInt({ min: 1 }).withMessage('La cantidad debe ser mayor a 0'),
  body('estimated_delivery').optional().isISO8601().withMessage('La fecha estimada de entrega debe ser válida'),
  body('notes').optional().isString().withMessage('Las notas deben ser texto')
];

router.put('/:id', authorizeRoles('admin', 'empleado'), updatePaqueteValidation, validateAndPassToController, async (req: any, res: any) => {
  console.log(req.body.sender_name);

  const mdl = req.app.locals.models || defaultModels;
  const paquetesController = new PaquetesController(mdl);
  await paquetesController.update(req, res);
});

// Actualizar estado del paquete
/**
 * @swagger
 * /api/paquetes/{id}/estado:
 *   patch:
 *     summary: Actualizar estado del paquete
 *     description: |
 *       Actualiza el estado de un paquete siguiendo las transiciones permitidas:
 *       
 *       Transiciones permitidas:
 *       - De "pendiente" → "en_transito"
 *       - De "en_transito" → "entregado" o "devuelto"
 *       - De "devuelto" → "pendiente"
 *       - De "entregado" → ninguna transición permitida
 *       
 *       Diagrama de estados:
 *       ```
 *       pendiente ──→ en_transito ──→ entregado
 *           ↑              │
 *           └──── devuelto ←┘
 *       ```
 *     tags: [Paquetes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del paquete
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - estado
 *             properties:
 *               estado:
 *                 type: string
 *                 enum: [pendiente, en_transito, entregado, devuelto]
 *                 description: |
 *                   Nuevo estado del paquete. Las transiciones permitidas son:
 *                   - pendiente → en_transito
 *                   - en_transito → entregado, devuelto
 *                   - devuelto → pendiente
 *                   - entregado → (ninguna transición permitida)
 *               comentario:
 *                 type: string
 *                 description: Comentario opcional sobre el cambio de estado
 *     responses:
 *       200:
 *         description: Estado del paquete actualizado correctamente
 *       400:
 *         description: Estado inválido o transición no permitida
 *       401:
 *         description: No autorizado
 *       403:
 *         description: Acceso prohibido
 *       404:
 *         description: Paquete no encontrado
 *       409:
 *         description: Transición de estado no permitida
 */
router.patch('/:id/estado', authorizeRoles('admin', 'empleado'), [
  body('estado').isIn(['pendiente', 'en_transito', 'entregado', 'devuelto']).withMessage('Estado inválido')
], async (req: any, res: any) => {
  const mdl = req.app.locals.models || defaultModels;
  const paquetesController = new PaquetesController(mdl);
  await paquetesController.updateStatus(req, res);
});

// Eliminar paquete
/**
 * @swagger
 * /api/paquetes/{id}:
 *   delete:
 *     summary: Eliminar paquete
 *     tags: [Paquetes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del paquete
 *     responses:
 *       200:
 *         description: Paquete eliminado correctamente
 *       401:
 *         description: No autorizado
 *       403:
 *         description: Acceso prohibido
 *       404:
 *         description: Paquete no encontrado
 */
router.delete('/:id', authorizeRoles('admin'), async (req: any, res: any) => {
  const mdl = req.app.locals.models || defaultModels;
  const paquetesController = new PaquetesController(mdl);
  await paquetesController.delete(req, res);
});

/**
 * @swagger
 * /api/paquetes/{id}/restore:
 *   post:
 *     summary: Restaurar un paquete eliminado
 *     tags: [Paquetes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID del paquete a restaurar
 *     responses:
 *       200:
 *         description: Paquete restaurado correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     pack_id:
 *                       type: integer
 *                     paqu_estado:
 *                       type: string
 *                     cliente:
 *                       type: object
 *                     historial:
 *                       type: array
 *       401:
 *         description: No autorizado
 *       403:
 *         description: Acceso prohibido
 *       404:
 *         description: Paquete eliminado no encontrado
 *       500:
 *         description: Error interno del servidor
 */
router.post('/:id/restore', authorizeRoles('admin'), async (req: any, res: any) => {
  const mdl = req.app.locals.models || defaultModels;
  const paquetesController = new PaquetesController(mdl);
  await paquetesController.restore(req, res);
});

export default router;