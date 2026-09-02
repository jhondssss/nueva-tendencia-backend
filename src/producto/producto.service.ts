import { Injectable, ConflictException, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Producto } from './entities/producto.entity';
import { CategoriaProducto } from '../categoria-producto/entities/categoria-producto.entity';
import { SolicitudPedido } from '../solicitud-pedido/entities/solicitud-pedido.entity';
import { CreateProductoDto } from './dto/create-producto.dto';
import { UpdateProductoDto } from './dto/update-producto.dto';
import { ProductoCatalogoDto } from './dto/producto-catalogo.dto';
import { KardexService } from '../kardex/kardex.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { paginate } from '../common/pagination';
import { condicionStockCritico } from '../common/stock-critico';
import { fkViolationTable } from '../common/db-errors';

@Injectable()
export class ProductoService {
  private readonly logger = new Logger(ProductoService.name);

  constructor(
    @InjectRepository(Producto)
    private repo: Repository<Producto>,

    @InjectRepository(SolicitudPedido)
    private readonly solicitudRepo: Repository<SolicitudPedido>,

    @InjectRepository(CategoriaProducto)
    private readonly categoriaProductoRepo: Repository<CategoriaProducto>,

    private readonly kardexService: KardexService,
    private readonly auditoriaService: AuditoriaService,
  ) {}

  private async validarCategoriaExiste(categoriaId: number): Promise<void> {
    const existe = await this.categoriaProductoRepo.findOne({ where: { id_categoria_producto: categoriaId } });
    if (!existe) {
      throw new NotFoundException(`Categoría de producto #${categoriaId} no encontrada`);
    }
  }

  async create(dto: CreateProductoDto, usuarioId?: number) {
    const existente = await this.repo.findOne({
      where: { nombre_modelo: dto.nombre_modelo, marca: dto.marca },
    });
    if (existente) {
      throw new ConflictException('Ya existe un producto con ese nombre y marca');
    }

    if (dto.categoria_id !== undefined) {
      await this.validarCategoriaExiste(dto.categoria_id);
    }

    const { categoria_id, ...resto } = dto;
    const producto = this.repo.create({
      ...resto,
      categoria: categoria_id !== undefined ? ({ id_categoria_producto: categoria_id } as CategoriaProducto) : null,
    } as any);
    const saved = await this.repo.save(producto) as unknown as Producto;

    // Registrar stock inicial como 'entrada' si es mayor a 0
    if (saved.stock > 0) {
      await this.kardexService.crearRegistro(
        'entrada',
        saved.stock,
        0,
        saved.stock,
        saved.id_producto,
        'Stock inicial al crear producto',
        usuarioId,
      );
    }

    void this.auditoriaService.registrar({
      accion: 'CREATE',
      modulo: 'productos',
      descripcion: `Creó producto ${saved.nombre_modelo}`,
      usuarioId,
    });

    return saved;
  }

  findAll() {
    return this.repo.find();
  }

  findOne(id: number) {
    return this.repo.findOne({ where: { id_producto: id } });
  }

  async update(id: number, dto: UpdateProductoDto, usuarioId?: number) {
    this.logger.debug(`activo tras transform: ${dto.activo} (${typeof dto.activo})`);
    const actual = await this.findOne(id);

    if (dto.categoria_id !== undefined) {
      await this.validarCategoriaExiste(dto.categoria_id);
    }

    // Separar stock y categoria_id del resto de campos: el stock se maneja
    // aparte vía kardex, categoria_id se mapea a la relación `categoria`
    const { stock: newStock, categoria_id, ...camposResto } = dto as any;

    // Actualizar campos que no son stock directamente
    if (Object.keys(camposResto).length > 0) {
      await this.repo.update({ id_producto: id }, camposResto);
    }

    if (categoria_id !== undefined) {
      await this.repo.update({ id_producto: id }, { categoria: { id_categoria_producto: categoria_id } as CategoriaProducto });
    }

    // Si el stock cambió, actualizar y registrar en kardex
    if (newStock !== undefined) {
      if (!actual || newStock !== actual.stock) {
        // Actualizar el stock del producto
        await this.repo.update({ id_producto: id }, { stock: newStock });

        // Registrar el movimiento (sin que kardex vuelva a tocar el stock)
        await this.kardexService.crearRegistro(
          'ajuste',
          newStock,
          actual?.stock ?? 0,
          newStock,
          id,
          'Ajuste manual vía edición de producto',
          usuarioId,
        );
      } else {
        // Stock igual, solo persistir por si acaso
        await this.repo.update({ id_producto: id }, { stock: newStock });
      }
    }

    const nombre = (dto as any).nombre_modelo ?? actual?.nombre_modelo ?? `ID ${id}`;
    void this.auditoriaService.registrar({
      accion: 'UPDATE',
      modulo: 'productos',
      descripcion: `Actualizó producto ${nombre}`,
      usuarioId,
    });

    return this.findOne(id);
  }

  async remove(id: number) {
    const producto = await this.findOne(id);
    if (!producto) {
      throw new NotFoundException(`Producto #${id} no encontrado`);
    }
    const nombre = producto.nombre_modelo;

    const solicitudPendiente = await this.solicitudRepo.findOne({
      where: { producto: { id_producto: id }, estado: 'Pendiente' },
    });
    if (solicitudPendiente) {
      throw new ConflictException(
        'Este producto tiene solicitudes de pedido pendientes, resolvelas antes de eliminarlo',
      );
    }

    let result;
    try {
      result = await this.repo.delete({ id_producto: id });
    } catch (err) {
      const tabla = fkViolationTable(err);
      if (tabla === 'pedidos') {
        throw new ConflictException('No se puede eliminar el producto porque tiene pedidos asociados');
      }
      if (tabla) {
        throw new ConflictException('No se puede eliminar el producto porque tiene datos asociados');
      }
      throw err;
    }
    void this.auditoriaService.registrar({
      accion: 'DELETE',
      modulo: 'productos',
      descripcion: `Eliminó producto ${nombre}`,
    });
    return result;
  }

  async productosConAlerta() {
    return this.repo
      .createQueryBuilder('producto')
      .where(condicionStockCritico('producto'))
      .getMany();
  }

  async findCatalogo(page = 1, limit = 12) {
    const [productos, total] = await this.repo
      .createQueryBuilder('producto')
      .leftJoinAndSelect('producto.categoria', 'categoria')
      .where('producto.activo = true')
      .andWhere('producto.categoria_producto_id IS NOT NULL')
      .orderBy('producto.id_producto', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const data: ProductoCatalogoDto[] = productos.map((producto) => ({
      id_producto: producto.id_producto,
      nombre: producto.nombre_modelo,
      descripcion: producto.descripcion_corta,
      precio: producto.precio_venta,
      imagen: producto.imagen_url ?? null,
      categoria: producto.categoria!.nombre,
      disponible: producto.stock > 0,
    }));

    return paginate(data, total, page, limit);
  }
}
