import { Response } from 'express';
import { Op } from 'sequelize';
import { sequelize, models as defaultModels } from '../db/sequelize';
import { Paquete } from '../types';

export class PaquetesController {
  private PackageModel: any;
  private ClientModel: any;
  private PackageHistoryModel: any;
  private ShipmentPackageModel: any;
  private ShipmentModel: any;

  constructor(_models?: any) {
    const mdl = _models || defaultModels;
    this.PackageModel = mdl.Package;
    this.ClientModel = mdl.Client;
    this.PackageHistoryModel = mdl.PackageHistory;
    this.ShipmentPackageModel = mdl.ShipmentPackage;
    this.ShipmentModel = mdl.Shipment;
  }

  private generateTrackingNumber(): string {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `PKG${timestamp.slice(-6)}${random}`;
  }

  async getAll(req: any, res: Response) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const offset = (page - 1) * limit;
      const estado = req.query.estado;
      const search = req.query.search || '';

      const where: any = { is_active: 1 };
      if (estado) where.status = estado;

      if (search) {
        const like = `%${search}%`;
        where[Op.or] = [
          { tracking_number: { [Op.like]: like } },
          { description: { [Op.like]: like } },
          sequelize.where(sequelize.col('client.name'), { [Op.like]: like })
        ];
      }

      const result = await this.PackageModel.findAndCountAll({
        where,
        include: [{ model: this.ClientModel, as: 'client', required: false }],
        limit,
        offset,
        order: [['created_at', 'DESC']]
      });

      const rows = result.rows.map((p: any) => {
        const plain = p.get({ plain: true });
        return {
          ...plain,
          id: plain.package_id,
          client_name: plain.client?.name
        } as Paquete;
      });

      const total = result.count;
      const totalPages = Math.ceil(total / limit);

