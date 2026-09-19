import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Genero } from './entities/genero.entity';
import { CreateGeneroDto } from './dto/create-genero.dto';
import { UpdateGeneroDto } from './dto/update-genero.dto';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { fkViolationTable } from '../common/db-errors';

@Injectable()
export class GeneroService {
  constructor(
    @InjectRepository(Genero)
    private readonly generoRepo: Repository<Genero>,

    private readonly auditoriaService: AuditoriaService,
  ) {}

  findAll(): Promise<Genero[]> {
    return this.generoRepo.find({ order: { nombre: 'ASC' } });
  }

  async findOne(id: number): Promise<Genero> {
    const genero = await this.generoRepo.findOne({ where: { id_genero: id } });
    if (!genero) throw new NotFoundException(`Género #${id} no encontrado`);
    return genero;
  }

  private async validarNombreUnico(nombre: string, excluirId?: number): Promise<void> {
    const qb = this.generoRepo
      .createQueryBuilder('c')
      .where('LOWER(TRIM(c.nombre)) = LOWER(TRIM(:nombre))', { nombre });
    if (excluirId !== undefined) {
      qb.andWhere('c.id_genero != :excluirId', { excluirId });
    }
    const existente = await qb.getOne();
    if (existente) {
      throw new ConflictException(
        `Ya existe un género con el nombre "${existente.nombre}" (#${existente.id_genero})`,
      );
    }
  }

  async create(dto: CreateGeneroDto, usuarioId?: number): Promise<Genero> {
    await this.validarNombreUnico(dto.nombre);

    const genero = this.generoRepo.create({
      ...dto,
      activo: dto.activo ?? true,
    });
    const saved = await this.generoRepo.save(genero);

    void this.auditoriaService.registrar({
      accion: 'CREATE',
      modulo: 'generos',
      descripcion: `Creó género "${saved.nombre}" #${saved.id_genero}`,
      usuarioId,
    });

    return saved;
  }

  async update(id: number, dto: UpdateGeneroDto, usuarioId?: number): Promise<Genero> {
    const genero = await this.findOne(id);

    if (dto.nombre) {
      await this.validarNombreUnico(dto.nombre, id);
    }

    Object.assign(genero, dto);
    const saved = await this.generoRepo.save(genero);

    void this.auditoriaService.registrar({
      accion: 'UPDATE',
      modulo: 'generos',
      descripcion: `Actualizó género "${saved.nombre}" #${id}`,
      usuarioId,
    });

    return saved;
  }

  async remove(id: number, usuarioId?: number): Promise<void> {
    const genero = await this.findOne(id);

    try {
      await this.generoRepo.delete(id);
    } catch (err) {
      const tabla = fkViolationTable(err);
      if (tabla === 'productos') {
        throw new ConflictException(
          'No se puede eliminar este género porque hay productos que lo usan; reasigná esos productos antes de eliminarlo',
        );
      }
      throw err;
    }

    void this.auditoriaService.registrar({
      accion: 'DELETE',
      modulo: 'generos',
      descripcion: `Eliminó género "${genero.nombre}" #${id}`,
      usuarioId,
    });
  }
}
