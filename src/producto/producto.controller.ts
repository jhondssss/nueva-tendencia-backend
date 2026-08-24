// src/producto/producto.controller.ts
import {
  Controller, Get, Post, Body, Patch, Param, Delete, Query,
  UseInterceptors, UploadedFile, Req,
  BadRequestException, InternalServerErrorException,
} from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ProductoService } from './producto.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { CreateProductoDto } from './dto/create-producto.dto';
import { UpdateProductoDto } from './dto/update-producto.dto';
import { CatalogoPaginationQueryDto } from '../common/dto/pagination-query.dto';

const ALLOWED_MIMETYPES = /^image\/(jpeg|png|webp)$/;

const imageInterceptor = FileInterceptor('imagen', {
  storage: memoryStorage(),
  fileFilter: (req, file, callback) => {
    if (!ALLOWED_MIMETYPES.test(file.mimetype)) {
      (req as any).fileValidationError = 'Solo se permiten imágenes JPG, PNG o WEBP';
      return callback(null, false);
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
    if (req.fileValidationError) {
      throw new BadRequestException(req.fileValidationError);
    }
    if (file) {
      try {
        dto.imagen_url = await this.cloudinaryService.uploadImage(file);
      } catch {
        throw new InternalServerErrorException('Error al procesar la imagen, intenta de nuevo');
      }
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
    if (req.fileValidationError) {
      throw new BadRequestException(req.fileValidationError);
    }
    if (file) {
      try {
        dto.imagen_url = await this.cloudinaryService.uploadImage(file);
      } catch {
        throw new InternalServerErrorException('Error al procesar la imagen, intenta de nuevo');
      }
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

  @Roles('cliente', 'admin', 'operario')
  @Get('catalogo')
  findCatalogo(@Query() paginacion?: CatalogoPaginationQueryDto) {
    return this.productoService.findCatalogo(paginacion?.page, paginacion?.limit);
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
