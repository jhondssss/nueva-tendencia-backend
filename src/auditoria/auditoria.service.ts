import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Auditoria } from './entities/auditoria.entity';
import { User } from '../user/entities/user.entity';

export interface RegistrarAuditoriaDto {
  accion: string;
  modulo: string;
  descripcion: string;
  usuarioId?: number;
  ip?: string;
}

@Injectable()
export class AuditoriaService {
  constructor(
    @InjectRepository(Auditoria)
    private readonly repo: Repository<Auditoria>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async registrar(dto: RegistrarAuditoriaDto): Promise<void> {
    const registro = this.repo.create({
      accion: dto.accion,
      modulo: dto.modulo,
      descripcion: dto.descripcion,
      ip: dto.ip ?? null,
      usuario: dto.usuarioId ? ({ id: dto.usuarioId } as User) : null,
    });
    await this.repo.save(registro);
  }

  getAll(): Promise<Auditoria[]> {
    return this.repo.find({
      order: { fecha: 'DESC' },
      relations: ['usuario'],
    });
  }

  getByModulo(modulo: string): Promise<Auditoria[]> {
    return this.repo.find({
      where: { modulo },
      order: { fecha: 'DESC' },
      relations: ['usuario'],
    });
  }

  getByUsuario(id: number): Promise<Auditoria[]> {
    return this.repo.find({
      where: { usuario: { id } },
      order: { fecha: 'DESC' },
      relations: ['usuario'],
    });
  }

  async limpiarAnterioresA(fecha: Date): Promise<number> {
    const result = await this.repo.delete({ fecha: LessThan(fecha) });
    return result.affected ?? 0;
  }
}
