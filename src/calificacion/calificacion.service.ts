import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { CalificacionPedido } from '../pedido/entities/calificacion-pedido.entity';

@Injectable()
export class CalificacionService {
  constructor(
    @InjectRepository(CalificacionPedido)
    private readonly calificacionRepo: Repository<CalificacionPedido>,
  ) {}

  findAll(puntuacion?: number, desde?: string, hasta?: string) {
    const rangoFecha =
      desde && hasta
        ? Between(new Date(`${desde}T00:00:00`), new Date(`${hasta}T23:59:59.999`))
        : desde
          ? MoreThanOrEqual(new Date(`${desde}T00:00:00`))
          : hasta
            ? LessThanOrEqual(new Date(`${hasta}T23:59:59.999`))
            : undefined;

    return this.calificacionRepo.find({
      where: {
        ...(puntuacion && { puntuacion }),
        ...(rangoFecha && { fecha_creacion: rangoFecha }),
      },
      relations: ['pedido'],
      order: { fecha_creacion: 'DESC' },
    });
  }
}
