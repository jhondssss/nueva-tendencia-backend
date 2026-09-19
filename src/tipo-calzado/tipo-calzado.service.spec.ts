import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { TipoCalzadoService } from './tipo-calzado.service';
import { TipoCalzado } from './entities/tipo-calzado.entity';
import { AuditoriaService } from '../auditoria/auditoria.service';

describe('TipoCalzadoService', () => {
  let service: TipoCalzadoService;

  const mockQueryBuilder = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
  };

  const mockTipoCalzadoRepo = {
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
        TipoCalzadoService,
        { provide: getRepositoryToken(TipoCalzado), useValue: mockTipoCalzadoRepo },
        { provide: AuditoriaService, useValue: mockAuditoriaService },
      ],
    }).compile();

    service = module.get<TipoCalzadoService>(TipoCalzadoService);

    mockQueryBuilder.getOne.mockResolvedValue(null);
  });

  afterEach(() => jest.clearAllMocks());

  describe('findOne', () => {
    it('lanza NotFoundException si el tipo de calzado no existe', async () => {
      mockTipoCalzadoRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('crea un tipo de calzado nuevo', async () => {
      const dto = { nombre: 'Formal' };
      const creado = { id_tipo_calzado: 4, nombre: 'Formal', activo: true };

      mockTipoCalzadoRepo.create.mockReturnValue(creado);
      mockTipoCalzadoRepo.save.mockResolvedValue(creado);

      const result = await service.create(dto);

      expect(mockTipoCalzadoRepo.save).toHaveBeenCalled();
      expect(mockAuditoriaService.registrar).toHaveBeenCalled();
      expect(result).toEqual(creado);
    });

    it('rechaza crear un tipo de calzado con nombre ya existente', async () => {
      mockQueryBuilder.getOne.mockResolvedValue({ id_tipo_calzado: 1, nombre: 'Casual' });

      await expect(service.create({ nombre: 'Casual' })).rejects.toThrow(ConflictException);
      expect(mockTipoCalzadoRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    function fkViolation(table: string): QueryFailedError {
      const err = new QueryFailedError('DELETE ...', [], new Error('fk violation'));
      (err as unknown as { code: string; table: string }).code = '23503';
      (err as unknown as { code: string; table: string }).table = table;
      return err;
    }

    it('rechaza eliminar un tipo de calzado usado por productos', async () => {
      const tipoCalzado = { id_tipo_calzado: 1, nombre: 'Formal', activo: true };
      mockTipoCalzadoRepo.findOne.mockResolvedValue(tipoCalzado);
      mockTipoCalzadoRepo.delete.mockRejectedValue(fkViolation('productos'));

      await expect(service.remove(1)).rejects.toThrow(ConflictException);
    });

    it('elimina normalmente un tipo de calzado sin productos asociados', async () => {
      const tipoCalzado = { id_tipo_calzado: 4, nombre: 'Formal', activo: true };
      mockTipoCalzadoRepo.findOne.mockResolvedValue(tipoCalzado);
      mockTipoCalzadoRepo.delete.mockResolvedValue({ affected: 1 });

      await service.remove(4);

      expect(mockTipoCalzadoRepo.delete).toHaveBeenCalledWith(4);
      expect(mockAuditoriaService.registrar).toHaveBeenCalled();
    });
  });
});
