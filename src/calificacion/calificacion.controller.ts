import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CalificacionService } from './calificacion.service';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('calificaciones')
@Controller('calificaciones')
export class CalificacionController {
  constructor(private readonly calificacionService: CalificacionService) {}

  @Roles('admin', 'operario')
  @Get()
  findAll(
    @Query('puntuacion') puntuacion?: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
  ) {
    return this.calificacionService.findAll(puntuacion ? +puntuacion : undefined, desde, hasta);
  }
}
