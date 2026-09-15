import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { ReportesController } from './reportes.controller';
import { ReportesService } from './reportes.service';
import { DownloadTokenService } from '../auth/download-token.service';

describe('ReportesController · GET /reportes/pdf/comprobante/:pedidoId', () => {
  let controller: ReportesController;
  const reportesService = { generarComprobantePedido: jest.fn() };
  const downloadTokenService = { generar: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReportesController],
      providers: [
        { provide: ReportesService, useValue: reportesService },
        { provide: DownloadTokenService, useValue: downloadTokenService },
      ],
    }).compile();

    controller = module.get<ReportesController>(ReportesController);
  });

  afterEach(() => jest.clearAllMocks());

  function buildRes() {
    return { set: jest.fn(), end: jest.fn() } as any;
  }

  it('no restringe por dueño cuando el usuario es admin (clienteId no se pasa al service)', async () => {
    reportesService.generarComprobantePedido.mockResolvedValue(Buffer.from('%PDF-'));
    const res = buildRes();
    const req = { user: { role: 'admin', email: 'admin@nt.com' } };

    await controller.pdfComprobante('42', res, req as any);

    expect(reportesService.generarComprobantePedido).toHaveBeenCalledWith(42, 'admin@nt.com', undefined);
  });

  it('no restringe por dueño cuando el usuario es operario', async () => {
    reportesService.generarComprobantePedido.mockResolvedValue(Buffer.from('%PDF-'));
    const res = buildRes();
    const req = { user: { role: 'operario', email: 'operario@nt.com' } };

    await controller.pdfComprobante('42', res, req as any);

    expect(reportesService.generarComprobantePedido).toHaveBeenCalledWith(42, 'operario@nt.com', undefined);
  });

  it('pasa el clienteId de la sesión autenticada cuando el rol es cliente (nunca uno arbitrario de la URL)', async () => {
    reportesService.generarComprobantePedido.mockResolvedValue(Buffer.from('%PDF-'));
    const res = buildRes();
    const req = { user: { role: 'cliente', email: 'cliente@nt.com', clienteId: 7 } };

    await controller.pdfComprobante('42', res, req as any);

    expect(reportesService.generarComprobantePedido).toHaveBeenCalledWith(42, 'cliente@nt.com', 7);
  });

  it('deja que el ForbiddenException del service (pedido ajeno) se propague sin capturarlo', async () => {
    reportesService.generarComprobantePedido.mockRejectedValue(
      new ForbiddenException('No tenés permiso para acceder a este comprobante'),
    );
    const res = buildRes();
    const req = { user: { role: 'cliente', email: 'cliente@nt.com', clienteId: 7 } };

    await expect(controller.pdfComprobante('999', res, req as any)).rejects.toThrow(ForbiddenException);
  });

  it('arma el nombre de archivo y escribe el buffer del PDF en la respuesta (caso feliz)', async () => {
    const buffer = Buffer.from('%PDF-contenido');
    reportesService.generarComprobantePedido.mockResolvedValue(buffer);
    const res = buildRes();
    const req = { user: { role: 'admin', email: 'admin@nt.com' } };

    await controller.pdfComprobante('42', res, req as any);

    expect(res.set).toHaveBeenCalledWith({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="comprobante-pedido-42.pdf"',
      'Content-Length': String(buffer.length),
    });
    expect(res.end).toHaveBeenCalledWith(buffer);
  });
});
