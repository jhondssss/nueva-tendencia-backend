import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { ProductoService } from './producto.service';
import { Producto } from './entities/producto.entity';
import { KardexService } from '../kardex/kardex.service';
import { AuditoriaService } from '../auditoria/auditoria.service';

describe('ProductoService', () => {
  let service: ProductoService;

  const mockProductoRepo = {
    findOne: jest.fn(),
    delete: jest.fn(),
  };

  const mockKardexService = {};
  const mockAuditoriaService = { registrar: jest.fn().mockResolvedValue(undefined) };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductoService,
        { provide: getRepositoryToken(Producto), useValue: mockProductoRepo },
        { provide: KardexService, useValue: mockKardexService },
        { provide: AuditoriaService, useValue: mockAuditoriaService },
      ],
    }).compile();

    service = module.get<ProductoService>(ProductoService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('remove', () => {
    it('lanza NotFoundException si el producto no existe y no intenta borrar', async () => {
      mockProductoRepo.findOne.mockResolvedValue(null);

      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
      expect(mockProductoRepo.delete).not.toHaveBeenCalled();
      expect(mockAuditoriaService.registrar).not.toHaveBeenCalled();
    });

    it('borra el producto existente y registra auditoría', async () => {
      const producto = { id_producto: 1, nombre_modelo: 'Bota Test' };
      mockProductoRepo.findOne.mockResolvedValue(producto);
      mockProductoRepo.delete.mockResolvedValue({ raw: [], affected: 1 });

      const result = await service.remove(1);

      expect(mockProductoRepo.delete).toHaveBeenCalledWith({ id_producto: 1 });
      expect(mockAuditoriaService.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ accion: 'DELETE', modulo: 'productos' }),
      );
      expect(result).toEqual({ raw: [], affected: 1 });
    });
  });
});
