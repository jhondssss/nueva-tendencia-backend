import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cliente } from '../cliente/entities/cliente.entity';
import { Producto } from '../producto/entities/producto.entity';
import { Pedido } from '../pedido/entities/pedido.entity';

const RESULTADOS_POR_CATEGORIA = 5;
const LARGO_MINIMO_BUSQUEDA = 2;

interface ResultadoBusqueda {
  id: number;
  titulo: string;
  subtitulo: string;
}

export interface SearchResult {
  clientes: ResultadoBusqueda[];
  productos: ResultadoBusqueda[];
  pedidos: ResultadoBusqueda[];
}

const RESULTADO_VACIO: SearchResult = { clientes: [], productos: [], pedidos: [] };

function escaparIlike(termino: string): string {
  return termino.replace(/[\\%_]/g, (caracter) => `\\${caracter}`);
}

@Injectable()
export class SearchService {
  constructor(
    @InjectRepository(Cliente)
    private readonly clienteRepo: Repository<Cliente>,

    @InjectRepository(Producto)
    private readonly productoRepo: Repository<Producto>,

    @InjectRepository(Pedido)
    private readonly pedidoRepo: Repository<Pedido>,
  ) {}

  async buscar(q?: string): Promise<SearchResult> {
    const termino = q?.trim();
    if (!termino || termino.length < LARGO_MINIMO_BUSQUEDA) {
      return RESULTADO_VACIO;
    }

    const patron = `%${escaparIlike(termino)}%`;
    const idNumerico = /^\d+$/.test(termino) ? parseInt(termino, 10) : undefined;

    const [clientes, productos, pedidos] = await Promise.all([
      this.buscarClientes(patron),
      this.buscarProductos(patron),
      this.buscarPedidos(patron, idNumerico),
    ]);

    return { clientes, productos, pedidos };
  }

  private async buscarClientes(patron: string): Promise<ResultadoBusqueda[]> {
    const clientes = await this.clienteRepo
      .createQueryBuilder('cliente')
      .where('cliente.nombre ILIKE :patron', { patron })
      .orWhere('cliente.apellido ILIKE :patron', { patron })
      .orWhere('cliente.correo_electronico ILIKE :patron', { patron })
      .take(RESULTADOS_POR_CATEGORIA)
      .getMany();

    return clientes.map((cliente) => ({
      id: cliente.id_cliente,
      titulo: [cliente.nombre, cliente.apellido].filter(Boolean).join(' '),
      subtitulo: cliente.correo_electronico,
    }));
  }

  private async buscarProductos(patron: string): Promise<ResultadoBusqueda[]> {
    const productos = await this.productoRepo
      .createQueryBuilder('producto')
      .where('producto.nombre_modelo ILIKE :patron', { patron })
      .orWhere('producto.marca ILIKE :patron', { patron })
      .take(RESULTADOS_POR_CATEGORIA)
      .getMany();

    return productos.map((producto) => ({
      id: producto.id_producto,
      titulo: producto.nombre_modelo,
      subtitulo: producto.marca,
    }));
  }

  private async buscarPedidos(patron: string, idNumerico?: number): Promise<ResultadoBusqueda[]> {
    const query = this.pedidoRepo
      .createQueryBuilder('pedido')
      .leftJoin('pedido.cliente', 'cliente')
      .leftJoin('pedido.producto', 'producto')
      .addSelect(['cliente.nombre', 'cliente.apellido', 'producto.nombre_modelo'])
      .where('cliente.nombre ILIKE :patron', { patron })
      .orWhere('cliente.apellido ILIKE :patron', { patron })
      .orWhere('producto.nombre_modelo ILIKE :patron', { patron });

    if (idNumerico !== undefined) {
      query.orWhere('pedido.id_pedido = :idNumerico', { idNumerico });
    }

    const pedidos = await query.take(RESULTADOS_POR_CATEGORIA).getMany();

    return pedidos.map((pedido) => ({
      id: pedido.id_pedido,
      titulo: `Pedido #${pedido.id_pedido}`,
      subtitulo: [
        [pedido.cliente?.nombre, pedido.cliente?.apellido].filter(Boolean).join(' '),
        pedido.producto?.nombre_modelo,
      ]
        .filter(Boolean)
        .join(' — '),
    }));
  }
}
