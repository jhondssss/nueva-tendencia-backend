import {
  BadRequestException,
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { Cliente } from './entities/cliente.entity';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';
import { DarAccesoDto } from './dto/dar-acceso.dto';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { UserService } from '../user/user.service';
import { MailService } from '../mail/mail.service';
import { paginate } from '../common/pagination';

@Injectable()
export class ClienteService {
  constructor(
    @InjectRepository(Cliente)
    private readonly clienteRepository: Repository<Cliente>,

    private readonly auditoriaService: AuditoriaService,
    private readonly userService: UserService,
    private readonly mailService: MailService,
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

  async findAll(page = 1, limit = 30) {
    const [clientes, total] = await this.clienteRepository.findAndCount({
      relations: ['direccion'],
      order: { id_cliente: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    const idsConUsuario = await this.userService.findClienteIdsConUsuario(
      clientes.map((c) => c.id_cliente),
    );
    const data = clientes.map((cliente) => ({
      ...cliente,
      tieneUsuario: idsConUsuario.has(cliente.id_cliente),
    }));
    return paginate(data, total, page, limit);
  }

  async findOne(id: number) {
    const cliente = await this.clienteRepository.findOne({
      where: { id_cliente: id },
      relations: ['direccion'],
    });
    if (!cliente) {
      throw new NotFoundException(`Cliente con ID ${id} no encontrado`);
    }
    const usuario = await this.userService.findByClienteId(cliente.id_cliente);
    return { ...cliente, tieneUsuario: !!usuario };
  }

  async update(id: number, updateClienteDto: UpdateClienteDto) {
    const cliente = await this.findOne(id);

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

    Object.assign(cliente, updateClienteDto);
    const saved = await this.clienteRepository.save(cliente);
    void this.auditoriaService.registrar({
      accion: 'UPDATE',
      modulo: 'clientes',
      descripcion: `Actualizó cliente ${saved.nombre}`,
    });
    return saved;
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

  async darAcceso(id: number, dto: DarAccesoDto) {
    const cliente = await this.findOne(id);

    const yaVinculado = await this.userService.findByClienteId(cliente.id_cliente);
    if (yaVinculado) {
      throw new ConflictException('Este cliente ya tiene una cuenta de acceso');
    }

    const email = dto.email ?? cliente.correo_electronico;
    if (!email) {
      throw new BadRequestException('El cliente no tiene un email registrado; proporcioná uno en el body');
    }

    const emailEnUso = await this.userService.findByEmail(email);
    if (emailEnUso) {
      throw new ConflictException('Ya existe una cuenta de usuario con ese email');
    }

    const tempPassword = randomBytes(9).toString('base64url');

    await this.userService.createClienteUser({
      email,
      plainPassword: tempPassword,
      clienteId: cliente.id_cliente,
    });

    const loginUrl = 'https://nueva-tendencia-frontend.vercel.app/login';

    try {
      await this.mailService.sendClienteAccessEmail(email, cliente.nombre, tempPassword, loginUrl);
    } catch (err) {
      void this.auditoriaService.registrar({
        accion: 'CREATE',
        modulo: 'clientes',
        descripcion: `Otorgó acceso de usuario al cliente ${cliente.nombre} (${email}) — el email de bienvenida FALLÓ al enviarse`,
      });
      return {
        message: `Usuario creado pero el email de bienvenida falló al enviarse. Reenviá manualmente las credenciales al cliente (${email}).`,
        email,
        emailEnviado: false,
        tempPassword,
      };
    }

    void this.auditoriaService.registrar({
      accion: 'CREATE',
      modulo: 'clientes',
      descripcion: `Otorgó acceso de usuario al cliente ${cliente.nombre} (${email})`,
    });

    return { message: 'Acceso otorgado. Se envió un email con las instrucciones.', email, emailEnviado: true };
  }
}
