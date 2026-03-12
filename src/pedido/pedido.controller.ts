import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { PedidoService } from './pedido.service';
import { CreatePedidoDto } from './dto/create-pedido.dto';
import { UpdatePedidoDto } from './dto/update-pedido.dto';
import { TallaService } from '../talla/talla.service';
import { CategoriaCalzado } from './entities/pedido.entity';
import { ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('pedidos')
@Controller('pedidos')
export class PedidoController {
  constructor(
    private readonly pedidoService: PedidoService,
    private readonly tallaService: TallaService,
  ) {}

  @Roles('admin')
  @Post()
  create(@Body() createPedidoDto: CreatePedidoDto) {
    console.log('3. BACKEND RECIBE:', JSON.stringify(createPedidoDto));
    return this.pedidoService.create(createPedidoDto);
  }

  @Get()
  findAll(@Query('cliente') cliente?: string, @Query('producto') producto?: string) {
    return this.pedidoService.findAll(cliente, producto);
  }

  @Get('kanban')
  getPedidosKanban() {
    return this.pedidoService.getPedidosKanban();
  }

  @Patch(':id/mover')
  moverPedido(
    @Param('id') id: number,
    @Body('nuevoEstado') nuevoEstado: 'Pendiente' | 'Aparado' | 'Solado' | 'Empaque' | 'Terminado',
  ) {
    return this.pedidoService.moverPedido(id, nuevoEstado);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.pedidoService.findOne(+id);
  }

  @Patch(':id/tallas')
  actualizarTallas(
    @Param('id') id: string,
    @Body() body: { categoria: CategoriaCalzado; tallas: { talla: number; cantidad_pares: number }[] },
  ) {
    return this.tallaService.actualizarTallasPersonalizadas(+id, body.categoria, body.tallas);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updatePedidoDto: UpdatePedidoDto) {
    return this.pedidoService.update(+id, updatePedidoDto);
  }

  @Roles('admin')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.pedidoService.remove(+id);
  }
}
