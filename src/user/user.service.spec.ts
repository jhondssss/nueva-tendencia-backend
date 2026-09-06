import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UserService } from './user.service';
import { User } from './entities/user.entity';
import { Cliente } from '../cliente/entities/cliente.entity';
import { Role } from '../auth/enums/role.enum';

describe('UserService', () => {
  let service: UserService;

  const mockUserRepo = {
    create: jest.fn(),
    save: jest.fn(),
    findAndCount: jest.fn(),
    findOne: jest.fn(),
  };

  const mockClienteRepo = {
    find: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: getRepositoryToken(Cliente), useValue: mockClienteRepo },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('createClienteUser', () => {
    it('copia nombre y apellido del cliente al crear el user', async () => {
      mockUserRepo.create.mockImplementation((data) => data);
      mockUserRepo.save.mockImplementation((data) => Promise.resolve({ id: 1, ...data }));

      await service.createClienteUser({
        email: 'cliente@test.com',
        plainPassword: 'temp1234',
        clienteId: 5,
        nombre: 'Juan',
        apellido: 'Perez',
      });

      expect(mockUserRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          role: Role.CLIENTE,
          clienteId: 5,
          nombre: 'Juan',
          apellido: 'Perez',
        }),
      );
    });
  });

  describe('findAll', () => {
    it('resuelve el nombre desde Cliente cuando el user cliente lo tiene null', async () => {
      mockUserRepo.findAndCount.mockResolvedValue([
        [
          { id: 1, email: 'a@test.com', nombre: null, apellido: null, role: Role.CLIENTE, activo: true, clienteId: 5 },
          { id: 2, email: 'admin@test.com', nombre: 'Admin', apellido: 'Uno', role: Role.ADMIN, activo: true, clienteId: null },
        ],
        2,
      ]);
      mockClienteRepo.find.mockResolvedValue([{ id_cliente: 5, nombre: 'Juan', apellido: 'Perez' }]);

      const result = await service.findAll(1, 10);

      expect(mockClienteRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id_cliente: expect.anything() } }),
      );
      expect(result.data[0]).toEqual(
        expect.objectContaining({ id: 1, nombre: 'Juan', apellido: 'Perez' }),
      );
      expect(result.data[0]).not.toHaveProperty('clienteId');
      expect(result.data[1]).toEqual(expect.objectContaining({ id: 2, nombre: 'Admin' }));
    });

    it('no consulta Cliente si ningún user cliente tiene nombre null', async () => {
      mockUserRepo.findAndCount.mockResolvedValue([
        [{ id: 2, email: 'admin@test.com', nombre: 'Admin', apellido: 'Uno', role: Role.ADMIN, activo: true, clienteId: null }],
        1,
      ]);

      await service.findAll(1, 10);

      expect(mockClienteRepo.find).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('resuelve el nombre desde Cliente cuando el user cliente lo tiene null', async () => {
      mockUserRepo.findOne.mockResolvedValue({
        id: 1,
        email: 'a@test.com',
        nombre: null,
        apellido: null,
        role: Role.CLIENTE,
        activo: true,
        clienteId: 5,
      });
      mockClienteRepo.find.mockResolvedValue([{ id_cliente: 5, nombre: 'Juan', apellido: 'Perez' }]);

      const result = await service.findOne(1);

      expect(result).toEqual(
        expect.objectContaining({ id: 1, nombre: 'Juan', apellido: 'Perez' }),
      );
      expect(result).not.toHaveProperty('clienteId');
    });
  });
});
