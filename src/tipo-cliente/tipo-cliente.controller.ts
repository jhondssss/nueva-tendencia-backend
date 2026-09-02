import { Controller, Get, Post, Patch, Delete, Body, Param, ParseIntPipe, Req } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { TipoClienteService } from './tipo-cliente.service';
import { CreateTipoClienteDto } from './dto/create-tipo-cliente.dto';
import { UpdateTipoClienteDto } from './dto/update-tipo-cliente.dto';

@Controller('tipos-cliente')
export class TipoClienteController {
  constructor(private readonly tipoClienteService: TipoClienteService) {}

  @Get()
  findAll() {
    return this.tipoClienteService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.tipoClienteService.findOne(id);
  }

  @Roles('admin')
  @Post()
  create(@Body() dto: CreateTipoClienteDto, @Req() req: any) {
    return this.tipoClienteService.create(dto, req.user?.sub as number);
  }

  @Roles('admin')
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTipoClienteDto,
    @Req() req: any,
  ) {
    return this.tipoClienteService.update(id, dto, req.user?.sub as number);
  }

  @Roles('admin')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.tipoClienteService.remove(id, req.user?.sub as number);
  }
}
