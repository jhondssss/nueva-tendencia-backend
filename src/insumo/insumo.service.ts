import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Insumo } from './entities/insumo.entity';
import { CategoriaInsumo } from '../categoria-insumo/entities/categoria-insumo.entity';
import { UnidadMedida } from '../unidad-medida/entities/unidad-medida.entity';
import { CreateInsumoDto } from './dto/create-insumo.dto';
import { UpdateInsumoDto } from './dto/update-insumo.dto';
import { KardexService } from '../kardex/kardex.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { TelegramService } from '../telegram/telegram.service';
import { esStockCritico, condicionStockCritico } from '../common/stock-critico';
import { fkViolationTable } from '../common/db-errors';

@Injectable()
export class InsumoService {
  constructor(
    @InjectRepository(Insumo)
    private readonly insumoRepo: Repository<Insumo>,

    @InjectRepository(CategoriaInsumo)
    private readonly categoriaInsumoRepo: Repository<CategoriaInsumo>,

    @InjectRepository(UnidadMedida)
    private readonly unidadMedidaRepo: Repository<UnidadMedida>,

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
      .where(condicionStockCritico('i'))
      .orderBy('i.nombre', 'ASC')
      .getMany();
  }

  private async validarRolFormulaDisponible(
    rol: 'clefa' | 'pasta' | 'cuero' | 'esponja' | 'pvc',
    excluirId?: number,
  ): Promise<void> {
    const existente = await this.insumoRepo.findOne({ where: { rol_formula: rol } });
    if (existente && existente.id_insumo !== excluirId) {
      throw new ConflictException(
        `Ya existe un insumo con rol '${rol}': "${existente.nombre}" (#${existente.id_insumo})`,
      );
    }
  }

  private async validarCategoriaExiste(categoriaId: number): Promise<void> {
    const existe = await this.categoriaInsumoRepo.findOne({ where: { id_categoria_insumo: categoriaId } });
    if (!existe) {
      throw new NotFoundException(`Categoría de insumo #${categoriaId} no encontrada`);
    }
  }

  private async validarUnidadMedidaExiste(unidadMedidaId: number): Promise<void> {
    const existe = await this.unidadMedidaRepo.findOne({ where: { id_unidad_medida: unidadMedidaId } });
    if (!existe) {
      throw new NotFoundException(`Unidad de medida #${unidadMedidaId} no encontrada`);
    }
  }

  private async validarNombreUnico(nombre: string, excluirId?: number): Promise<void> {
    const qb = this.insumoRepo
      .createQueryBuilder('i')
      .where('LOWER(TRIM(i.nombre)) = LOWER(TRIM(:nombre))', { nombre });
    if (excluirId !== undefined) {
      qb.andWhere('i.id_insumo != :excluirId', { excluirId });
    }
    const existente = await qb.getOne();
    if (existente) {
      throw new ConflictException(
        `Ya existe un insumo con el nombre "${existente.nombre}" (#${existente.id_insumo})`,
      );
    }
  }

  async create(dto: CreateInsumoDto, usuarioId?: number): Promise<Insumo> {
    const stockInicial = dto.stock ?? 0;

    await this.validarNombreUnico(dto.nombre);
    await this.validarCategoriaExiste(dto.categoria_id);
    await this.validarUnidadMedidaExiste(dto.unidad_medida_id);

    if (dto.rol_formula) {
      await this.validarRolFormulaDisponible(dto.rol_formula);
    }

    // Guardamos con stock = 0 para que registrarMovimientoInsumo haga el
    // tracking correcto desde 0 → stockInicial
    const { categoria_id, unidad_medida_id, ...resto } = dto;
    const insumo = this.insumoRepo.create({
      ...resto,
      categoria: { id_categoria_insumo: categoria_id } as CategoriaInsumo,
      unidad_medida: { id_unidad_medida: unidad_medida_id } as UnidadMedida,
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
    if (esStockCritico(result.stock, result.nivel_minimo)) {
      this.telegramService.sendMessage(
        `⚠️ Stock crítico\nInsumo: ${result.nombre}\nStock actual: ${result.stock}\nMínimo: ${result.nivel_minimo}`,
      ).catch(() => {});
    }
    return result;
  }

  async update(id: number, dto: UpdateInsumoDto, usuarioId?: number): Promise<Insumo> {
    const insumo = await this.findOne(id);
    const stockAnterior = Number(insumo.stock);

    if (dto.nombre) {
      await this.validarNombreUnico(dto.nombre, id);
    }

    if (dto.categoria_id !== undefined) {
      await this.validarCategoriaExiste(dto.categoria_id);
    }

    if (dto.unidad_medida_id !== undefined) {
      await this.validarUnidadMedidaExiste(dto.unidad_medida_id);
    }

    if (dto.rol_formula) {
      await this.validarRolFormulaDisponible(dto.rol_formula, id);
    }

    // Separar el stock, categoria_id y unidad_medida_id del resto de campos:
    // el stock se maneja vía kardex, categoria_id/unidad_medida_id se mapean
    // a las relaciones `categoria`/`unidad_medida`
    const { stock: nuevoStock, categoria_id, unidad_medida_id, ...camposResto } = dto;

    Object.assign(insumo, camposResto);
    if (categoria_id !== undefined) {
      insumo.categoria = { id_categoria_insumo: categoria_id } as CategoriaInsumo;
    }
    if (unidad_medida_id !== undefined) {
      insumo.unidad_medida = { id_unidad_medida: unidad_medida_id } as UnidadMedida;
    }
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
    if (esStockCritico(result.stock, result.nivel_minimo)) {
      this.telegramService.sendMessage(
        `⚠️ Stock crítico\nInsumo: ${result.nombre}\nStock actual: ${result.stock}\nMínimo: ${result.nivel_minimo}`,
      ).catch(() => {});
    }
    return result;
  }

  async remove(id: number, usuarioId?: number): Promise<void> {
    const insumo = await this.findOne(id);

    try {
      await this.insumoRepo.delete(id);
    } catch (err) {
      const tabla = fkViolationTable(err);
      if (tabla === 'pedidos') {
        throw new ConflictException(
          'No se puede eliminar este insumo porque está asignado como cuero a uno o más pedidos; quitá la asignación antes de eliminarlo',
        );
      }
      if (tabla) {
        throw new ConflictException('No se puede eliminar el insumo porque tiene datos asociados');
      }
      throw err;
    }

    void this.auditoriaService.registrar({
      accion: 'DELETE',
      modulo: 'insumos',
      descripcion: `Eliminó insumo "${insumo.nombre}" #${id}`,
      usuarioId,
    });
  }
}
