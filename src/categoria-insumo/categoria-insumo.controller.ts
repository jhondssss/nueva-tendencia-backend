import { Controller, Get, Post, Patch, Delete, Body, Param, ParseIntPipe, Req } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { CategoriaInsumoService } from './categoria-insumo.service';
import { CreateCategoriaInsumoDto } from './dto/create-categoria-insumo.dto';
import { UpdateCategoriaInsumoDto } from './dto/update-categoria-insumo.dto';

@Controller('categorias-insumo')
export class CategoriaInsumoController {
  constructor(private readonly categoriaInsumoService: CategoriaInsumoService) {}

  @Get()
  findAll() {
    return this.categoriaInsumoService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.categoriaInsumoService.findOne(id);
  }

  @Roles('admin')
  @Post()
  create(@Body() dto: CreateCategoriaInsumoDto, @Req() req: any) {
    return this.categoriaInsumoService.create(dto, req.user?.sub as number);
  }

  @Roles('admin')
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCategoriaInsumoDto,
    @Req() req: any,
  ) {
    return this.categoriaInsumoService.update(id, dto, req.user?.sub as number);
  }

  @Roles('admin')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.categoriaInsumoService.remove(id, req.user?.sub as number);
  }
}
