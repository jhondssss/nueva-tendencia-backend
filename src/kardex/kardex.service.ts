import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { KardexMovimiento, TipoMovimiento } from './entities/kardex.entity';
import { Producto } from '../producto/entities/producto.entity';
import { Insumo } from '../insumo/entities/insumo.entity';
import { CreateKardexDto } from './dto/create-kardex.dto';
import { paginate } from '../common/pagination';

@Injectable()
export class KardexService {
  constructor(
    @InjectRepository(KardexMovimiento)
    private readonly kardexRepo: Repository<KardexMovimiento>,

    private readonly dataSource: DataSource,
  ) {}

  // ══════════════════════════════════════════════════════════════════════════
  // Método público — actualiza stock Y registra el movimiento (producto)
  // ══════════════════════════════════════════════════════════════════════════

  async registrarMovimiento(
    dto: CreateKardexDto,
    usuarioId?: number,
  ): Promise<KardexMovimiento> {
    return this.dataSource.transaction(async (manager) => {
      const producto = await manager.findOneBy(Producto, { id_producto: dto.producto_id });
      if (!producto) {
        throw new NotFoundException(`Producto #${dto.producto_id} no encontrado`);
      }

      const stockAnterior = Number(producto.stock);
      let stockNuevo: number;

      if (dto.tipo === 'entrada') {
        stockNuevo = stockAnterior + Number(dto.cantidad);
      } else if (dto.tipo === 'salida') {
        stockNuevo = stockAnterior - Number(dto.cantidad);
        if (stockNuevo < 0) {
          throw new BadRequestException(
            `Stock insuficiente. Actual: ${stockAnterior}, solicitado: ${dto.cantidad}`,
          );
        }
      } else {
        // ajuste: cantidad = nuevo stock absoluto
        stockNuevo = Number(dto.cantidad);
      }

      await manager.query(
        'UPDATE productos SET stock = $1 WHERE id_producto = $2',
        [stockNuevo, dto.producto_id],
      );

      const result = await manager.query(
        `INSERT INTO kardex_movimientos
           (tipo, cantidad, motivo, stock_anterior, stock_nuevo,
            producto_id, insumo_id, usuario_id, tipo_registro)
         VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, 'producto')
         RETURNING id_movimiento`,
        [dto.tipo, dto.cantidad, dto.motivo ?? null,
         stockAnterior, stockNuevo, dto.producto_id, usuarioId ?? null],
      );

      const movimiento = await manager.findOne(KardexMovimiento, {
        where: { id_movimiento: result[0].id_movimiento },
        relations: { producto: true, insumo: true, usuario: true },
      });

      if (!movimiento) throw new Error('Error al recuperar el movimiento insertado');
      return movimiento;
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Método público — registra movimiento de INSUMO y actualiza su stock
  // ══════════════════════════════════════════════════════════════════════════

  async registrarMovimientoInsumo(
    dto: { insumo_id: number; tipo: TipoMovimiento; cantidad: number; motivo?: string },
    usuarioId?: number,
  ): Promise<KardexMovimiento> {
    return this.dataSource.transaction(async (manager) => {
      const insumo = await manager.findOneBy(Insumo, { id_insumo: dto.insumo_id });
      if (!insumo) {
        throw new NotFoundException(`Insumo #${dto.insumo_id} no encontrado`);
      }

      const stockAnterior = Number(insumo.stock);
      let stockNuevo: number;

      if (dto.tipo === 'entrada') {
        stockNuevo = stockAnterior + Number(dto.cantidad);
      } else if (dto.tipo === 'salida') {
        stockNuevo = stockAnterior - Number(dto.cantidad);
        if (stockNuevo < 0) {
          throw new BadRequestException(
            `Stock insuficiente. Actual: ${stockAnterior}, solicitado: ${dto.cantidad}`,
          );
        }
      } else {
        stockNuevo = Number(dto.cantidad);
      }

      await manager.query(
        'UPDATE insumos SET stock = $1 WHERE id_insumo = $2',
        [stockNuevo, dto.insumo_id],
      );

      const result = await manager.query(
        `INSERT INTO kardex_movimientos
           (tipo, cantidad, motivo, stock_anterior, stock_nuevo,
            producto_id, insumo_id, usuario_id, tipo_registro)
         VALUES ($1, $2, $3, $4, $5, NULL, $6, $7, 'insumo')
         RETURNING id_movimiento`,
        [dto.tipo, dto.cantidad, dto.motivo ?? null,
         stockAnterior, stockNuevo, dto.insumo_id, usuarioId ?? null],
      );

      const movimiento = await manager.findOne(KardexMovimiento, {
        where: { id_movimiento: result[0].id_movimiento },
        relations: { producto: true, insumo: true, usuario: true },
      });

      if (!movimiento) throw new Error('Error al recuperar el movimiento insertado');
      return movimiento;
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Método interno — solo registra el log (NO toca producto.stock)
  // Usado por ProductoService cuando él mismo ya actualizó el stock
  // ══════════════════════════════════════════════════════════════════════════

  async crearRegistro(
    tipo: TipoMovimiento,
    cantidad: number,
    stockAnterior: number,
    stockNuevo: number,
    productoId: number,
    motivo?: string,
    usuarioId?: number,
  ): Promise<KardexMovimiento> {
    const result = await this.dataSource.query(
      `INSERT INTO kardex_movimientos
         (tipo, cantidad, motivo, stock_anterior, stock_nuevo,
          producto_id, insumo_id, usuario_id, tipo_registro)
       VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, 'producto')
       RETURNING id_movimiento`,
      [
        tipo,
        cantidad,
        motivo ?? null,
        stockAnterior,
        stockNuevo,
        productoId,
        usuarioId ?? null,
      ],
    );

    const movimiento = await this.kardexRepo.findOne({
      where: { id_movimiento: result[0].id_movimiento },
      relations: { producto: true, insumo: true, usuario: true },
    });

    if (!movimiento) throw new Error('Error al recuperar el movimiento insertado');
    return movimiento;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Consultas
  // ══════════════════════════════════════════════════════════════════════════

  async getMovimientos(id_producto?: number, page = 1, limit = 30) {
    const [data, total] = await this.kardexRepo.findAndCount({
      where: id_producto
        ? { producto: { id_producto } }
        : {},
      relations: { producto: true, insumo: true, usuario: true },
      order: { fecha: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return paginate(data, total, page, limit);
  }

  getMovimientosByProducto(id_producto: number): Promise<KardexMovimiento[]> {
    return this.kardexRepo.find({
      where: { producto: { id_producto } },
      relations: { producto: true, insumo: true, usuario: true },
      order: { fecha: 'DESC' },
    });
  }

  getMovimientosByInsumo(id_insumo: number): Promise<KardexMovimiento[]> {
    return this.kardexRepo.find({
      where: { insumo: { id_insumo } },
      relations: { producto: true, insumo: true, usuario: true },
      order: { fecha: 'DESC' },
    });
  }
}
