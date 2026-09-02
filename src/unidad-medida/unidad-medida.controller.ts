import { Controller, Get, Post, Patch, Delete, Body, Param, ParseIntPipe, Req } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { UnidadMedidaService } from './unidad-medida.service';
import { CreateUnidadMedidaDto } from './dto/create-unidad-medida.dto';
import { UpdateUnidadMedidaDto } from './dto/update-unidad-medida.dto';

@Controller('unidades-medida')
export class UnidadMedidaController {
  constructor(private readonly unidadMedidaService: UnidadMedidaService) {}

  @Get()
  findAll() {
    return this.unidadMedidaService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.unidadMedidaService.findOne(id);
  }

  @Roles('admin')
  @Post()
  create(@Body() dto: CreateUnidadMedidaDto, @Req() req: any) {
    return this.unidadMedidaService.create(dto, req.user?.sub as number);
  }

  @Roles('admin')
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUnidadMedidaDto,
    @Req() req: any,
  ) {
    return this.unidadMedidaService.update(id, dto, req.user?.sub as number);
  }

  @Roles('admin')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.unidadMedidaService.remove(id, req.user?.sub as number);
  }
}
