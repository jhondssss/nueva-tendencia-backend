import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TallaDetalle, CategoriaCalzado } from './entities/talla-detalle.entity';
import { DISTRIBUCION_TALLAS } from './talla.constants';

const RANGOS_CATEGORIA: Record<CategoriaCalzado, { min: number; max: number }> = {
  nino:    { min: 27, max: 32 },
  juvenil: { min: 33, max: 36 },
  adulto:  { min: 37, max: 42 },
};

@Injectable()
export class TallaService {
  constructor(
    @InjectRepository(TallaDetalle)
    private tallaRepository: Repository<TallaDetalle>,
  ) {}

  async generarTallasParaPedido(
    pedidoId: number,
    categoria: CategoriaCalzado,
    cantidadDocenas: number,
  ): Promise<TallaDetalle[]> {
    const distribucion = DISTRIBUCION_TALLAS[categoria];

    const talles = distribucion.map((config) =>
      this.tallaRepository.create({
        categoria,
        talla: config.talla,
        cantidad_pares: config.pares * cantidadDocenas,
        pedido: { id_pedido: pedidoId } as any,
        producto: null,
      }),
    );

    return this.tallaRepository.save(talles);
  }

  async actualizarTallasPersonalizadas(
    pedidoId: number,
    categoria: CategoriaCalzado,
    tallas: { talla: number; cantidad_pares: number }[],
  ): Promise<TallaDetalle[]> {
    const rango = RANGOS_CATEGORIA[categoria];

    const invalidas = tallas.filter(t => t.talla < rango.min || t.talla > rango.max);
    if (invalidas.length > 0) {
      const nums = invalidas.map(t => t.talla).join(', ');
      throw new BadRequestException(
        `Tallas fuera del rango para categoría "${categoria}" (${rango.min}–${rango.max}): ${nums}`,
      );
    }

    await this.tallaRepository.delete({ pedido: { id_pedido: pedidoId } });

    const nuevas = tallas.map(t =>
      this.tallaRepository.create({
        categoria,
        talla: t.talla,
        cantidad_pares: t.cantidad_pares,
        pedido: { id_pedido: pedidoId } as any,
        producto: null,
      }),
    );

    return this.tallaRepository.save(nuevas);
  }

  getTallasByPedido(pedidoId: number): Promise<TallaDetalle[]> {
    return this.tallaRepository.find({
      where: { pedido: { id_pedido: pedidoId } },
    });
  }

  getTallasByProducto(productoId: number): Promise<TallaDetalle[]> {
    return this.tallaRepository.find({
      where: { producto: { id_producto: productoId } },
    });
  }
}
