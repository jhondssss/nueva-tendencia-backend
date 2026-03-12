import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { KardexService } from './kardex.service';
import { CreateKardexDto } from './dto/create-kardex.dto';

@Controller('kardex')
export class KardexController {
  constructor(private readonly kardexService: KardexService) {}

  /** POST /kardex
   *  Registra un movimiento de stock y actualiza producto.stock */
  @Post()
  registrar(@Body() dto: CreateKardexDto, @Req() req: any) {
    return this.kardexService.registrarMovimiento(dto, req.user?.sub as number);
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
