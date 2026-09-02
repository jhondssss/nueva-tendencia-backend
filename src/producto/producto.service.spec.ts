import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { ProductoService } from './producto.service';
import { Producto } from './entities/producto.entity';
import { SolicitudPedido } from '../solicitud-pedido/entities/solicitud-pedido.entity';
import { CategoriaProducto } from '../categoria-producto/entities/categoria-producto.entity';
import { KardexService } from '../kardex/kardex.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { CreateProductoDto } from './dto/create-producto.dto';
import { UpdateProductoDto } from './dto/update-producto.dto';

function fkError(table: string): QueryFailedError {
  const driverError = { code: '23503', table, message: 'fk violation' };
  return new QueryFailedError('DELETE ...', undefined, driverError as unknown as Error);
}

describe('ProductoService', () => {
  let service: ProductoService;

  const mockProductoRepo = {
    findOne: jest.fn(),
    delete: jest.fn(),
    create: jest.fn((v: unknown) => v),
    save: jest.fn(),
    update: jest.fn(),
  };

  const mockSolicitudRepo = {
    findOne: jest.fn().mockResolvedValue(null),
  };

  const mockCategoriaProductoRepo = {
    findOne: jest.fn(),
  };

  const mockKardexService = {};
  const mockAuditoriaService = { registrar: jest.fn().mockResolvedValue(undefined) };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductoService,
        { provide: getRepositoryToken(Producto), useValue: mockProductoRepo },
        { provide: getRepositoryToken(SolicitudPedido), useValue: mockSolicitudRepo },
        { provide: getRepositoryToken(CategoriaProducto), useValue: mockCategoriaProductoRepo },
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

    it('bloquea el borrado si el producto tiene una solicitud de pedido Pendiente', async () => {
      const producto = { id_producto: 1, nombre_modelo: 'Bota Test' };
      mockProductoRepo.findOne.mockResolvedValue(producto);
      mockSolicitudRepo.findOne.mockResolvedValue({ id_solicitud: 5, estado: 'Pendiente' });

      await expect(service.remove(1)).rejects.toThrow(ConflictException);
      await expect(service.remove(1)).rejects.toThrow(
        'Este producto tiene solicitudes de pedido pendientes, resolvelas antes de eliminarlo',
      );
      expect(mockProductoRepo.delete).not.toHaveBeenCalled();
      expect(mockSolicitudRepo.findOne).toHaveBeenCalledWith({
        where: { producto: { id_producto: 1 }, estado: 'Pendiente' },
      });
    });
  });

  describe('create — categoria_id', () => {
    beforeEach(() => {
      mockProductoRepo.findOne.mockResolvedValue(null); // sin duplicado por nombre+marca
      mockProductoRepo.save.mockImplementation((v: any) => Promise.resolve({ ...v, id_producto: 1, stock: v.stock ?? 0 }));
    });

    const baseDto = { nombre_modelo: 'Bota', marca: 'NT' } as unknown as CreateProductoDto;

    it('sin categoria_id (ausente) crea el producto con categoria null, sin validar', async () => {
      const saved = await service.create(baseDto);

      expect(mockCategoriaProductoRepo.findOne).not.toHaveBeenCalled();
      expect(saved.categoria).toBeNull();
    });

    it('con categoria_id numérico válido, valida y asigna la relación', async () => {
      mockCategoriaProductoRepo.findOne.mockResolvedValue({ id_categoria_producto: 3 });

      const saved = await service.create({ ...baseDto, categoria_id: 3 });

      expect(mockCategoriaProductoRepo.findOne).toHaveBeenCalledWith({ where: { id_categoria_producto: 3 } });
      expect(saved.categoria).toEqual({ id_categoria_producto: 3 });
    });

    it('con categoria_id null explícito, crea con categoria null sin validar', async () => {
      const saved = await service.create({ ...baseDto, categoria_id: null });

      expect(mockCategoriaProductoRepo.findOne).not.toHaveBeenCalled();
      expect(saved.categoria).toBeNull();
    });
  });

  describe('update — categoria_id', () => {
    beforeEach(() => {
      mockProductoRepo.findOne.mockResolvedValue({ id_producto: 1, nombre_modelo: 'Bota', stock: 5 });
      mockProductoRepo.update.mockResolvedValue({ affected: 1 });
    });

    it('sin categoria_id (ausente) no toca la relación categoria', async () => {
      await service.update(1, { nombre_modelo: 'Bota v2' } as unknown as UpdateProductoDto);

      expect(mockCategoriaProductoRepo.findOne).not.toHaveBeenCalled();
      const llamadaCategoria = mockProductoRepo.update.mock.calls.find(([, campos]) => 'categoria' in (campos ?? {}));
      expect(llamadaCategoria).toBeUndefined();
    });

    it('con categoria_id numérico válido, valida y actualiza la relación', async () => {
      mockCategoriaProductoRepo.findOne.mockResolvedValue({ id_categoria_producto: 2 });

      await service.update(1, { categoria_id: 2 } as unknown as UpdateProductoDto);

      expect(mockCategoriaProductoRepo.findOne).toHaveBeenCalledWith({ where: { id_categoria_producto: 2 } });
      expect(mockProductoRepo.update).toHaveBeenCalledWith(
        { id_producto: 1 },
        { categoria: { id_categoria_producto: 2 } },
      );
    });

    it('con categoria_id null explícito, limpia la relación sin validar', async () => {
      await service.update(1, { categoria_id: null } as unknown as UpdateProductoDto);

      expect(mockCategoriaProductoRepo.findOne).not.toHaveBeenCalled();
      expect(mockProductoRepo.update).toHaveBeenCalledWith(
        { id_producto: 1 },
        { categoria: null },
      );
    });

    it('con categoria_id inexistente, lanza NotFoundException y no actualiza', async () => {
      mockCategoriaProductoRepo.findOne.mockResolvedValue(null);

      await expect(service.update(1, { categoria_id: 999 } as unknown as UpdateProductoDto))
        .rejects.toThrow(NotFoundException);
      expect(mockProductoRepo.update).not.toHaveBeenCalled();
    });
  });
});
