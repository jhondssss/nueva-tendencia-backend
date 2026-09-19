import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TipoCalzado } from './entities/tipo-calzado.entity';
import { CreateTipoCalzadoDto } from './dto/create-tipo-calzado.dto';
import { UpdateTipoCalzadoDto } from './dto/update-tipo-calzado.dto';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { fkViolationTable } from '../common/db-errors';

@Injectable()
export class TipoCalzadoService {
  constructor(
    @InjectRepository(TipoCalzado)
    private readonly tipoCalzadoRepo: Repository<TipoCalzado>,

    private readonly auditoriaService: AuditoriaService,
  ) {}

  findAll(): Promise<TipoCalzado[]> {
    return this.tipoCalzadoRepo.find({ order: { nombre: 'ASC' } });
  }

  async findOne(id: number): Promise<TipoCalzado> {
    const tipoCalzado = await this.tipoCalzadoRepo.findOne({ where: { id_tipo_calzado: id } });
    if (!tipoCalzado) throw new NotFoundException(`Tipo de calzado #${id} no encontrado`);
    return tipoCalzado;
  }

  private async validarNombreUnico(nombre: string, excluirId?: number): Promise<void> {
    const qb = this.tipoCalzadoRepo
      .createQueryBuilder('c')
      .where('LOWER(TRIM(c.nombre)) = LOWER(TRIM(:nombre))', { nombre });
    if (excluirId !== undefined) {
      qb.andWhere('c.id_tipo_calzado != :excluirId', { excluirId });
    }
    const existente = await qb.getOne();
    if (existente) {
      throw new ConflictException(
        `Ya existe un tipo de calzado con el nombre "${existente.nombre}" (#${existente.id_tipo_calzado})`,
      );
    }
  }

  async create(dto: CreateTipoCalzadoDto, usuarioId?: number): Promise<TipoCalzado> {
    await this.validarNombreUnico(dto.nombre);

    const tipoCalzado = this.tipoCalzadoRepo.create({
      ...dto,
      activo: dto.activo ?? true,
    });
    const saved = await this.tipoCalzadoRepo.save(tipoCalzado);

    void this.auditoriaService.registrar({
      accion: 'CREATE',
      modulo: 'tipos_calzado',
      descripcion: `Creó tipo de calzado "${saved.nombre}" #${saved.id_tipo_calzado}`,
      usuarioId,
    });

    return saved;
  }

  async update(id: number, dto: UpdateTipoCalzadoDto, usuarioId?: number): Promise<TipoCalzado> {
    const tipoCalzado = await this.findOne(id);

    if (dto.nombre) {
      await this.validarNombreUnico(dto.nombre, id);
    }

    Object.assign(tipoCalzado, dto);
    const saved = await this.tipoCalzadoRepo.save(tipoCalzado);

    void this.auditoriaService.registrar({
      accion: 'UPDATE',
      modulo: 'tipos_calzado',
      descripcion: `Actualizó tipo de calzado "${saved.nombre}" #${id}`,
      usuarioId,
    });

    return saved;
  }

  async remove(id: number, usuarioId?: number): Promise<void> {
    const tipoCalzado = await this.findOne(id);

    try {
      await this.tipoCalzadoRepo.delete(id);
    } catch (err) {
      const tabla = fkViolationTable(err);
      if (tabla === 'productos') {
        throw new ConflictException(
          'No se puede eliminar este tipo de calzado porque hay productos que lo usan; reasigná esos productos antes de eliminarlo',
        );
      }
      throw err;
    }

    void this.auditoriaService.registrar({
      accion: 'DELETE',
      modulo: 'tipos_calzado',
      descripcion: `Eliminó tipo de calzado "${tipoCalzado.nombre}" #${id}`,
      usuarioId,
    });
  }
}
