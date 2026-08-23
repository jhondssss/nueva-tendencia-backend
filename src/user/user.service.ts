import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './entities/user.entity';
import { RegisterDto } from '../auth/dto/register.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Role } from '../auth/enums/role.enum';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  // ── Auth helpers ────────────────────────────────────────────────────

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { email } });
  }

  async findByResetToken(token: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { reset_token: token } });
  }

  async findByClienteId(clienteId: number): Promise<User | null> {
    return this.userRepository.findOne({ where: { clienteId } });
  }

  async findClienteIdsConUsuario(clienteIds: number[]): Promise<Set<number>> {
    if (clienteIds.length === 0) return new Set();
    const users = await this.userRepository.find({
      where: { clienteId: In(clienteIds) },
      select: ['clienteId'],
    });
    return new Set(users.map((u) => u.clienteId as number));
  }

  async createClienteUser(data: {
    email: string;
    plainPassword: string;
    clienteId: number;
  }): Promise<User> {
    const hashedPassword = await bcrypt.hash(data.plainPassword, 10);
    const user = this.userRepository.create({
      email: data.email,
      password: hashedPassword,
      role: Role.CLIENTE,
      clienteId: data.clienteId,
      requiereCambioPassword: true,
      activo: true,
    });
    return this.userRepository.save(user);
  }

  async create(registerDto: RegisterDto, role: Role = Role.USER): Promise<User> {
    const hashedPassword = await bcrypt.hash(registerDto.password, 10);
    const user = this.userRepository.create({ ...registerDto, password: hashedPassword, role });
    return this.userRepository.save(user);
  }

  async validateUser(email: string, password: string): Promise<User | null> {
    if (!email || !password) return null;
    const user = await this.findByEmail(email);
    if (user && user.password && (await bcrypt.compare(password, user.password))) {
      return user;
    }
    return null;
  }

  // ── Password reset helpers ──────────────────────────────────────────

  async saveResetToken(id: number, token: string, expires: Date): Promise<void> {
    await this.userRepository.update(id, { reset_token: token, reset_token_expires: expires });
  }

  async clearResetToken(id: number): Promise<void> {
    await this.userRepository.update(id, { reset_token: null, reset_token_expires: null });
  }

  async updatePassword(id: number, hashedPassword: string): Promise<void> {
    await this.userRepository.update(id, { password: hashedPassword });
  }

  async setPasswordAndClearFlag(id: number, hashedPassword: string): Promise<void> {
    await this.userRepository.update(id, {
      password: hashedPassword,
      requiereCambioPassword: false,
    });
  }

  // ── Admin CRUD ──────────────────────────────────────────────────────

  async findAll(
    page = 1,
    limit = 10,
  ): Promise<{ data: Partial<User>[]; total: number; page: number; totalPages: number }> {
    const [users, total] = await this.userRepository.findAndCount({
      select: ['id', 'email', 'nombre', 'apellido', 'role', 'activo'],
      order: { id: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data: users, total, page, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number): Promise<Partial<User>> {
    const user = await this.userRepository.findOne({
      where: { id },
      select: ['id', 'email', 'nombre', 'apellido', 'role', 'activo'],
    });
    if (!user) throw new NotFoundException(`Usuario #${id} no encontrado`);
    return user;
  }

  async adminCreate(dto: CreateUserDto): Promise<Partial<User>> {
    const existing = await this.findByEmail(dto.email);
    if (existing) throw new ConflictException('Ya existe un usuario con ese email');

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const user = this.userRepository.create({ ...dto, password: hashedPassword, activo: true });
    const saved = await this.userRepository.save(user);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, reset_token, reset_token_expires, ...result } = saved;
    return result;
  }

  async adminUpdate(id: number, dto: UpdateUserDto): Promise<Partial<User>> {
    await this.findOne(id);
    await this.userRepository.update(id, dto);
    return this.findOne(id);
  }

  async toggleActive(id: number): Promise<{ id: number; activo: boolean }> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException(`Usuario #${id} no encontrado`);
    user.activo = !user.activo;
    await this.userRepository.save(user);
    return { id: user.id, activo: user.activo };
  }

  async adminDelete(id: number, requestingUserId: number): Promise<{ message: string }> {
    if (id === requestingUserId) {
      throw new ConflictException('No puedes eliminar tu propia cuenta');
    }
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException(`Usuario #${id} no encontrado`);
    await this.userRepository.remove(user);
    return { message: `Usuario #${id} eliminado correctamente` };
  }
}
