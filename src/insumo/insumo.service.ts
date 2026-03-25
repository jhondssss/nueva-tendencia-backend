import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Insumo } from './entities/insumo.entity';
import { CreateInsumoDto } from './dto/create-insumo.dto';
import { UpdateInsumoDto } from './dto/update-insumo.dto';
import { KardexService } from '../kardex/kardex.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { TelegramService } from '../telegram/telegram.service';

@Injectable()
export class InsumoService {
  constructor(
    @InjectRepository(Insumo)
    private readonly insumoRepo: Repository<Insumo>,

    private readonly kardexService: KardexService,
    private readonly auditoriaService: AuditoriaService,
    private readonly telegramService: TelegramService,
  ) {}

  findAll(): Promise<Insumo[]> {
    return this.insumoRepo.find({ order: { nombre: 'ASC' } });
  }

  async findOne(id: number): Promise<Insumo> {
    const insumo = await this.insumoRepo.findOne({ where: { id_insumo: id } });
    if (!insumo) throw new NotFoundException(`Insumo #${id} no encontrado`);
    return insumo;
  }

  findAlertas(): Promise<Insumo[]> {
    return this.insumoRepo
      .createQueryBuilder('i')
      .where('i.stock <= i.nivel_minimo')
      .orderBy('i.nombre', 'ASC')
      .getMany();
  }

  async create(dto: CreateInsumoDto, usuarioId?: number): Promise<Insumo> {
    const stockInicial = dto.stock ?? 0;

    // Guardamos con stock = 0 para que registrarMovimientoInsumo haga el
    // tracking correcto desde 0 → stockInicial
    const insumo = this.insumoRepo.create({
      ...dto,
      stock: 0,
      nivel_minimo: dto.nivel_minimo ?? 0,
      precio_unitario: dto.precio_unitario ?? 0,
      activo: dto.activo ?? true,
    });
    const saved = await this.insumoRepo.save(insumo);

    // Registrar entrada inicial en kardex (actualiza stock a stockInicial)
    if (stockInicial > 0) {
      await this.kardexService.registrarMovimientoInsumo(
        {
          insumo_id: saved.id_insumo,
          tipo: 'entrada',
          cantidad: stockInicial,
          motivo: 'Stock inicial al crear insumo',
        },
        usuarioId,
      );
    }

    void this.auditoriaService.registrar({
      accion: 'CREATE',
      modulo: 'insumos',
      descripcion: `Creó insumo "${saved.nombre}" #${saved.id_insumo}`,
      usuarioId,
    });

    const result = await this.findOne(saved.id_insumo);
    if (Number(result.stock) <= Number(result.nivel_minimo)) {
      this.telegramService.sendMessage(
        `⚠️ Stock crítico\nInsumo: ${result.nombre}\nStock actual: ${result.stock}\nMínimo: ${result.nivel_minimo}`,
      ).catch(() => {});
    }
    return result;
  }

  async update(id: number, dto: UpdateInsumoDto, usuarioId?: number): Promise<Insumo> {
    const insumo = await this.findOne(id);
    const stockAnterior = Number(insumo.stock);

    // Separar el stock del resto de campos para manejarlo vía kardex
    const { stock: nuevoStock, ...camposResto } = dto;

    Object.assign(insumo, camposResto);
    await this.insumoRepo.save(insumo);

    // Si cambió el stock, delegar actualización al kardex (que actualiza el stock)
    if (nuevoStock !== undefined && nuevoStock !== stockAnterior) {
      await this.kardexService.registrarMovimientoInsumo(
        {
          insumo_id: id,
          tipo: 'ajuste',
          cantidad: nuevoStock,
          motivo: 'Ajuste manual de stock',
        },
        usuarioId,
      );
    }

    void this.auditoriaService.registrar({
      accion: 'UPDATE',
      modulo: 'insumos',
      descripcion: `Actualizó insumo "${insumo.nombre}" #${id}`,
      usuarioId,
    });

    const result = await this.findOne(id);
    if (Number(result.stock) <= Number(result.nivel_minimo)) {
      this.telegramService.sendMessage(
        `⚠️ Stock crítico\nInsumo: ${result.nombre}\nStock actual: ${result.stock}\nMínimo: ${result.nivel_minimo}`,
      ).catch(() => {});
    }
    return result;
  }

  async remove(id: number, usuarioId?: number): Promise<void> {
    const insumo = await this.findOne(id);
    await this.insumoRepo.delete(id);

    void this.auditoriaService.registrar({
      accion: 'DELETE',
      modulo: 'insumos',
      descripcion: `Eliminó insumo "${insumo.nombre}" #${id}`,
      usuarioId,
    });
  }
}
