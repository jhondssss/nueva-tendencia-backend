// src/producto/producto.controller.ts
import {
  Controller, Get, Post, Body, Patch, Param, Delete,
  UseInterceptors, UploadedFile, Req,
} from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ProductoService } from './producto.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { CreateProductoDto } from './dto/create-producto.dto';
import { UpdateProductoDto } from './dto/update-producto.dto';

const imageInterceptor = FileInterceptor('imagen', {
  storage: memoryStorage(),
  fileFilter: (req, file, callback) => {
    if (!file.originalname.match(/\.(jpg|jpeg|png|gif|webp)$/)) {
      return callback(new Error('Solo se permiten imágenes'), false);
    }
    callback(null, true);
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});

@Controller('productos')
export class ProductoController {
  constructor(
    private readonly productoService: ProductoService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  @Roles('admin')
  @Post()
  @UseInterceptors(imageInterceptor)
  async create(
    @Body() dto: CreateProductoDto,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ) {
    if (file) {
      dto.imagen_url = await this.cloudinaryService.uploadImage(file);
    }
    return this.productoService.create(dto, req.user?.sub as number);
  }

  @Roles('admin')
  @Patch(':id')
  @UseInterceptors(imageInterceptor)
  async update(
    @Param('id') id: number,
    @Body() dto: UpdateProductoDto,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ) {
    console.log('PRODUCTO UPDATE RECIBE:', JSON.stringify(dto));
    if (file) {
      dto.imagen_url = await this.cloudinaryService.uploadImage(file);
    }
    return this.productoService.update(id, dto, req.user?.sub as number);
  }

  @Get()
  findAll() {
    return this.productoService.findAll();
  }

  @Get('alertas-stock')
  findAlertas() {
    return this.productoService.productosConAlerta();
  }

  @Get(':id')
  findOne(@Param('id') id: number) {
    return this.productoService.findOne(id);
  }

  @Roles('admin')
  @Delete(':id')
  remove(@Param('id') id: number) {
    return this.productoService.remove(id);
  }
}
