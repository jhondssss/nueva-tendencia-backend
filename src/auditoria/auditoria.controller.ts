import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Query,
  Req,
} from '@nestjs/common';
import { AuditoriaService } from './auditoria.service';
import { Roles } from '../auth/decorators/roles.decorator';

@Roles('admin')
@Controller('auditoria')
export class AuditoriaController {
  constructor(private readonly auditoriaService: AuditoriaService) {}

  @Get()
  getAll() {
    return this.auditoriaService.getAll();
  }

  @Get('modulo/:modulo')
  getByModulo(@Param('modulo') modulo: string) {
    return this.auditoriaService.getByModulo(modulo);
  }

  @Get('usuario/:id')
  getByUsuario(@Param('id', ParseIntPipe) id: number) {
    return this.auditoriaService.getByUsuario(id);
  }

  /** DELETE /auditoria/limpiar?before=YYYY-MM */
  @Delete('limpiar')
  async limpiar(
    @Query('before') before: string,
    @Req() req: any,
  ): Promise<{ eliminados: number; mensaje: string }> {
    if (!before || !/^\d{4}-\d{2}$/.test(before)) {
      throw new BadRequestException('El parámetro before debe tener formato YYYY-MM');
    }

    const [year, month] = before.split('-').map(Number);
    const fechaCorte = new Date(year, month - 1, 1); // primer día del mes indicado

    await this.auditoriaService.registrar({
      accion: 'DELETE',
      modulo: 'auditoria',
      descripcion: `Archivó y limpió registros anteriores a ${before}`,
      usuarioId: req.user?.sub as number | undefined,
      ip: req.ip,
    });

    const eliminados = await this.auditoriaService.limpiarAnterioresA(fechaCorte);

    return {
      eliminados,
      mensaje: `Se eliminaron ${eliminados} registros anteriores a ${before}`,
    };
  }
}
