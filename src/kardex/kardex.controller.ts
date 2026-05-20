import { BadRequestException, Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { KardexService } from './kardex.service';
import { CreateKardexDto } from './dto/create-kardex.dto';

@Controller('kardex')
export class KardexController {
  constructor(private readonly kardexService: KardexService) {}

  /** POST /kardex
   *  Registra un movimiento de stock de producto o insumo.
   *  Debe incluir producto_id o insumo_id (no ambos). */
  @Post()
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
  async getMovimientos(@Query('producto') productoId?: string) {
    try {
      return await this.kardexService.getMovimientos(
        productoId ? Number(productoId) : undefined,
      );
    } catch (error) {
      console.error('[kardex GET error]', error.message, error.stack);
      throw error;
    }
  }

  /** GET /kardex/producto/:id
   *  Historial de movimientos de un producto específico */
  @Get('producto/:id')
  findByProducto(@Param('id') id: string) {
    return this.kardexService.getMovimientosByProducto(+id);
  }
}
