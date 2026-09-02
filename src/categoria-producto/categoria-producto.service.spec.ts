import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { CategoriaProductoService } from './categoria-producto.service';
import { CategoriaProducto } from './entities/categoria-producto.entity';
import { AuditoriaService } from '../auditoria/auditoria.service';

describe('CategoriaProductoService', () => {
  let service: CategoriaProductoService;

  const mockQueryBuilder = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
  };

  const mockCategoriaProductoRepo = {
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
        CategoriaProductoService,
        { provide: getRepositoryToken(CategoriaProducto), useValue: mockCategoriaProductoRepo },
        { provide: AuditoriaService, useValue: mockAuditoriaService },
      ],
    }).compile();

    service = module.get<CategoriaProductoService>(CategoriaProductoService);

    mockQueryBuilder.getOne.mockResolvedValue(null);
  });

  afterEach(() => jest.clearAllMocks());

  describe('findOne', () => {
    it('lanza NotFoundException si la categoría no existe', async () => {
      mockCategoriaProductoRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('crea una categoría nueva', async () => {
      const dto = { nombre: 'infantil' };
      const creada = { id_categoria_producto: 4, nombre: 'infantil', activo: true };

      mockCategoriaProductoRepo.create.mockReturnValue(creada);
      mockCategoriaProductoRepo.save.mockResolvedValue(creada);

      const result = await service.create(dto);

      expect(mockCategoriaProductoRepo.save).toHaveBeenCalled();
      expect(mockAuditoriaService.registrar).toHaveBeenCalled();
      expect(result).toEqual(creada);
    });

    it('rechaza crear una categoría con nombre ya existente', async () => {
      mockQueryBuilder.getOne.mockResolvedValue({ id_categoria_producto: 1, nombre: 'nino' });

      await expect(service.create({ nombre: 'nino' })).rejects.toThrow(ConflictException);
      expect(mockCategoriaProductoRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    function fkViolation(table: string): QueryFailedError {
      const err = new QueryFailedError('DELETE ...', [], new Error('fk violation'));
      (err as unknown as { code: string; table: string }).code = '23503';
      (err as unknown as { code: string; table: string }).table = table;
      return err;
    }

    it('rechaza eliminar una categoría usada por productos', async () => {
      const categoria = { id_categoria_producto: 1, nombre: 'adulto', activo: true };
      mockCategoriaProductoRepo.findOne.mockResolvedValue(categoria);
      mockCategoriaProductoRepo.delete.mockRejectedValue(fkViolation('productos'));

      await expect(service.remove(1)).rejects.toThrow(ConflictException);
    });

    it('elimina normalmente una categoría sin productos asociados', async () => {
      const categoria = { id_categoria_producto: 4, nombre: 'infantil', activo: true };
      mockCategoriaProductoRepo.findOne.mockResolvedValue(categoria);
      mockCategoriaProductoRepo.delete.mockResolvedValue({ affected: 1 });

      await service.remove(4);

      expect(mockCategoriaProductoRepo.delete).toHaveBeenCalledWith(4);
      expect(mockAuditoriaService.registrar).toHaveBeenCalled();
    });
  });
});
