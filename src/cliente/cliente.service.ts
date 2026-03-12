import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
    return this.clienteRepository.find();
  }

  findOne(id: number) {
    return this.clienteRepository.findOneBy({ id_cliente: id });
  }

  async update(id: number, updateClienteDto: UpdateClienteDto) {
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
    const cliente = await this.clienteRepository.findOneBy({ id_cliente: id });
    const nombre = cliente?.nombre ?? `ID ${id}`;
    const result = await this.clienteRepository.delete(id);
    void this.auditoriaService.registrar({
      accion: 'DELETE',
      modulo: 'clientes',
      descripcion: `Eliminó cliente ${nombre}`,
    });
    return result;
  }
}
