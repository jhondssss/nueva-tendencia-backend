import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { InsumoService } from './insumo.service';
import { Insumo } from './entities/insumo.entity';
import { KardexService } from '../kardex/kardex.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { TelegramService } from '../telegram/telegram.service';

describe('InsumoService', () => {
  let service: InsumoService;

  const mockInsumoRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockKardexService = { registrarMovimientoInsumo: jest.fn() };
  const mockAuditoriaService = { registrar: jest.fn().mockResolvedValue(undefined) };
  const mockTelegramService = { sendMessage: jest.fn().mockResolvedValue(undefined) };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InsumoService,
        { provide: getRepositoryToken(Insumo), useValue: mockInsumoRepo },
        { provide: KardexService, useValue: mockKardexService },
        { provide: AuditoriaService, useValue: mockAuditoriaService },
        { provide: TelegramService, useValue: mockTelegramService },
      ],
    }).compile();

    service = module.get<InsumoService>(InsumoService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('guarda correctamente un nuevo insumo con stock inicial', async () => {
      const dto = {
        nombre: 'Pegamento industrial',
        categoria: 'adhesivo' as const,
        unidad_medida: 'litro' as const,
        stock: 10,
        nivel_minimo: 2,
      };

      // El servicio crea con stock=0 internamente y luego el kardex lo actualiza
      const insumoCreado = { id_insumo: 1, ...dto, stock: 0, activo: true, precio_unitario: 0 };
      const insumoFinal = { ...insumoCreado, stock: 10 };

      mockInsumoRepo.create.mockReturnValue(insumoCreado);
      mockInsumoRepo.save.mockResolvedValue(insumoCreado);
      mockKardexService.registrarMovimientoInsumo.mockResolvedValue(undefined);
      mockInsumoRepo.findOne.mockResolvedValue(insumoFinal);

      const result = await service.create(dto);

      // Debe persistir con stock=0 para que el kardex controle el tracking
      expect(mockInsumoRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ nombre: dto.nombre, stock: 0 }),
      );
      expect(mockInsumoRepo.save).toHaveBeenCalled();
      // Debe registrar la entrada inicial de 10 unidades en el kardex
      expect(mockKardexService.registrarMovimientoInsumo).toHaveBeenCalledWith(
        expect.objectContaining({ tipo: 'entrada', cantidad: 10 }),
        undefined,
      );
      expect(result).toEqual(insumoFinal);
    });
  });

  describe('update', () => {
    it('actualizar stock delega la reducción al kardex con tipo ajuste', async () => {
      const insumoActual = {
        id_insumo: 5,
        nombre: 'Cuero natural',
        stock: 20,
        nivel_minimo: 5,
        activo: true,
        precio_unitario: 15,
      };
      const insumoActualizado = { ...insumoActual, stock: 10 };

      mockInsumoRepo.findOne
        .mockResolvedValueOnce(insumoActual)       // lectura inicial en findOne()
        .mockResolvedValueOnce(insumoActualizado); // retorno final en findOne()
      mockInsumoRepo.save.mockResolvedValue(insumoActual);
      mockKardexService.registrarMovimientoInsumo.mockResolvedValue(undefined);

      const result = await service.update(5, { stock: 10 });

      // El nuevo stock (10) debe enviarse al kardex como ajuste, no la delta
      expect(mockKardexService.registrarMovimientoInsumo).toHaveBeenCalledWith(
        expect.objectContaining({
          insumo_id: 5,
          tipo: 'ajuste',
          cantidad: 10,
        }),
        undefined,
      );
      expect(result.stock).toBe(10);
    });
  });
});
