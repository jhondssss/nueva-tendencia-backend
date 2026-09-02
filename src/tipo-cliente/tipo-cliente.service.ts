import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TipoCliente } from './entities/tipo-cliente.entity';
import { CreateTipoClienteDto } from './dto/create-tipo-cliente.dto';
import { UpdateTipoClienteDto } from './dto/update-tipo-cliente.dto';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { fkViolationTable } from '../common/db-errors';

@Injectable()
export class TipoClienteService {
  constructor(
    @InjectRepository(TipoCliente)
    private readonly tipoClienteRepo: Repository<TipoCliente>,

    private readonly auditoriaService: AuditoriaService,
  ) {}

  findAll(): Promise<TipoCliente[]> {
    return this.tipoClienteRepo.find({ order: { nombre: 'ASC' } });
  }

  async findOne(id: number): Promise<TipoCliente> {
    const tipo = await this.tipoClienteRepo.findOne({ where: { id_tipo_cliente: id } });
    if (!tipo) throw new NotFoundException(`Tipo de cliente #${id} no encontrado`);
    return tipo;
  }

  private async validarNombreUnico(nombre: string, excluirId?: number): Promise<void> {
    const qb = this.tipoClienteRepo
      .createQueryBuilder('t')
      .where('LOWER(TRIM(t.nombre)) = LOWER(TRIM(:nombre))', { nombre });
    if (excluirId !== undefined) {
      qb.andWhere('t.id_tipo_cliente != :excluirId', { excluirId });
    }
    const existente = await qb.getOne();
    if (existente) {
      throw new ConflictException(
        `Ya existe un tipo de cliente con el nombre "${existente.nombre}" (#${existente.id_tipo_cliente})`,
      );
    }
  }

  async create(dto: CreateTipoClienteDto, usuarioId?: number): Promise<TipoCliente> {
    await this.validarNombreUnico(dto.nombre);

    const tipo = this.tipoClienteRepo.create({
      ...dto,
      activo: dto.activo ?? true,
    });
    const saved = await this.tipoClienteRepo.save(tipo);

    void this.auditoriaService.registrar({
      accion: 'CREATE',
      modulo: 'tipos_cliente',
      descripcion: `Creó tipo de cliente "${saved.nombre}" #${saved.id_tipo_cliente}`,
      usuarioId,
    });

    return saved;
  }

  async update(id: number, dto: UpdateTipoClienteDto, usuarioId?: number): Promise<TipoCliente> {
    const tipo = await this.findOne(id);

    if (dto.nombre) {
      await this.validarNombreUnico(dto.nombre, id);
    }

    Object.assign(tipo, dto);
    const saved = await this.tipoClienteRepo.save(tipo);

    void this.auditoriaService.registrar({
      accion: 'UPDATE',
      modulo: 'tipos_cliente',
      descripcion: `Actualizó tipo de cliente "${saved.nombre}" #${id}`,
      usuarioId,
    });

    return saved;
  }

  async remove(id: number, usuarioId?: number): Promise<void> {
    const tipo = await this.findOne(id);

    try {
      await this.tipoClienteRepo.delete(id);
    } catch (err) {
      const tabla = fkViolationTable(err);
      if (tabla === 'cliente') {
        throw new ConflictException(
          'No se puede eliminar este tipo porque hay clientes que lo usan; reasigná esos clientes antes de eliminarlo',
        );
      }
      throw err;
    }

    void this.auditoriaService.registrar({
      accion: 'DELETE',
      modulo: 'tipos_cliente',
      descripcion: `Eliminó tipo de cliente "${tipo.nombre}" #${id}`,
      usuarioId,
    });
  }
}
