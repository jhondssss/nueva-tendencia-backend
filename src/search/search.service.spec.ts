import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SearchService } from './search.service';
import { SearchController } from './search.controller';
import { Cliente } from '../cliente/entities/cliente.entity';
import { Producto } from '../producto/entities/producto.entity';
import { Pedido } from '../pedido/entities/pedido.entity';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';

describe('SearchService', () => {
  let service: SearchService;

  const buildQueryBuilder = (resultado: any[]) => {
    const qb: any = {
      leftJoin: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orWhere: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(resultado),
    };
    return qb;
  };

  let clienteQb: any;
  let productoQb: any;
  let pedidoQb: any;

  const mockClienteRepo = { createQueryBuilder: jest.fn() };
  const mockProductoRepo = { createQueryBuilder: jest.fn() };
  const mockPedidoRepo = { createQueryBuilder: jest.fn() };

  beforeEach(async () => {
    clienteQb = buildQueryBuilder([]);
    productoQb = buildQueryBuilder([]);
    pedidoQb = buildQueryBuilder([]);
    mockClienteRepo.createQueryBuilder.mockReturnValue(clienteQb);
    mockProductoRepo.createQueryBuilder.mockReturnValue(productoQb);
    mockPedidoRepo.createQueryBuilder.mockReturnValue(pedidoQb);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        { provide: getRepositoryToken(Cliente), useValue: mockClienteRepo },
        { provide: getRepositoryToken(Producto), useValue: mockProductoRepo },
        { provide: getRepositoryToken(Pedido), useValue: mockPedidoRepo },
      ],
    }).compile();

    service = module.get<SearchService>(SearchService);
  });

  afterEach(() => jest.clearAllMocks());

  it('devuelve grupos vacíos si no se pasa término de búsqueda', async () => {
    const resultado = await service.buscar(undefined);

    expect(resultado).toEqual({ clientes: [], productos: [], pedidos: [] });
    expect(mockClienteRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('devuelve grupos vacíos si el término tiene menos de 2 caracteres', async () => {
    const resultado = await service.buscar('a');

    expect(resultado).toEqual({ clientes: [], productos: [], pedidos: [] });
    expect(mockProductoRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('busca clientes por nombre/apellido/correo y trunca a 5 resultados', async () => {
    clienteQb.getMany.mockResolvedValue([
      { id_cliente: 1, nombre: 'Juan', apellido: 'Perez', correo_electronico: 'juan@nt.com' },
    ]);

    const resultado = await service.buscar('juan');

    expect(clienteQb.where).toHaveBeenCalledWith('cliente.nombre ILIKE :patron', { patron: '%juan%' });
    expect(clienteQb.take).toHaveBeenCalledWith(5);
    expect(resultado.clientes).toEqual([
      { id: 1, titulo: 'Juan Perez', subtitulo: 'juan@nt.com' },
    ]);
  });

  it('busca productos por nombre_modelo/marca', async () => {
    productoQb.getMany.mockResolvedValue([
      { id_producto: 9, nombre_modelo: 'Bota Andina', marca: 'NT' },
    ]);

    const resultado = await service.buscar('bota');

    expect(productoQb.where).toHaveBeenCalledWith('producto.nombre_modelo ILIKE :patron', { patron: '%bota%' });
    expect(resultado.productos).toEqual([{ id: 9, titulo: 'Bota Andina', subtitulo: 'NT' }]);
  });

  it('busca pedidos por cliente/producto relacionados', async () => {
    pedidoQb.getMany.mockResolvedValue([
      {
        id_pedido: 3,
        cliente: { nombre: 'Ana', apellido: 'Lopez' },
        producto: { nombre_modelo: 'Zapato Urbano' },
      },
    ]);

    const resultado = await service.buscar('ana');

    expect(pedidoQb.leftJoin).toHaveBeenCalledWith('pedido.cliente', 'cliente');
    expect(pedidoQb.leftJoin).toHaveBeenCalledWith('pedido.producto', 'producto');
    expect(resultado.pedidos).toEqual([
      { id: 3, titulo: 'Pedido #3', subtitulo: 'Ana Lopez — Zapato Urbano' },
    ]);
  });

  it('si el término es numérico, también busca pedidos por id_pedido', async () => {
    await service.buscar('42');

    expect(pedidoQb.orWhere).toHaveBeenCalledWith('pedido.id_pedido = :idNumerico', { idNumerico: 42 });
  });

  it('escapa comodines de ILIKE (% y _) en el término de búsqueda', async () => {
    await service.buscar('50%_off');

    expect(clienteQb.where).toHaveBeenCalledWith('cliente.nombre ILIKE :patron', {
      patron: '%50\\%\\_off%',
    });
  });

  it('el endpoint de búsqueda solo está habilitado para admin y operario (nivel ruta)', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, SearchController.prototype.buscar);

    expect(roles).toEqual(['admin', 'operario']);
  });
});
