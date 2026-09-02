import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CategoriaProducto } from './entities/categoria-producto.entity';
import { CreateCategoriaProductoDto } from './dto/create-categoria-producto.dto';
import { UpdateCategoriaProductoDto } from './dto/update-categoria-producto.dto';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { fkViolationTable } from '../common/db-errors';

@Injectable()
export class CategoriaProductoService {
  constructor(
    @InjectRepository(CategoriaProducto)
    private readonly categoriaProductoRepo: Repository<CategoriaProducto>,

    private readonly auditoriaService: AuditoriaService,
  ) {}

  findAll(): Promise<CategoriaProducto[]> {
    return this.categoriaProductoRepo.find({ order: { nombre: 'ASC' } });
  }

  async findOne(id: number): Promise<CategoriaProducto> {
    const categoria = await this.categoriaProductoRepo.findOne({ where: { id_categoria_producto: id } });
    if (!categoria) throw new NotFoundException(`Categoría de producto #${id} no encontrada`);
    return categoria;
  }

  private async validarNombreUnico(nombre: string, excluirId?: number): Promise<void> {
    const qb = this.categoriaProductoRepo
      .createQueryBuilder('c')
      .where('LOWER(TRIM(c.nombre)) = LOWER(TRIM(:nombre))', { nombre });
    if (excluirId !== undefined) {
      qb.andWhere('c.id_categoria_producto != :excluirId', { excluirId });
    }
    const existente = await qb.getOne();
    if (existente) {
      throw new ConflictException(
        `Ya existe una categoría de producto con el nombre "${existente.nombre}" (#${existente.id_categoria_producto})`,
      );
    }
  }

  async create(dto: CreateCategoriaProductoDto, usuarioId?: number): Promise<CategoriaProducto> {
    await this.validarNombreUnico(dto.nombre);

    const categoria = this.categoriaProductoRepo.create({
      ...dto,
      activo: dto.activo ?? true,
    });
    const saved = await this.categoriaProductoRepo.save(categoria);

    void this.auditoriaService.registrar({
      accion: 'CREATE',
      modulo: 'categorias_producto',
      descripcion: `Creó categoría de producto "${saved.nombre}" #${saved.id_categoria_producto}`,
      usuarioId,
    });

    return saved;
  }

  async update(id: number, dto: UpdateCategoriaProductoDto, usuarioId?: number): Promise<CategoriaProducto> {
    const categoria = await this.findOne(id);

    if (dto.nombre) {
      await this.validarNombreUnico(dto.nombre, id);
    }

    Object.assign(categoria, dto);
    const saved = await this.categoriaProductoRepo.save(categoria);

    void this.auditoriaService.registrar({
      accion: 'UPDATE',
      modulo: 'categorias_producto',
      descripcion: `Actualizó categoría de producto "${saved.nombre}" #${id}`,
      usuarioId,
    });

    return saved;
  }

  async remove(id: number, usuarioId?: number): Promise<void> {
    const categoria = await this.findOne(id);

    try {
      await this.categoriaProductoRepo.delete(id);
    } catch (err) {
      const tabla = fkViolationTable(err);
      if (tabla === 'productos') {
        throw new ConflictException(
          'No se puede eliminar esta categoría porque hay productos que la usan; reasigná esos productos antes de eliminarla',
        );
      }
      throw err;
    }

    void this.auditoriaService.registrar({
      accion: 'DELETE',
      modulo: 'categorias_producto',
      descripcion: `Eliminó categoría de producto "${categoria.nombre}" #${id}`,
      usuarioId,
    });
  }
}
