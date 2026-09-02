import { Controller, Get, Post, Patch, Delete, Body, Param, ParseIntPipe, Req } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { CategoriaProductoService } from './categoria-producto.service';
import { CreateCategoriaProductoDto } from './dto/create-categoria-producto.dto';
import { UpdateCategoriaProductoDto } from './dto/update-categoria-producto.dto';

@Controller('categorias-producto')
export class CategoriaProductoController {
  constructor(private readonly categoriaProductoService: CategoriaProductoService) {}

  @Get()
  findAll() {
    return this.categoriaProductoService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.categoriaProductoService.findOne(id);
  }

  @Roles('admin')
  @Post()
  create(@Body() dto: CreateCategoriaProductoDto, @Req() req: any) {
    return this.categoriaProductoService.create(dto, req.user?.sub as number);
  }

  @Roles('admin')
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCategoriaProductoDto,
    @Req() req: any,
  ) {
    return this.categoriaProductoService.update(id, dto, req.user?.sub as number);
  }

  @Roles('admin')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.categoriaProductoService.remove(id, req.user?.sub as number);
  }
}
