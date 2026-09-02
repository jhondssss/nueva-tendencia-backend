import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { CategoriaInsumoService } from './categoria-insumo.service';
import { CategoriaInsumo } from './entities/categoria-insumo.entity';
import { AuditoriaService } from '../auditoria/auditoria.service';

describe('CategoriaInsumoService', () => {
  let service: CategoriaInsumoService;

  const mockQueryBuilder = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
  };

  const mockCategoriaInsumoRepo = {
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
        CategoriaInsumoService,
        { provide: getRepositoryToken(CategoriaInsumo), useValue: mockCategoriaInsumoRepo },
        { provide: AuditoriaService, useValue: mockAuditoriaService },
      ],
    }).compile();

    service = module.get<CategoriaInsumoService>(CategoriaInsumoService);

    mockQueryBuilder.getOne.mockResolvedValue(null);
  });

  afterEach(() => jest.clearAllMocks());

  describe('findOne', () => {
    it('lanza NotFoundException si la categoría no existe', async () => {
      mockCategoriaInsumoRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('crea una categoría nueva', async () => {
      const dto = { nombre: 'Cuero' };
      const creada = { id_categoria_insumo: 6, nombre: 'Cuero', activo: true };

      mockCategoriaInsumoRepo.create.mockReturnValue(creada);
      mockCategoriaInsumoRepo.save.mockResolvedValue(creada);

      const result = await service.create(dto);

      expect(mockCategoriaInsumoRepo.save).toHaveBeenCalled();
      expect(mockAuditoriaService.registrar).toHaveBeenCalled();
      expect(result).toEqual(creada);
    });

    it('rechaza crear una categoría con nombre ya existente', async () => {
      mockQueryBuilder.getOne.mockResolvedValue({ id_categoria_insumo: 1, nombre: 'Cuero' });

      await expect(service.create({ nombre: 'Cuero' })).rejects.toThrow(ConflictException);
      expect(mockCategoriaInsumoRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    function fkViolation(table: string): QueryFailedError {
      const err = new QueryFailedError('DELETE ...', [], new Error('fk violation'));
      (err as unknown as { code: string; table: string }).code = '23503';
      (err as unknown as { code: string; table: string }).table = table;
      return err;
    }

    it('rechaza eliminar una categoría usada por insumos', async () => {
      const categoria = { id_categoria_insumo: 1, nombre: 'material', activo: true };
      mockCategoriaInsumoRepo.findOne.mockResolvedValue(categoria);
      mockCategoriaInsumoRepo.delete.mockRejectedValue(fkViolation('insumos'));

      await expect(service.remove(1)).rejects.toThrow(ConflictException);
    });

    it('elimina normalmente una categoría sin insumos asociados', async () => {
      const categoria = { id_categoria_insumo: 6, nombre: 'Cuero', activo: true };
      mockCategoriaInsumoRepo.findOne.mockResolvedValue(categoria);
      mockCategoriaInsumoRepo.delete.mockResolvedValue({ affected: 1 });

      await service.remove(6);

      expect(mockCategoriaInsumoRepo.delete).toHaveBeenCalledWith(6);
      expect(mockAuditoriaService.registrar).toHaveBeenCalled();
    });
  });
});
