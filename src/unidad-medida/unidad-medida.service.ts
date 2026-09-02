import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UnidadMedida } from './entities/unidad-medida.entity';
import { CreateUnidadMedidaDto } from './dto/create-unidad-medida.dto';
import { UpdateUnidadMedidaDto } from './dto/update-unidad-medida.dto';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { fkViolationTable } from '../common/db-errors';

@Injectable()
export class UnidadMedidaService {
  constructor(
    @InjectRepository(UnidadMedida)
    private readonly unidadMedidaRepo: Repository<UnidadMedida>,

    private readonly auditoriaService: AuditoriaService,
  ) {}

  findAll(): Promise<UnidadMedida[]> {
    return this.unidadMedidaRepo.find({ order: { nombre: 'ASC' } });
  }

  async findOne(id: number): Promise<UnidadMedida> {
    const unidad = await this.unidadMedidaRepo.findOne({ where: { id_unidad_medida: id } });
    if (!unidad) throw new NotFoundException(`Unidad de medida #${id} no encontrada`);
    return unidad;
  }

  private async validarNombreUnico(nombre: string, excluirId?: number): Promise<void> {
    const qb = this.unidadMedidaRepo
      .createQueryBuilder('u')
      .where('LOWER(TRIM(u.nombre)) = LOWER(TRIM(:nombre))', { nombre });
    if (excluirId !== undefined) {
      qb.andWhere('u.id_unidad_medida != :excluirId', { excluirId });
    }
    const existente = await qb.getOne();
    if (existente) {
      throw new ConflictException(
        `Ya existe una unidad de medida con el nombre "${existente.nombre}" (#${existente.id_unidad_medida})`,
      );
    }
  }

  async create(dto: CreateUnidadMedidaDto, usuarioId?: number): Promise<UnidadMedida> {
    await this.validarNombreUnico(dto.nombre);

    const unidad = this.unidadMedidaRepo.create({
      ...dto,
      activo: dto.activo ?? true,
    });
    const saved = await this.unidadMedidaRepo.save(unidad);

    void this.auditoriaService.registrar({
      accion: 'CREATE',
      modulo: 'unidades_medida',
      descripcion: `Creó unidad de medida "${saved.nombre}" #${saved.id_unidad_medida}`,
      usuarioId,
    });

    return saved;
  }

  async update(id: number, dto: UpdateUnidadMedidaDto, usuarioId?: number): Promise<UnidadMedida> {
    const unidad = await this.findOne(id);

    if (dto.nombre) {
      await this.validarNombreUnico(dto.nombre, id);
    }

    Object.assign(unidad, dto);
    const saved = await this.unidadMedidaRepo.save(unidad);

    void this.auditoriaService.registrar({
      accion: 'UPDATE',
      modulo: 'unidades_medida',
      descripcion: `Actualizó unidad de medida "${saved.nombre}" #${id}`,
      usuarioId,
    });

    return saved;
  }

  async remove(id: number, usuarioId?: number): Promise<void> {
    const unidad = await this.findOne(id);

    try {
      await this.unidadMedidaRepo.delete(id);
    } catch (err) {
      const tabla = fkViolationTable(err);
      if (tabla === 'insumos') {
        throw new ConflictException(
          'No se puede eliminar esta unidad de medida porque hay insumos que la usan; reasigná esos insumos antes de eliminarla',
        );
      }
      throw err;
    }

    void this.auditoriaService.registrar({
      accion: 'DELETE',
      modulo: 'unidades_medida',
      descripcion: `Eliminó unidad de medida "${unidad.nombre}" #${id}`,
      usuarioId,
    });
  }
}
