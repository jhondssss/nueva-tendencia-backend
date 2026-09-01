import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { ProductoService } from './producto.service';
import { Producto } from './entities/producto.entity';
import { KardexService } from '../kardex/kardex.service';
import { AuditoriaService } from '../auditoria/auditoria.service';

function fkError(table: string): QueryFailedError {
  const driverError = { code: '23503', table, message: 'fk violation' };
  return new QueryFailedError('DELETE ...', undefined, driverError as unknown as Error);
}

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

    it('convierte una violación de FK contra pedidos en un mensaje de negocio claro', async () => {
      const producto = { id_producto: 1, nombre_modelo: 'Bota Test' };
      mockProductoRepo.findOne.mockResolvedValue(producto);
      mockProductoRepo.delete.mockRejectedValue(fkError('pedidos'));

      await expect(service.remove(1)).rejects.toThrow(ConflictException);
      await expect(service.remove(1)).rejects.toThrow('tiene pedidos asociados');
      expect(mockAuditoriaService.registrar).not.toHaveBeenCalled();
    });

    it('re-lanza un error que no es de FK sin envolverlo', async () => {
      const producto = { id_producto: 1, nombre_modelo: 'Bota Test' };
      mockProductoRepo.findOne.mockResolvedValue(producto);
      const otroError = new Error('conexión perdida');
      mockProductoRepo.delete.mockRejectedValue(otroError);

      await expect(service.remove(1)).rejects.toThrow(otroError);
    });
  });
});
