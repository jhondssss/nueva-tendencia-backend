import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CategoriaInsumo } from './entities/categoria-insumo.entity';
import { CreateCategoriaInsumoDto } from './dto/create-categoria-insumo.dto';
import { UpdateCategoriaInsumoDto } from './dto/update-categoria-insumo.dto';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { fkViolationTable } from '../common/db-errors';

@Injectable()
export class CategoriaInsumoService {
  constructor(
    @InjectRepository(CategoriaInsumo)
    private readonly categoriaInsumoRepo: Repository<CategoriaInsumo>,

    private readonly auditoriaService: AuditoriaService,
  ) {}

  findAll(): Promise<CategoriaInsumo[]> {
    return this.categoriaInsumoRepo.find({ order: { nombre: 'ASC' } });
  }

  async findOne(id: number): Promise<CategoriaInsumo> {
    const categoria = await this.categoriaInsumoRepo.findOne({ where: { id_categoria_insumo: id } });
    if (!categoria) throw new NotFoundException(`Categoría de insumo #${id} no encontrada`);
    return categoria;
  }

  private async validarNombreUnico(nombre: string, excluirId?: number): Promise<void> {
    const qb = this.categoriaInsumoRepo
      .createQueryBuilder('c')
      .where('LOWER(TRIM(c.nombre)) = LOWER(TRIM(:nombre))', { nombre });
    if (excluirId !== undefined) {
      qb.andWhere('c.id_categoria_insumo != :excluirId', { excluirId });
    }
    const existente = await qb.getOne();
    if (existente) {
      throw new ConflictException(
        `Ya existe una categoría de insumo con el nombre "${existente.nombre}" (#${existente.id_categoria_insumo})`,
      );
    }
  }

  async create(dto: CreateCategoriaInsumoDto, usuarioId?: number): Promise<CategoriaInsumo> {
    await this.validarNombreUnico(dto.nombre);

    const categoria = this.categoriaInsumoRepo.create({
      ...dto,
      activo: dto.activo ?? true,
    });
    const saved = await this.categoriaInsumoRepo.save(categoria);

    void this.auditoriaService.registrar({
      accion: 'CREATE',
      modulo: 'categorias_insumo',
      descripcion: `Creó categoría de insumo "${saved.nombre}" #${saved.id_categoria_insumo}`,
      usuarioId,
    });

    return saved;
  }

  async update(id: number, dto: UpdateCategoriaInsumoDto, usuarioId?: number): Promise<CategoriaInsumo> {
    const categoria = await this.findOne(id);

    if (dto.nombre) {
      await this.validarNombreUnico(dto.nombre, id);
    }

    Object.assign(categoria, dto);
    const saved = await this.categoriaInsumoRepo.save(categoria);

    void this.auditoriaService.registrar({
      accion: 'UPDATE',
      modulo: 'categorias_insumo',
      descripcion: `Actualizó categoría de insumo "${saved.nombre}" #${id}`,
      usuarioId,
    });

    return saved;
  }

  async remove(id: number, usuarioId?: number): Promise<void> {
    const categoria = await this.findOne(id);

    try {
      await this.categoriaInsumoRepo.delete(id);
    } catch (err) {
      const tabla = fkViolationTable(err);
      if (tabla === 'insumos') {
        throw new ConflictException(
          'No se puede eliminar esta categoría porque hay insumos que la usan; reasigná esos insumos antes de eliminarla',
        );
      }
      throw err;
    }

    void this.auditoriaService.registrar({
      accion: 'DELETE',
      modulo: 'categorias_insumo',
      descripcion: `Eliminó categoría de insumo "${categoria.nombre}" #${id}`,
      usuarioId,
    });
  }
}
