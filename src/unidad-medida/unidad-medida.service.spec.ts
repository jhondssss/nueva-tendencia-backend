import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { UnidadMedidaService } from './unidad-medida.service';
import { UnidadMedida } from './entities/unidad-medida.entity';
import { AuditoriaService } from '../auditoria/auditoria.service';

describe('UnidadMedidaService', () => {
  let service: UnidadMedidaService;

  const mockQueryBuilder = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
  };

  const mockUnidadMedidaRepo = {
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
        UnidadMedidaService,
        { provide: getRepositoryToken(UnidadMedida), useValue: mockUnidadMedidaRepo },
        { provide: AuditoriaService, useValue: mockAuditoriaService },
      ],
    }).compile();

    service = module.get<UnidadMedidaService>(UnidadMedidaService);

    mockQueryBuilder.getOne.mockResolvedValue(null);
  });

  afterEach(() => jest.clearAllMocks());

  describe('findOne', () => {
    it('lanza NotFoundException si la unidad de medida no existe', async () => {
      mockUnidadMedidaRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('crea una unidad de medida nueva', async () => {
      const dto = { nombre: 'docena' };
      const creada = { id_unidad_medida: 8, nombre: 'docena', activo: true };

      mockUnidadMedidaRepo.create.mockReturnValue(creada);
      mockUnidadMedidaRepo.save.mockResolvedValue(creada);

      const result = await service.create(dto);

      expect(mockUnidadMedidaRepo.save).toHaveBeenCalled();
      expect(mockAuditoriaService.registrar).toHaveBeenCalled();
      expect(result).toEqual(creada);
    });

    it('rechaza crear una unidad de medida con nombre ya existente', async () => {
      mockQueryBuilder.getOne.mockResolvedValue({ id_unidad_medida: 1, nombre: 'litro' });

      await expect(service.create({ nombre: 'litro' })).rejects.toThrow(ConflictException);
      expect(mockUnidadMedidaRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    function fkViolation(table: string): QueryFailedError {
      const err = new QueryFailedError('DELETE ...', [], new Error('fk violation'));
      (err as unknown as { code: string; table: string }).code = '23503';
      (err as unknown as { code: string; table: string }).table = table;
      return err;
    }

    it('rechaza eliminar una unidad de medida usada por insumos', async () => {
      const unidad = { id_unidad_medida: 1, nombre: 'litro', activo: true };
      mockUnidadMedidaRepo.findOne.mockResolvedValue(unidad);
      mockUnidadMedidaRepo.delete.mockRejectedValue(fkViolation('insumos'));

      await expect(service.remove(1)).rejects.toThrow(ConflictException);
    });

    it('elimina normalmente una unidad de medida sin insumos asociados', async () => {
      const unidad = { id_unidad_medida: 8, nombre: 'docena', activo: true };
      mockUnidadMedidaRepo.findOne.mockResolvedValue(unidad);
      mockUnidadMedidaRepo.delete.mockResolvedValue({ affected: 1 });

      await service.remove(8);

      expect(mockUnidadMedidaRepo.delete).toHaveBeenCalledWith(8);
      expect(mockAuditoriaService.registrar).toHaveBeenCalled();
    });
  });
});
