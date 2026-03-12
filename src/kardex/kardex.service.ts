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

@Injectable()
export class KardexService {
  constructor(
    @InjectRepository(KardexMovimiento)
    private readonly kardexRepo: Repository<KardexMovimiento>,

    @InjectRepository(Producto)
    private readonly productoRepo: Repository<Producto>,

    @InjectRepository(Insumo)
    private readonly insumoRepo: Repository<Insumo>,

    private readonly dataSource: DataSource,
  ) {}

  // ══════════════════════════════════════════════════════════════════════════
  // Método público — actualiza stock Y registra el movimiento (producto)
  // ══════════════════════════════════════════════════════════════════════════

  async registrarMovimiento(
    dto: CreateKardexDto,
    usuarioId?: number,
  ): Promise<KardexMovimiento> {
    const producto = await this.productoRepo.findOneBy({ id_producto: dto.producto_id });
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

    await this.dataSource.query(
      'UPDATE productos SET stock = ? WHERE id_producto = ?',
      [stockNuevo, dto.producto_id],
    );

    return this.crearRegistro(
      dto.tipo,
      dto.cantidad,
      stockAnterior,
      stockNuevo,
      dto.producto_id,
      dto.motivo,
      usuarioId,
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Método público — registra movimiento de INSUMO y actualiza su stock
  // ══════════════════════════════════════════════════════════════════════════

  async registrarMovimientoInsumo(
    dto: { insumo_id: number; tipo: TipoMovimiento; cantidad: number; motivo?: string },
    usuarioId?: number,
  ): Promise<KardexMovimiento> {
    const insumo = await this.insumoRepo.findOneBy({ id_insumo: dto.insumo_id });
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

    await this.dataSource.query(
      'UPDATE insumos SET stock = ? WHERE id_insumo = ?',
      [stockNuevo, dto.insumo_id],
    );

    const result = await this.dataSource.query(
      `INSERT INTO kardex_movimientos
         (tipo, cantidad, motivo, stock_anterior, stock_nuevo,
          producto_id, insumo_id, usuario_id, tipo_registro)
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?, 'insumo')`,
      [
        dto.tipo,
        dto.cantidad,
        dto.motivo ?? null,
        stockAnterior,
        stockNuevo,
        dto.insumo_id,
        usuarioId ?? null,
      ],
    );

    const movimiento = await this.kardexRepo.findOne({
      where: { id_movimiento: result.insertId },
      relations: { producto: true, insumo: true, usuario: true },
    });

    if (!movimiento) throw new Error('Error al recuperar el movimiento insertado');
    return movimiento;
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
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?, 'producto')`,
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
      where: { id_movimiento: result.insertId },
      relations: { producto: true, insumo: true, usuario: true },
    });

    if (!movimiento) throw new Error('Error al recuperar el movimiento insertado');
    return movimiento;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Consultas
  // ══════════════════════════════════════════════════════════════════════════

  async getMovimientos(id_producto?: number): Promise<KardexMovimiento[]> {
    return this.kardexRepo.find({
      where: id_producto
        ? { tipo_registro: 'insumo', producto: { id_producto } }
        : { tipo_registro: 'insumo' },
      relations: { producto: true, insumo: true, usuario: true },
      order: { fecha: 'DESC' },
    });
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
