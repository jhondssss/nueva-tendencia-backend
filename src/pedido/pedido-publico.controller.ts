import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { Pedido } from './entities/pedido.entity';

@ApiTags('publico')
@Controller('publico/pedido')
export class PedidoPublicoController {
  constructor(
    @InjectRepository(Pedido)
    private readonly pedidoRepo: Repository<Pedido>,
  ) {}

  @Public()
  @Get(':id')
  async findOne(@Param('id') id: string) {
    const pedido = await this.pedidoRepo.findOne({
      where: { id_pedido: +id },
      relations: ['cliente', 'producto', 'talles'],
    });

    if (!pedido) throw new NotFoundException(`Pedido #${id} no encontrado`);

    console.log('BACKEND_URL:', process.env.BACKEND_URL);
    const baseUrl = process.env.BACKEND_URL || 'http://localhost:3000';
    const imagenRaw = pedido.producto?.imagen_url ?? null;
    const imagen = imagenRaw
      ? (imagenRaw.startsWith('http') ? imagenRaw : `${baseUrl}${imagenRaw}`)
      : null;

    return {
      id_pedido:       pedido.id_pedido,
      estado:          pedido.estado,
      fecha_entrega:   pedido.fecha_entrega,
      fecha_creacion:  pedido.fecha_creacion,
      cantidad:        pedido.cantidad,
      cantidad_pares:  pedido.cantidad_pares,
      unidad:          pedido.unidad,
      categoria:       pedido.categoria,
      cliente:         pedido.cliente?.nombre ?? null,
      producto:        pedido.producto?.nombre_modelo ?? null,
      imagen,
      talles:          pedido.talles,
    };
  }
}
