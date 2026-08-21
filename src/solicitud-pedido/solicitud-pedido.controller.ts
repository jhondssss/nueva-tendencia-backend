import { Controller, Get, Post, Patch, Body, Param, Query, Req, ForbiddenException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SolicitudPedidoService } from './solicitud-pedido.service';
import { CreateSolicitudPedidoDto } from './dto/create-solicitud-pedido.dto';
import { AprobarSolicitudDto } from './dto/aprobar-solicitud.dto';
import { RechazarSolicitudDto } from './dto/rechazar-solicitud.dto';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('solicitudes-pedido')
@Controller('solicitudes-pedido')
export class SolicitudPedidoController {
  constructor(private readonly solicitudPedidoService: SolicitudPedidoService) {}

  @Roles('cliente')
  @Post()
  create(@Body() dto: CreateSolicitudPedidoDto, @Req() req: any) {
    const clienteId = req.user?.clienteId as number | undefined;
    if (!clienteId) throw new ForbiddenException('Esta cuenta no tiene un cliente asociado');
    return this.solicitudPedidoService.create(clienteId, dto);
  }

  @Roles('cliente')
  @Get('mis-solicitudes')
  misSolicitudes(@Req() req: any) {
    const clienteId = req.user?.clienteId as number | undefined;
    if (!clienteId) throw new ForbiddenException('Esta cuenta no tiene un cliente asociado');
    return this.solicitudPedidoService.findByClienteId(clienteId);
  }

  @Roles('admin', 'operario')
  @Get()
  findAll(@Query('estado') estado?: string) {
    return this.solicitudPedidoService.findAll(estado);
  }

  @Roles('admin', 'operario')
  @Patch(':id/aprobar')
  aprobar(@Param('id') id: string, @Body() dto: AprobarSolicitudDto) {
    return this.solicitudPedidoService.aprobar(+id, dto);
  }

  @Roles('admin', 'operario')
  @Patch(':id/rechazar')
  rechazar(@Param('id') id: string, @Body() dto: RechazarSolicitudDto) {
    return this.solicitudPedidoService.rechazar(+id, dto);
  }
}