      res.json({
        success: true,
        data: rows,
        pagination: { page, limit, total, totalPages }
      });
    } catch (error) {
      console.error('Error al obtener paquetes:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  }

  async getStats(req: any, res: Response) {
    try {
      // Obtener el total de paquetes activos
      const totalPaquetes = await this.PackageModel.count({
        where: { is_active: 1 }
      });

      // Obtener paquetes pendientes
      const pendientes = await this.PackageModel.count({
        where: { 
          is_active: 1,
          status: 'pendiente'
        }
      });

      // Obtener paquetes en tránsito
      const enTransito = await this.PackageModel.count({
        where: { 
          is_active: 1,
          status: 'en_transito'
        }
      });

      // Obtener paquetes entregados
      const entregados = await this.PackageModel.count({
        where: { 
          is_active: 1,
          status: 'entregado'
        }
      });

      res.json({
        success: true,
        data: {
          total: totalPaquetes,
          pendientes,
          en_transito: enTransito,
          entregados
        }
      });
    } catch (error) {
      console.error('Error al obtener estadísticas de paquetes:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  }

  async getById(req: any, res: Response) {
    try {
      const { id } = req.params;
      const paquete = await this.PackageModel.findOne({
        where: { package_id: id, is_active: 1 },
        include: [{ model: this.ClientModel, as: 'client', required: false }]
      });

      if (!paquete) {
        res.status(404).json({ error: 'Paquete no encontrado' });
        return;
      }

      const historial = await this.PackageHistoryModel.findAll({
        where: { package_id: Number(id) },
        order: [['change_date', 'DESC']]
      });

      const plain = paquete.get({ plain: true });
      res.json({
        success: true,
        data: {
          ...plain,
          id: plain.package_id,
          historial: historial.map((h: any) => h.get({ plain: true }))
        }
      });
    } catch (error) {
      console.error('Error al obtener paquete:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  }

  async getByTracking(req: any, res: Response) {
    try {
      const { numero } = req.params;
      const paquete = await this.PackageModel.findOne({
        where: {
          is_active: 1,
          [Op.or]: [
            { tracking_number: numero },
            { tracking_code: numero },
            { public_tracking_code: numero }
          ]
        },
        include: [{ model: this.ClientModel, as: 'client', required: false }]
      });

      if (!paquete) {
        res.status(404).json({ error: 'Paquete no encontrado' });
        return;
      }

      const historial = await this.PackageHistoryModel.findAll({
        where: { package_id: paquete.package_id },
        order: [['change_date', 'DESC']]
      });

      const plain = paquete.get({ plain: true });
      res.json({
        success: true,
        data: {
          ...plain,
          id: plain.package_id,
          historial: historial.map((h: any) => h.get({ plain: true }))
        }
      });
    } catch (error) {
      console.error('Error al obtener paquete por número de seguimiento:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  }

  private generatePublicCode(): string {
    const random = Math.random().toString(36).substring(2, 10).toUpperCase();
    const ts = Date.now().toString(36).toUpperCase().slice(-4);
    return `TRK-${ts}-${random.slice(0, 6)}`;
  }

  async create(req: any, res: Response) {
    try {
      // Debug: Log del body recibido
      console.log('Body recibido:', JSON.stringify(req.body, null, 2));

      // Mapear nuevos nombres de campos a nombres de BD
      const {
        sender_name, sender_email, sender_phone, sender_address,
        recipient_name, recipient_email, recipient_phone, recipient_address,
        weight, dimensions, description, quantity, estimated_delivery, notes, status
      } = req.body;

      // Debug: Log de campos extraídos
      console.log('Campos extraídos:', {
        sender_name, sender_email, sender_phone, sender_address,
        recipient_name, recipient_email, recipient_phone, recipient_address,
        weight, dimensions, description
      });

      // Por ahora, necesitamos un cliente_id. Podríamos crear un cliente automáticamente
      // o requerir que se pase como parámetro adicional
      let cliente_id = req.body.cliente_id;
      
      // Si no hay cliente_id, crear un cliente temporal con los datos del remitente
      if (!cliente_id) {
        // Validar que tengamos los datos mínimos para crear un cliente
        if (!sender_name || sender_name.trim() === '') {
          res.status(400).json({ 
            error: 'El nombre del remitente (sender_name) es requerido para crear el paquete',
            received_data: { sender_name, sender_email, sender_phone, sender_address }
          });
          return;
        }

        const cliente = await this.ClientModel.create({
          name: sender_name.trim(),
          email: sender_email || null,
          phone: sender_phone || null,
          address: sender_address || null,
          is_active: 1
        });
        cliente_id = cliente.client_id;
      }

      // Validar que cliente_id no sea undefined antes de hacer la consulta
      if (!cliente_id) {
        res.status(400).json({ error: 'ID de cliente requerido' });
        return;
      }

      const cliente = await this.ClientModel.findOne({ where: { client_id: cliente_id, is_active: 1 } });
      if (!cliente) {
        res.status(400).json({ error: 'Cliente no encontrado' });
        return;
      }

      let numero_seguimiento: string | undefined;
      let isUnique = false;
      let attempts = 0;
      while (!isUnique && attempts < 10) {
        numero_seguimiento = this.generateTrackingNumber();
        const existing = await this.PackageModel.findOne({
          where: {
            [Op.or]: [
              { tracking_number: numero_seguimiento },
              { tracking_code: numero_seguimiento }
            ]
          }
        });
        isUnique = !existing;
        attempts++;
      }
      if (!isUnique || !numero_seguimiento) {
        res.status(500).json({ error: 'Error al generar número de seguimiento único' });
        return;
      }

      let public_code: string | undefined;
      let isPublicUnique = false;
      let publicAttempts = 0;
      while (!isPublicUnique && publicAttempts < 10) {
        public_code = this.generatePublicCode();
        const existingPublic = await this.PackageModel.findOne({ where: { public_tracking_code: public_code } });
        isPublicUnique = !existingPublic;
        publicAttempts++;
      }
      if (!isPublicUnique || !public_code) {
        res.status(500).json({ error: 'Error al generar código de rastreo público' });
        return;
      }

      const pkg = await this.PackageModel.create({
        tracking_number: numero_seguimiento,
        tracking_code: numero_seguimiento,
        public_tracking_code: public_code,
        client_id: cliente_id,
        sender_name: sender_name,
        sender_email: sender_email,
        sender_phone: sender_phone,
        sender_address: sender_address,
        recipient_name: recipient_name,
        recipient_email: recipient_email,
        recipient_phone: recipient_phone,
        recipient_address: recipient_address,
        description: description,
        weight: weight,
        dimensions: dimensions,
        declared_value: req.body.valor_declarado || 0,
        origin_address: sender_address,
        destination_address: recipient_address,
        estimated_delivery_date: estimated_delivery || null,
        quantity: quantity || 1,
        status: status || 'pending'
      });

      await this.PackageHistoryModel.create({
        package_id: pkg.package_id,
        new_status: 'pending',
        comment: 'Paquete creado',
        user_id: req.user?.id || null
      });

      const plain = pkg.get({ plain: true });
      res.status(201).json({ ...plain, id: plain.package_id } as Paquete);
    } catch (error) {
      console.error('Error al crear paquete:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  }

  async update(req: any, res: Response) {
    try {
      const { id } = req.params;
      const updateData = req.body;

      const paquete = await this.PackageModel.findOne({
        where: { package_id: id, is_active: 1 },
        include: [{ model: this.ClientModel, as: 'client', required: false }]
      });

      if (!paquete) {
        res.status(404).json({ 
          success: false,
          error: 'Paquete no encontrado' 
        });
        return;
      }

      if (paquete.status === 'entregado') {
        res.status(400).json({ 
          success: false,
          error: 'No se puede actualizar un paquete entregado' 
        });
        return;
      }

      // Actualizar solo los campos proporcionados
      const camposActualizables = [
        'sender_name',
        'sender_email', 
        'sender_phone',
        'sender_address',
        'recipient_name',
        'recipient_email',
        'recipient_phone', 
        'recipient_address',
        'weight',
        'dimensions',
        'description',
        'quantity',
        'estimated_delivery',
        'real_delivery_date',
        'notes',
        'status',
        // Campos legacy (por compatibilidad)
        'descripcion',
        'peso',
        'dimensiones',
        'valor_declarado',
        'direccion_origen',
        'direccion_destino'
      ];

      const mapCampos: Record<string, string> = {
        // Mapeo de nuevos campos a campos de BD
        sender_name: 'sender_name',
        sender_email: 'sender_email',
        sender_phone: 'sender_phone',
        sender_address: 'sender_address',
        recipient_name: 'recipient_name',
        recipient_email: 'recipient_email',
        recipient_phone: 'recipient_phone',
        recipient_address: 'recipient_address',
        weight: 'weight',
        dimensions: 'dimensions',
        description: 'description',
        status: 'status',
        quantity: 'quantity',
        estimated_delivery: 'estimated_delivery_date',
        real_delivery_date: 'real_delivery_date',
        notes: 'notes',
        // Mapeo de campos legacy
        descripcion: 'description',
        peso: 'weight',
        dimensiones: 'dimensions',
        valor_declarado: 'declared_value',
        direccion_origen: 'origin_address',
        direccion_destino: 'destination_address'
      };

      camposActualizables.forEach(campo => {
        if (updateData[campo] !== undefined && mapCampos[campo]) {
          // console.log(`Actualizando campo: ${campo} con valor:`, updateData[campo]); // Log para depuración
          (paquete as any)[mapCampos[campo]] = updateData[campo];
        }
      });

      if (updateData['status'] === 'entregado') {
        paquete.actual_delivery = new Date();
        return;
      }

      paquete.updated_at = new Date();
      await paquete.save();

      await this.PackageHistoryModel.create({
        package_id: paquete.package_id,
        new_status: paquete.status,
        comment: 'Paquete actualizado',
        user_id: req.user?.id || null
      });

      const historial = await this.PackageHistoryModel.findAll({
        where: { package_id: Number(id) },
        order: [['change_date', 'DESC']]
      });

      const plain = paquete.get({ plain: true });
      res.json({ 
        success: true,
        data: {
          ...plain,
          id: plain.package_id,
          historial: historial.map((h: any) => h.get({ plain: true }))
        }
      });
    } catch (error) {
      console.error('Error al actualizar paquete:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  }

  async updateStatus(req: any, res: Response) {
    try {
      const { id } = req.params;
      const { estado, comentario } = req.body;

      const paquete = await this.PackageModel.findOne({ where: { package_id: id, is_active: 1 } });
      if (!paquete) {
        res.status(404).json({ error: 'Paquete no encontrado' });
        return;
      }

      const estadoAnterior = paquete.status as string;
      const allowedTransitions: Record<string, string[]> = {
        pendiente: ['en_transito'],
        en_transito: ['entregado', 'devuelto'],
        devuelto: ['pendiente'],
        entregado: []
      };

      if (!allowedTransitions[estadoAnterior] || !allowedTransitions[estadoAnterior].includes(estado)) {
        res.status(409).json({ error: `Transición de estado no permitida: ${estadoAnterior} -> ${estado}` });
        return;
      }

      paquete.status = estado;
      console.log("status: ", paquete.status)
      if (estado === 'entregado') {
        paquete.actual_delivery = new Date();
      }
      paquete.updated_at = new Date();
      await paquete.save();

      await this.PackageHistoryModel.create({
        package_id: paquete.package_id,
        new_status: estado,
        comment: comentario || `Estado cambiado a ${estado}`,
        user_id: req.user?.id || null
      });

      const plain = paquete.get({ plain: true });
      res.json({ ...plain, id: plain.package_id } as Paquete);
    } catch (error) {
      console.error('Error al actualizar estado del paquete:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  }

  // Creación masiva de paquetes (bulk)
  async bulkCreate(req: any, res: Response) {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (items.length === 0) {
      res.status(400).json({ error: 'Se requiere un arreglo items con al menos 1 elemento' });
      return;
    }

    const tx = await sequelize.transaction();
    try {
      const created: Paquete[] = [];
      for (const item of items) {
        // Mapear nuevos nombres de campos a los campos esperados
        const {
          // Campos del cliente
          sender_name,
          sender_email,
          sender_phone,
          sender_address,
          recipient_name,
          recipient_email,
          recipient_phone,
          recipient_address,
          // Campos del paquete
          weight,
          dimensions,
          description,
          quantity,
          estimated_delivery,
          notes,
          status,
          // Campos legacy (por compatibilidad)
          cliente_id,
          descripcion,
          peso,
          dimensiones,
          valor_declarado,
          direccion_origen,
          direccion_destino
        } = item;

        // Usar nuevos campos o fallback a campos legacy
        const finalDescription = description || descripcion;
        const finalWeight = weight || peso;
        const finalDimensions = dimensions || dimensiones;
        const finalOriginAddress = sender_address || direccion_origen;
        const finalDestinationAddress = recipient_address || direccion_destino;
        const finalDeclaredValue = item.valor_declarado || 0;

        const cliente = await this.ClientModel.findOne({ where: { client_id: cliente_id, is_active: 1 }, transaction: tx });
        if (!cliente) throw new Error(`Cliente ${cliente_id} no encontrado`);

        let numero_seguimiento: string | undefined;
        let isUnique = false;
        let attempts = 0;
        while (!isUnique && attempts < 10) {
          numero_seguimiento = this.generateTrackingNumber();
          const existing = await this.PackageModel.findOne({
            where: {
              [Op.or]: [
                { tracking_number: numero_seguimiento },
                { tracking_code: numero_seguimiento }
              ]
            },
            transaction: tx
          });
          isUnique = !existing;
          attempts++;
        }
        if (!isUnique || !numero_seguimiento) throw new Error('No fue posible generar un número de seguimiento único');

        let public_code: string | undefined;
        let isPublicUnique = false;
        let publicAttempts = 0;
        while (!isPublicUnique && publicAttempts < 10) {
          public_code = this.generatePublicCode();
          const existingPublic = await this.PackageModel.findOne({ where: { public_tracking_code: public_code }, transaction: tx });
          isPublicUnique = !existingPublic;
          publicAttempts++;
        }
        if (!isPublicUnique || !public_code) throw new Error('No fue posible generar un código público único');

        const pkg = await this.PackageModel.create({
          tracking_number: numero_seguimiento,
          tracking_code: numero_seguimiento,
          public_tracking_code: public_code,
          client_id: cliente_id,
          sender_name: sender_name,
          sender_email: sender_email,
          sender_phone: sender_phone,
          sender_address: sender_address,
          recipient_name: recipient_name,
          recipient_email: recipient_email,
          recipient_phone: recipient_phone,
          recipient_address: recipient_address,
          description: finalDescription,
          weight: finalWeight,
          dimensions: finalDimensions,
          declared_value: finalDeclaredValue,
          origin_address: finalOriginAddress,
          destination_address: finalDestinationAddress,
          status: status || 'pendiente',
          quantity: quantity || 1,
          estimated_delivery: estimated_delivery || null,
          notes: notes || ''
        }, { transaction: tx });

        await this.PackageHistoryModel.create({
          package_id: pkg.package_id,
          new_status: 'pendiente',
          comment: 'Paquete creado (bulk)',
          user_id: req.user?.id || null
        }, { transaction: tx });

        const plain = pkg.get({ plain: true });
        created.push({ ...(plain as any), id: plain.package_id } as Paquete);
      }

      await tx.commit();
      res.status(201).json(created);
    } catch (error: any) {
      await tx.rollback();
      console.error('Error en creación masiva de paquetes:', error);
      res.status(400).json({ error: error?.message || 'Error al crear paquetes en bulk' });
    }
  }

  // Generación de etiqueta SVG para impresión
  private buildLabelSVG(pkg: any): string {
    const safe = (v: any) => String(v ?? '').replace(/[<&>]/g, (c: string) => ({'<':'&lt;','>':'&gt;','&':'&amp;'} as any)[c]);
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="400" height="250" viewBox="0 0 400 250">
  <rect x="5" y="5" width="390" height="240" rx="8" ry="8" fill="#fff" stroke="#111"/>
  <text x="20" y="35" font-family="Arial" font-size="18" font-weight="bold">Etiqueta de Envío</text>
  <text x="20" y="65" font-family="Arial" font-size="14">Tracking: ${safe(pkg.tracking_number)}</text>
  <text x="20" y="90" font-family="Arial" font-size="12">Cliente: ${safe(pkg.client_name ?? '')}</text>
  <text x="20" y="110" font-family="Arial" font-size="12">Origen: ${safe(pkg.origin_address)}</text>
  <text x="20" y="130" font-family="Arial" font-size="12">Destino: ${safe(pkg.destination_address)}</text>
  <text x="20" y="160" font-family="Arial" font-size="12">Descripción: ${safe(pkg.description)}</text>
  <text x="20" y="180" font-family="Arial" font-size="12">Peso: ${safe(pkg.weight)} kg</text>
  <text x="20" y="200" font-family="Arial" font-size="12">Estado: ${safe(pkg.status)}</text>
</svg>`;
  }

  async getLabel(req: any, res: Response) {
    try {
      const { id } = req.params;
      const paquete = await this.PackageModel.findOne({
        where: { package_id: id, is_active: 1 },
        include: [{ model: this.ClientModel, as: 'client', required: false, attributes: ['name'] }]
      });
      if (!paquete) {
        res.status(404).json({ error: 'Paquete no encontrado' });
        return;
      }
      const plain = paquete.get({ plain: true });
      const svg = this.buildLabelSVG({
        ...plain,
        id: plain.package_id,
        client_name: plain.client?.name
      });
      res.json({ svg });
    } catch (error) {
      console.error('Error al generar etiqueta:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  }

  // Endpoint dedicado para historial de un paquete
  async getHistory(req: any, res: Response) {
    try {
      const { id } = req.params;

      const paquete = await this.PackageModel.findOne({ where: { package_id: id, is_active: 1 } });
      if (!paquete) {
        res.status(404).json({ error: 'Paquete no encontrado' });
        return;
      }

      const historial = await this.PackageHistoryModel.findAll({
        where: { package_id: Number(id) },
        attributes: ['new_status', 'comment', 'change_date', 'user_id'],
        order: [['change_date', 'DESC']]
      });

      res.json(historial.map((h: any) => h.get({ plain: true })));
    } catch (error) {
      console.error('Error al obtener historial del paquete:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  }

  async delete(req: any, res: Response) {
    try {
      const { id } = req.params;

      const paquete = await this.PackageModel.findOne({ where: { package_id: id, is_active: 1 } });
      if (!paquete) {
        res.status(404).json({ error: 'Paquete no encontrado' });
        return;
      }

      // if (paquete.status === 'en_transito' || paquete.status === 'entregado') {
      //   res.status(400).json({ error: 'No se puede eliminar un paquete en tránsito o entregado' });
      //   return;
      // }

      const associated = await this.ShipmentPackageModel.findOne({ where: { package_id: Number(id) } });
      if (associated) {
        res.status(400).json({ error: 'No se puede eliminar un paquete asociado a un envío' });
        return;
      }

      await this.PackageModel.update(
        { is_active: 0, updated_at: new Date() },
        { where: { package_id: id } }
      );

      res.json({ message: 'Paquete eliminado exitosamente' });
    } catch (error) {
      console.error('Error al eliminar paquete:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  }

  // Endpoint público: rastreo por código público
  async getByPublicCode(req: any, res: Response) {
    try {
      const { code } = req.params;

      const paquete = await this.PackageModel.findOne({
        where: { public_tracking_code: code, is_active: 1 },
        attributes: ['package_id', 'public_tracking_code', 'status', 'created_at', 'updated_at']
      });

      if (!paquete) {
        res.status(404).json({ error: 'Paquete no encontrado' });
        return;
      }

      let envioIds: number[] = [];
      const bridges = await this.ShipmentPackageModel.findAll({
        where: { package_id: paquete.package_id },
        attributes: ['shipment_id']
      });
      envioIds = bridges.map((b: any) => Number(b.shipment_id));

      let eta: Date | null = null;
      const latestEnvio = await this.ShipmentModel.findOne({
        where: {
          is_active: 1,
          [Op.or]: [
            { package_id: paquete.package_id },
            envioIds.length ? { shipment_id: { [Op.in]: envioIds } } : { shipment_id: -1 }
          ]
        },
        order: [['updated_at', 'DESC']],
        attributes: ['estimated_delivery_date']
      });
      if (latestEnvio) {
        eta = latestEnvio.estimated_delivery_date || null;
      }

      const historial = await this.PackageHistoryModel.findAll({
        where: { package_id: paquete.package_id },
        attributes: ['new_status', 'comment', 'change_date'],
        order: [['change_date', 'DESC']]
      });
      const events = historial.map((h: any) => h.get({ plain: true })).map((h: any) => ({
        status: h.new_status,
        comment: h.comment,
        date: h.change_date
      }));

      res.json({
        code: paquete.public_tracking_code,
        status: paquete.status,
        created_at: paquete.created_at,
        updated_at: paquete.updated_at,
        eta,
        history: events
      });
    } catch (error) {
      console.error('Error en rastreo público:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  }

  async restore(req: any, res: Response) {
    try {
      const { id } = req.params;
      
      const paquete = await this.PackageModel.findOne({ 
        where: { package_id: id, is_active: 0 },
        include: [{ model: this.ClientModel, as: 'client', required: false }]
      });

      if (!paquete) {
        res.status(404).json({ 
          success: false,
          error: 'Paquete eliminado no encontrado' 
        });
        return;
      }

      paquete.is_active = 1;
      paquete.updated_at = new Date();
      await paquete.save();

      await this.PackageHistoryModel.create({
        package_id: paquete.package_id,
        new_status: paquete.status,
        comment: 'Paquete restaurado',
        user_id: req.user?.id || null
      });

      const historial = await this.PackageHistoryModel.findAll({
        where: { package_id: Number(id) },
        attributes: ['new_status', 'comment', 'change_date', 'user_id'],
        order: [['change_date', 'DESC']]
      });

      const plain = paquete.get({ plain: true });
      res.json({
        success: true,
        data: {
          ...plain,
          id: plain.package_id,
          historial: historial.map((h: any) => h.get({ plain: true }))
        }
      });
    } catch (error) {
      console.error('Error al restaurar paquete:', error);
      res.status(500).json({ 
        success: false,
        error: 'Error interno del servidor' 
      });
    }
  }
}