import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Producto } from './entities/producto.entity';
import { CreateProductoDto } from './dto/create-producto.dto';
import { UpdateProductoDto } from './dto/update-producto.dto';
import { KardexService } from '../kardex/kardex.service';
import { AuditoriaService } from '../auditoria/auditoria.service';

@Injectable()
export class ProductoService {
  constructor(
    @InjectRepository(Producto)
    private repo: Repository<Producto>,

    private readonly kardexService: KardexService,
    private readonly auditoriaService: AuditoriaService,
  ) {}

  async create(dto: CreateProductoDto, usuarioId?: number) {
    const producto = this.repo.create(dto as any);
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
    console.log('ACTIVO DESPUÉS DE TRANSFORM:', dto.activo, typeof dto.activo);
    const actual = await this.findOne(id);

    // Separar stock del resto de campos para control independiente
    const { stock: newStock, ...camposResto } = dto as any;

    // Actualizar campos que no son stock directamente
    if (Object.keys(camposResto).length > 0) {
      await this.repo.update({ id_producto: id }, camposResto);
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
    const nombre = producto?.nombre_modelo ?? `ID ${id}`;
    const result = await this.repo.delete({ id_producto: id });
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
      .where('producto.stock <= producto.nivel_minimo')
      .getMany();
  }
}
