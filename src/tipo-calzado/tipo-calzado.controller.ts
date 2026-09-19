import { Controller, Get, Post, Patch, Delete, Body, Param, ParseIntPipe, Req } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { TipoCalzadoService } from './tipo-calzado.service';
import { CreateTipoCalzadoDto } from './dto/create-tipo-calzado.dto';
import { UpdateTipoCalzadoDto } from './dto/update-tipo-calzado.dto';

@Controller('tipos-calzado')
export class TipoCalzadoController {
  constructor(private readonly tipoCalzadoService: TipoCalzadoService) {}

  @Get()
  findAll() {
    return this.tipoCalzadoService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.tipoCalzadoService.findOne(id);
  }

  @Roles('admin')
  @Post()
  create(@Body() dto: CreateTipoCalzadoDto, @Req() req: any) {
    return this.tipoCalzadoService.create(dto, req.user?.sub as number);
  }

  @Roles('admin')
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTipoCalzadoDto,
    @Req() req: any,
  ) {
    return this.tipoCalzadoService.update(id, dto, req.user?.sub as number);
  }

  @Roles('admin')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.tipoCalzadoService.remove(id, req.user?.sub as number);
  }
}
