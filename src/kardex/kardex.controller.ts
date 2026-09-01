import { BadRequestException, Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { KardexService } from './kardex.service';
import { CreateKardexDto } from './dto/create-kardex.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';

@Controller('kardex')
export class KardexController {
  constructor(private readonly kardexService: KardexService) {}

  /** POST /kardex
   *  Registra un movimiento de stock de producto o insumo.
   *  Debe incluir producto_id o insumo_id (no ambos). */
  @Post()
  @Roles('admin', 'operario')
  registrar(@Body() dto: CreateKardexDto, @Req() req: any) {
    if (!dto.producto_id && !dto.insumo_id) {
      throw new BadRequestException('Debe proporcionar producto_id o insumo_id');
    }
    const usuarioId = req.user?.sub as number;
    if (dto.insumo_id) {
      return this.kardexService.registrarMovimientoInsumo(dto as any, usuarioId);
    }
    return this.kardexService.registrarMovimiento(dto, usuarioId);
  }

  /** GET /kardex
   *  Lista todos los movimientos (más recientes primero) */
  @Get()
  getMovimientos(@Query('producto') productoId?: string, @Query() paginacion?: PaginationQueryDto) {
    return this.kardexService.getMovimientos(
      productoId ? Number(productoId) : undefined,
      paginacion?.page,
      paginacion?.limit,
    );
  }

  /** GET /kardex/producto/:id
   *  Historial de movimientos de un producto específico */
  @Get('producto/:id')
  findByProducto(@Param('id') id: string) {
    return this.kardexService.getMovimientosByProducto(+id);
  }

  /** GET /kardex/pedido/:id/existe
   *  Indica si el pedido tiene movimientos de kardex asociados (consumo
   *  automático de insumos). Útil para advertir antes de eliminarlo, ya
   *  que la FK es ON DELETE SET NULL y no bloquea el borrado. */
  @Get('pedido/:id/existe')
  async existenMovimientosPorPedido(@Param('id') id: string) {
    const tieneMovimientos = await this.kardexService.existenMovimientosPorPedido(+id);
    return { tieneMovimientos };
  }
}
