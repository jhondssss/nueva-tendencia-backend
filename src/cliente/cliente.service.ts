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

  async findAll() {
    const clientes = await this.clienteRepository.find({ relations: ['direccion'] });
    const idsConUsuario = await this.userService.findClienteIdsConUsuario(
      clientes.map((c) => c.id_cliente),
    );
    return clientes.map((cliente) => ({
      ...cliente,
      tieneUsuario: idsConUsuario.has(cliente.id_cliente),
    }));
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

    await this.mailService.sendMail({
      to: email,
      subject: 'Acceso a tu cuenta — Calzados Nueva Tendencia',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
          <h2>Bienvenido a Nueva Tendencia</h2>
          <p>Hola <strong>${cliente.nombre}</strong>,</p>
          <p>Se habilitó tu acceso para consultar tus pedidos en línea.</p>
          <p>Tu contraseña temporal es:</p>
          <p style="margin: 24px 0; font-size: 18px; font-weight: bold; letter-spacing: 1px;">${tempPassword}</p>
          <p style="margin: 24px 0;">
            <a href="${loginUrl}"
               style="display: inline-block; padding: 12px 24px; background-color: #4F46E5;
                      color: white; text-decoration: none; border-radius: 6px;">
              Iniciar sesión
            </a>
          </p>
          <p style="color: #666; font-size: 14px;">
            Por seguridad, te pediremos que cambies esta contraseña la primera vez que inicies sesión.
          </p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
          <p style="color: #999; font-size: 12px;">Calzados Nueva Tendencia</p>
        </div>
      `,
    });

    void this.auditoriaService.registrar({
      accion: 'CREATE',
      modulo: 'clientes',
      descripcion: `Otorgó acceso de usuario al cliente ${cliente.nombre} (${email})`,
    });

    return { message: 'Acceso otorgado. Se envió un email con las instrucciones.', email };
  }
}
