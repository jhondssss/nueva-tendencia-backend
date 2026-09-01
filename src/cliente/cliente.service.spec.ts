import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { ClienteService } from './cliente.service';
import { Cliente } from './entities/cliente.entity';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { UserService } from '../user/user.service';
import { MailService } from '../mail/mail.service';

function fkError(table: string): QueryFailedError {
  const driverError = { code: '23503', table, message: 'fk violation' };
  return new QueryFailedError('DELETE ...', undefined, driverError as unknown as Error);
}

describe('ClienteService', () => {
  let service: ClienteService;

  const mockClienteRepo = {
    findOne: jest.fn(),
    findOneBy: jest.fn(),
    delete: jest.fn(),
  };

  const mockAuditoriaService = { registrar: jest.fn().mockResolvedValue(undefined) };
  const mockUserService = { findByClienteId: jest.fn().mockResolvedValue(null) };
  const mockMailService = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClienteService,
        { provide: getRepositoryToken(Cliente), useValue: mockClienteRepo },
        { provide: AuditoriaService, useValue: mockAuditoriaService },
        { provide: UserService, useValue: mockUserService },
        { provide: MailService, useValue: mockMailService },
      ],
    }).compile();

    service = module.get<ClienteService>(ClienteService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('remove', () => {
    const cliente = { id_cliente: 1, nombre: 'Cliente Test' };

    beforeEach(() => {
      mockClienteRepo.findOne.mockResolvedValue(cliente);
    });

    it('convierte una violación de FK contra pedidos en un mensaje de negocio claro', async () => {
      mockClienteRepo.delete.mockRejectedValue(fkError('pedidos'));

      await expect(service.remove(1)).rejects.toThrow(ConflictException);
      await expect(service.remove(1)).rejects.toThrow('tiene pedidos asociados');
      expect(mockAuditoriaService.registrar).not.toHaveBeenCalled();
    });

    it('convierte una violación de FK contra direccion_cliente en un mensaje de negocio claro', async () => {
      mockClienteRepo.delete.mockRejectedValue(fkError('direccion_cliente'));

      await expect(service.remove(1)).rejects.toThrow('tiene una dirección registrada asociada');
    });

    it('re-lanza un error que no es de FK sin envolverlo', async () => {
      const otroError = new Error('conexión perdida');
      mockClienteRepo.delete.mockRejectedValue(otroError);

      await expect(service.remove(1)).rejects.toThrow(otroError);
    });

    it('borra el cliente cuando no hay conflicto y registra auditoría', async () => {
      mockClienteRepo.delete.mockResolvedValue({ raw: [], affected: 1 });

      const result = await service.remove(1);

      expect(mockAuditoriaService.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ accion: 'DELETE', modulo: 'clientes' }),
      );
      expect(result).toEqual({ raw: [], affected: 1 });
    });
  });
});
