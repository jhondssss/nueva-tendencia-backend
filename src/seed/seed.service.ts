import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Pedido } from '../pedido/entities/pedido.entity';
import { TallaDetalle } from '../talla/entities/talla-detalle.entity';

type Estado = Pedido['estado'];
type Categoria = NonNullable<Pedido['categoria']>;
type Unidad = Pedido['unidad'];

@Injectable()
export class SeedService {
  constructor(
    @InjectRepository(Pedido) private readonly pedidoRepo: Repository<Pedido>,
    @InjectRepository(TallaDetalle) private readonly tallaRepo: Repository<TallaDetalle>,
    private readonly dataSource: DataSource,
  ) {}

  private rand(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private pick<T>(arr: T[]): T {
    return arr[this.rand(0, arr.length - 1)];
  }

  private shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  private addDays(date: Date, days: number): Date {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }

  private randomDateBetween(start: Date, end: Date): Date {
    const diff = end.getTime() - start.getTime();
    return new Date(start.getTime() + Math.random() * diff);
  }

  private tallaRangePorCategoria(categoria: Categoria): number[] {
    switch (categoria) {
      case 'nino':    return [22, 23, 24, 25, 26, 27, 28, 29, 30, 31];
      case 'juvenil': return [32, 33, 34, 35, 36];
      case 'adulto':  return [37, 38, 39, 40, 41, 42, 43];
    }
  }

  private distribuirTallas(
    tallas: number[],
    totalPares: number,
  ): { talla: number; cantidad_pares: number }[] {
    const maxTallas = Math.min(tallas.length, totalPares);
    if (maxTallas === 0) return [];

    const numTallas = this.rand(Math.min(3, maxTallas), maxTallas);
    const selected = this.shuffle(tallas).slice(0, numTallas).sort((a, b) => a - b);

    const result: { talla: number; cantidad_pares: number }[] = [];
    let remaining = totalPares;

    for (let i = 0; i < selected.length; i++) {
      const isLast = i === selected.length - 1;
      if (isLast) {
        result.push({ talla: selected[i], cantidad_pares: remaining });
        break;
      }
      const slotsLeft = selected.length - i;
      const maxForThis = remaining - (slotsLeft - 1);
      const pares = this.rand(1, Math.max(1, maxForThis));
      result.push({ talla: selected[i], cantidad_pares: pares });
      remaining -= pares;
      if (remaining <= 0) break;
    }

    return result;
  }

  private fechaCreacionParaEstado(estado: Estado, now: Date, threeMonthsAgo: Date): Date {
    switch (estado) {
      case 'Terminado':
        // Terminados tienden a ser pedidos más viejos
        return this.randomDateBetween(threeMonthsAgo, this.addDays(now, -25));
      case 'Pendiente':
        // Pendientes son recientes
        return this.randomDateBetween(this.addDays(now, -20), this.addDays(now, -1));
      case 'Empaque':
        return this.randomDateBetween(this.addDays(now, -35), this.addDays(now, -10));
      default:
        // Cortado, Aparado, Solado: rango medio
        return this.randomDateBetween(threeMonthsAgo, this.addDays(now, -10));
    }
  }

  async seedPedidos(): Promise<{ created: number; message: string }> {
    const now = new Date();
    const threeMonthsAgo = new Date(now);
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    // Distribución exacta de estados: 20/15/15/15/10/25 %
    const estadosPool: Estado[] = this.shuffle([
      ...Array<Estado>(12).fill('Pendiente'),
      ...Array<Estado>(9).fill('Cortado'),
      ...Array<Estado>(9).fill('Aparado'),
      ...Array<Estado>(9).fill('Solado'),
      ...Array<Estado>(6).fill('Empaque'),
      ...Array<Estado>(15).fill('Terminado'),
    ]);

    const clienteIds = [2, 3, 4, 5, 6, 7];
    const productoIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    const categorias: Categoria[] = ['adulto', 'adulto', 'juvenil', 'nino'];
    // docena es la más común en fabricación de calzado
    const unidades: Unidad[] = ['docena', 'docena', 'docena', 'media_docena', 'par'];

    let totalCreated = 0;

    for (let i = 0; i < 60; i++) {
      const estado = estadosPool[i];
      const categoria = this.pick(categorias);
      const unidad = this.pick(unidades);
      const cantidad = this.rand(1, 5);

      const cantidad_pares =
        unidad === 'docena'       ? cantidad * 12 :
        unidad === 'media_docena' ? cantidad * 6  :
        cantidad;

      const fechaCreacion = this.fechaCreacionParaEstado(estado, now, threeMonthsAgo);
      const fechaEntrega = this.addDays(fechaCreacion, this.rand(7, 30));

      // Spread client and product picks to avoid clustering
      const clienteId = clienteIds[(i + this.rand(0, 5)) % clienteIds.length];
      const productoId = this.pick(productoIds);

      const total = this.rand(500, 8000);

      const pedido = this.pedidoRepo.create({
        cliente: { id_cliente: clienteId } as any,
        producto: { id_producto: productoId } as any,
        total,
        fecha_entrega: fechaEntrega.toISOString().split('T')[0],
        estado,
        cantidad,
        unidad,
        cantidad_pares,
        categoria,
        token_seguimiento: uuidv4(),
      });

      const saved = await this.pedidoRepo.save(pedido);

      // @CreateDateColumn no permite override vía save(); se ajusta con SQL directo
      await this.dataSource.query(
        `UPDATE pedidos SET fecha_creacion = $1, fecha_actualizacion = $1 WHERE id_pedido = $2`,
        [fechaCreacion, saved.id_pedido],
      );

      // Generar distribución de tallas coherente con categoria y cantidad_pares
      const rangTallas = this.tallaRangePorCategoria(categoria);
      const distribucion = this.distribuirTallas(rangTallas, cantidad_pares);

      if (distribucion.length > 0) {
        const tallaEntities = distribucion.map(({ talla, cantidad_pares: cp }) =>
          this.tallaRepo.create({ talla, cantidad_pares: cp, pedido: saved }),
        );
        await this.tallaRepo.save(tallaEntities);
      }

      totalCreated++;
    }

    return {
      created: totalCreated,
      message: `Se crearon ${totalCreated} pedidos de prueba con distribución de tallas.`,
    };
  }
}
