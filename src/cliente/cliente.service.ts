import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { Cliente } from './entities/cliente.entity';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';
import { AuditoriaService } from '../auditoria/auditoria.service';

@Injectable()
export class ClienteService {
  constructor(
    @InjectRepository(Cliente)
    private readonly clienteRepository: Repository<Cliente>,

    private readonly auditoriaService: AuditoriaService,
  ) {}

  async create(createClienteDto: CreateClienteDto) {
    const emailExistente = await this.clienteRepository.findOneBy({
      correo_electronico: createClienteDto.correo_electronico,
    });
    if (emailExistente) {
      throw new ConflictException('Ya existe un cliente con ese email');
    }

    const docExistente = await this.clienteRepository.findOneBy({
      documento_identidad: createClienteDto.documento_identidad,
    });
    if (docExistente) {
      throw new ConflictException('Ya existe un cliente con ese CI/RUC');
    }

    const cliente = this.clienteRepository.create(createClienteDto);
    const saved = await this.clienteRepository.save(cliente);
    void this.auditoriaService.registrar({
      accion: 'CREATE',
      modulo: 'clientes',
      descripcion: `Creó cliente ${saved.nombre}`,
    });
    return saved;
  }

  findAll() {
    return this.clienteRepository.find({ relations: ['direccion'] });
  }

  async findOne(id: number) {
    const cliente = await this.clienteRepository.findOne({
      where: { id_cliente: id },
      relations: ['direccion'],
    });
    if (!cliente) {
      throw new NotFoundException(`Cliente con ID ${id} no encontrado`);
    }
    return cliente;
  }

  async update(id: number, updateClienteDto: UpdateClienteDto) {
    await this.findOne(id);

    if (updateClienteDto.correo_electronico) {
      const existente = await this.clienteRepository.findOneBy({
        correo_electronico: updateClienteDto.correo_electronico,
        id_cliente: Not(id),
      });
      if (existente) {
        throw new ConflictException('Ya existe un cliente con ese email');
      }
    }

    if (updateClienteDto.documento_identidad) {
      const existente = await this.clienteRepository.findOneBy({
        documento_identidad: updateClienteDto.documento_identidad,
        id_cliente: Not(id),
      });
      if (existente) {
        throw new ConflictException('Ya existe un cliente con ese CI/RUC');
      }
    }

    const result = await this.clienteRepository.update(id, updateClienteDto);
    const nombre = updateClienteDto.nombre ?? `ID ${id}`;
    void this.auditoriaService.registrar({
      accion: 'UPDATE',
      modulo: 'clientes',
      descripcion: `Actualizó cliente ${nombre}`,
    });
    return result;
  }

  async remove(id: number) {
    const cliente = await this.findOne(id);
    const result = await this.clienteRepository.delete(id);
    void this.auditoriaService.registrar({
      accion: 'DELETE',
      modulo: 'clientes',
      descripcion: `Eliminó cliente ${cliente.nombre}`,
    });
    return result;
  }
}
