import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  Req,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { InsumoService } from './insumo.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { CreateInsumoDto } from './dto/create-insumo.dto';
import { UpdateInsumoDto } from './dto/update-insumo.dto';

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

@Controller('insumos')
export class InsumoController {
  constructor(
    private readonly insumoService: InsumoService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  @Get()
  findAll() {
    return this.insumoService.findAll();
  }

  @Get('alertas')
  findAlertas() {
    return this.insumoService.findAlertas();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.insumoService.findOne(id);
  }

  @Roles('admin')
  @Post()
  @UseInterceptors(imageInterceptor)
  async create(
    @Body() dto: CreateInsumoDto,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ) {
    if (req.fileValidationError) throw new BadRequestException(req.fileValidationError);
    if (file) {
      try {
        dto.imagen_url = await this.cloudinaryService.uploadImage(file, 'insumos');
      } catch {
        throw new InternalServerErrorException('Error al subir la imagen, intenta de nuevo');
      }
    }
    return this.insumoService.create(dto, req.user?.sub as number);
  }

  @Roles('admin')
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateInsumoDto,
    @Req() req: any,
  ) {
    return this.insumoService.update(id, dto, req.user?.sub as number);
  }

  @Roles('admin')
  @Post(':id/imagen')
  @UseInterceptors(imageInterceptor)
  async uploadImagen(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ) {
    if (req.fileValidationError) throw new BadRequestException(req.fileValidationError);
    let imagen_url: string;
    try {
      imagen_url = await this.cloudinaryService.uploadImage(file, 'insumos');
    } catch {
      throw new InternalServerErrorException('Error al subir la imagen, intenta de nuevo');
    }
    return this.insumoService.update(id, { imagen_url } as UpdateInsumoDto, req.user?.sub as number);
  }

  @Roles('admin')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.insumoService.remove(id, req.user?.sub as number);
  }
}
