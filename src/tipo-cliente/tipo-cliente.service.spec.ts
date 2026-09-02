import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { TipoClienteService } from './tipo-cliente.service';
import { TipoCliente } from './entities/tipo-cliente.entity';
import { AuditoriaService } from '../auditoria/auditoria.service';

describe('TipoClienteService', () => {
  let service: TipoClienteService;

  const mockQueryBuilder = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
  };

  const mockTipoClienteRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
    createQueryBuilder: jest.fn(() => mockQueryBuilder),
  };

  const mockAuditoriaService = { registrar: jest.fn().mockResolvedValue(undefined) };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TipoClienteService,
        { provide: getRepositoryToken(TipoCliente), useValue: mockTipoClienteRepo },
        { provide: AuditoriaService, useValue: mockAuditoriaService },
      ],
    }).compile();

    service = module.get<TipoClienteService>(TipoClienteService);

    mockQueryBuilder.getOne.mockResolvedValue(null);
  });

  afterEach(() => jest.clearAllMocks());

  describe('findOne', () => {
    it('lanza NotFoundException si el tipo no existe', async () => {
      mockTipoClienteRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('crea un tipo de cliente nuevo', async () => {
      const dto = { nombre: 'distribuidor' };
      const creado = { id_tipo_cliente: 3, nombre: 'distribuidor', activo: true };

      mockTipoClienteRepo.create.mockReturnValue(creado);
      mockTipoClienteRepo.save.mockResolvedValue(creado);

      const result = await service.create(dto);

      expect(mockTipoClienteRepo.save).toHaveBeenCalled();
      expect(mockAuditoriaService.registrar).toHaveBeenCalled();
      expect(result).toEqual(creado);
    });

    it('rechaza crear un tipo con nombre ya existente', async () => {
      mockQueryBuilder.getOne.mockResolvedValue({ id_tipo_cliente: 1, nombre: 'empresa' });

      await expect(service.create({ nombre: 'empresa' })).rejects.toThrow(ConflictException);
      expect(mockTipoClienteRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    function fkViolation(table: string): QueryFailedError {
      const err = new QueryFailedError('DELETE ...', [], new Error('fk violation'));
      (err as unknown as { code: string; table: string }).code = '23503';
      (err as unknown as { code: string; table: string }).table = table;
      return err;
    }

    it('rechaza eliminar un tipo usado por clientes', async () => {
      const tipo = { id_tipo_cliente: 1, nombre: 'empresa', activo: true };
      mockTipoClienteRepo.findOne.mockResolvedValue(tipo);
      mockTipoClienteRepo.delete.mockRejectedValue(fkViolation('cliente'));

      await expect(service.remove(1)).rejects.toThrow(ConflictException);
    });

    it('elimina normalmente un tipo sin clientes asociados', async () => {
      const tipo = { id_tipo_cliente: 3, nombre: 'distribuidor', activo: true };
      mockTipoClienteRepo.findOne.mockResolvedValue(tipo);
      mockTipoClienteRepo.delete.mockResolvedValue({ affected: 1 });

      await service.remove(3);

      expect(mockTipoClienteRepo.delete).toHaveBeenCalledWith(3);
      expect(mockAuditoriaService.registrar).toHaveBeenCalled();
    });
  });
});
