import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { GeneroService } from './genero.service';
import { Genero } from './entities/genero.entity';
import { AuditoriaService } from '../auditoria/auditoria.service';

describe('GeneroService', () => {
  let service: GeneroService;

  const mockQueryBuilder = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
  };

  const mockGeneroRepo = {
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
        GeneroService,
        { provide: getRepositoryToken(Genero), useValue: mockGeneroRepo },
        { provide: AuditoriaService, useValue: mockAuditoriaService },
      ],
    }).compile();

    service = module.get<GeneroService>(GeneroService);

    mockQueryBuilder.getOne.mockResolvedValue(null);
  });

  afterEach(() => jest.clearAllMocks());

  describe('findOne', () => {
    it('lanza NotFoundException si el género no existe', async () => {
      mockGeneroRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('crea un género nuevo', async () => {
      const dto = { nombre: 'Niño' };
      const creado = { id_genero: 4, nombre: 'Niño', activo: true };

      mockGeneroRepo.create.mockReturnValue(creado);
      mockGeneroRepo.save.mockResolvedValue(creado);

      const result = await service.create(dto);

      expect(mockGeneroRepo.save).toHaveBeenCalled();
      expect(mockAuditoriaService.registrar).toHaveBeenCalled();
      expect(result).toEqual(creado);
    });

    it('rechaza crear un género con nombre ya existente', async () => {
      mockQueryBuilder.getOne.mockResolvedValue({ id_genero: 1, nombre: 'Hombre' });

      await expect(service.create({ nombre: 'Hombre' })).rejects.toThrow(ConflictException);
      expect(mockGeneroRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    function fkViolation(table: string): QueryFailedError {
      const err = new QueryFailedError('DELETE ...', [], new Error('fk violation'));
      (err as unknown as { code: string; table: string }).code = '23503';
      (err as unknown as { code: string; table: string }).table = table;
      return err;
    }

    it('rechaza eliminar un género usado por productos', async () => {
      const genero = { id_genero: 1, nombre: 'Hombre', activo: true };
      mockGeneroRepo.findOne.mockResolvedValue(genero);
      mockGeneroRepo.delete.mockRejectedValue(fkViolation('productos'));

      await expect(service.remove(1)).rejects.toThrow(ConflictException);
    });

    it('elimina normalmente un género sin productos asociados', async () => {
      const genero = { id_genero: 4, nombre: 'Niño', activo: true };
      mockGeneroRepo.findOne.mockResolvedValue(genero);
      mockGeneroRepo.delete.mockResolvedValue({ affected: 1 });

      await service.remove(4);

      expect(mockGeneroRepo.delete).toHaveBeenCalledWith(4);
      expect(mockAuditoriaService.registrar).toHaveBeenCalled();
    });
  });
});
