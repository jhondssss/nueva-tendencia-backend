import { Controller, Get, Param, Post, Query, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ReportesService } from './reportes.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { AllowDownloadToken } from '../auth/decorators/allow-download-token.decorator';
import { DownloadTokenService, DOWNLOAD_TOKEN_TTL_SECONDS } from '../auth/download-token.service';
import { PedidoReporteFiltroDto } from './dto/pedido-reporte-filtro.dto';
import { StockReporteFiltroDto } from './dto/stock-reporte-filtro.dto';
import { KardexReporteFiltroDto } from './dto/kardex-reporte-filtro.dto';

@Controller('reportes')
export class ReportesController {
  constructor(
    private readonly reportesService: ReportesService,
    private readonly downloadTokenService: DownloadTokenService,
  ) {}

  /**
   * Token de un solo uso (2 min) para autorizar UNA descarga puntual de un
   * endpoint de este controller vía navegación directa (window.open), donde
   * no se puede adjuntar el header Authorization ni depender de la cookie de
   * sesión (bloqueo de cookies de terceros en navegación cross-site).
   */
  @Roles('admin', 'operario')
  @Post('download-token')
  crearTokenDescarga(@Req() req: any) {
    const token = this.downloadTokenService.generar({
      sub: req.user.sub,
      email: req.user.email,
      role: req.user.role,
    });
    return { token, expiresIn: DOWNLOAD_TOKEN_TTL_SECONDS };
  }

  // ── PDF endpoints ──────────────────────────────────────────────────────────

  /** GET /reportes/pdf/ventas?year=2025&month=9 (month es opcional: sin él, desglose de los 12 meses) */
  @Roles('admin')
  @AllowDownloadToken()
  @Get('pdf/ventas')
  async pdfVentas(
    @Query('year') year: string,
    @Query('month') month: string,
    @Res() res: Response,
    @Req() req: any,
  ) {
    const y = parseInt(year, 10) || new Date().getFullYear();
    const mParsed = parseInt(month, 10);
    const m = mParsed >= 1 && mParsed <= 12 ? mParsed : undefined;
    const buffer = await this.reportesService.generarPDFVentas(y, req.user?.email, m);
    const filename = m ? `ventas-${y}-${String(m).padStart(2, '0')}.pdf` : `ventas-${y}.pdf`;
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(buffer.length),
    });
    res.end(buffer);
  }

  /** GET /reportes/pdf/pedidos?cliente=&producto=&categoria=&desde=&hasta= */
  @Roles('admin', 'operario')
  @AllowDownloadToken()
  @Get('pdf/pedidos')
  async pdfPedidos(@Query() filtro: PedidoReporteFiltroDto, @Res() res: Response, @Req() req: any) {
    const buffer = await this.reportesService.generarPDFPedidos(filtro, req.user?.email);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="pedidos.pdf"',
      'Content-Length': String(buffer.length),
    });
    res.end(buffer);
  }

  /** GET /reportes/pdf/stock?categoria= */
  @Roles('admin', 'operario')
  @AllowDownloadToken()
  @Get('pdf/stock')
  async pdfStock(@Query() filtro: StockReporteFiltroDto, @Res() res: Response, @Req() req: any) {
    const buffer = await this.reportesService.generarPDFStock(filtro, req.user?.email);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="stock-critico.pdf"',
      'Content-Length': String(buffer.length),
    });
    res.end(buffer);
  }

  /** GET /reportes/pdf/stock-critico?categoria= */
  @Roles('admin', 'operario')
  @AllowDownloadToken()
  @Get('pdf/stock-critico')
  async pdfStockCritico(@Query() filtro: StockReporteFiltroDto, @Res() res: Response, @Req() req: any) {
    const buffer = await this.reportesService.generarPDFStock(filtro, req.user?.email);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="stock-critico.pdf"',
      'Content-Length': String(buffer.length),
    });
    res.end(buffer);
  }

  /** GET /reportes/pdf/pedidos-entregados?cliente=&producto=&categoria=&desde=&hasta=
   * desde/hasta filtran por fecha_entrega (mismo criterio que Ventas y Ganancias). */
  @Roles('admin', 'operario')
  @AllowDownloadToken()
  @Get('pdf/pedidos-entregados')
  async pdfPedidosEntregados(@Query() filtro: PedidoReporteFiltroDto, @Res() res: Response, @Req() req: any) {
    const buffer = await this.reportesService.generarPDFPedidosEntregados(filtro, req.user?.email);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="pedidos-entregados.pdf"',
      'Content-Length': String(buffer.length),
    });
    res.end(buffer);
  }

  /** GET /reportes/pdf/ganancias?month=3&year=2026 */
  @Roles('admin')
  @AllowDownloadToken()
  @Get('pdf/ganancias')
  async pdfGanancias(
    @Query('month') month: string,
    @Query('year') year: string,
    @Res() res: Response,
    @Req() req: any,
  ) {
    const now = new Date();
    const m = parseInt(month, 10) || now.getMonth() + 1;
    const y = parseInt(year, 10)  || now.getFullYear();
    const buffer = await this.reportesService.generarPDFGanancias(m, y, req.user?.email);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="ganancias-${y}-${String(m).padStart(2, '0')}.pdf"`,
      'Content-Length': String(buffer.length),
    });
    res.end(buffer);
  }

  /** GET /reportes/pdf/kardex?desde=&hasta=&insumo_id=&tipo=&origen=&categoria_insumo_id= */
  @Roles('admin', 'operario')
  @AllowDownloadToken()
  @Get('pdf/kardex')
  async pdfKardex(@Query() filtro: KardexReporteFiltroDto, @Res() res: Response, @Req() req: any) {
    const buffer = await this.reportesService.generarPDFKardex(filtro, req.user?.email);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="kardex.pdf"',
      'Content-Length': String(buffer.length),
    });
    res.end(buffer);
  }

  /** GET /reportes/pdf/comprobante/:pedidoId — comprobante interno de UN pedido puntual
   * (no factura fiscal). El rol cliente solo puede acceder al comprobante de su propio
   * pedido: se verifica contra el pedido en BD, nunca contra lo que declare el cliente. */
  @Roles('admin', 'operario', 'cliente')
  @AllowDownloadToken()
  @Get('pdf/comprobante/:pedidoId')
  async pdfComprobante(@Param('pedidoId') pedidoId: string, @Res() res: Response, @Req() req: any) {
    const id = parseInt(pedidoId, 10);
    const clienteId = req.user?.role === 'cliente' ? req.user.clienteId : undefined;
    const buffer = await this.reportesService.generarComprobantePedido(id, req.user?.email, clienteId);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="comprobante-pedido-${id}.pdf"`,
      'Content-Length': String(buffer.length),
    });
    res.end(buffer);
  }

  // ── Excel endpoints ────────────────────────────────────────────────────────

  /** GET /reportes/excel/pedidos-entregados?cliente=&producto=&categoria=&desde=&hasta=
   * desde/hasta filtran por fecha_entrega (mismo criterio que Ventas y Ganancias). */
  @Roles('admin', 'operario')
  @AllowDownloadToken()
  @Get('excel/pedidos-entregados')
  async excelPedidosEntregados(@Query() filtro: PedidoReporteFiltroDto, @Res() res: Response) {
    const buffer = await this.reportesService.exportarExcelPedidosEntregados(filtro);
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="pedidos-entregados.xlsx"',
      'Content-Length': String(buffer.length),
    });
    res.end(buffer);
  }

  /** GET /reportes/excel/ganancias?month=3&year=2026 */
  @Roles('admin')
  @AllowDownloadToken()
  @Get('excel/ganancias')
  async excelGanancias(
    @Query('month') month: string,
    @Query('year') year: string,
    @Res() res: Response,
  ) {
    const now = new Date();
    const m = parseInt(month, 10) || now.getMonth() + 1;
    const y = parseInt(year, 10)  || now.getFullYear();
    const buffer = await this.reportesService.exportarExcelGanancias(m, y);
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="ganancias-${y}-${String(m).padStart(2, '0')}.xlsx"`,
      'Content-Length': String(buffer.length),
    });
    res.end(buffer);
  }

  /** GET /reportes/excel/pedidos?cliente=&producto=&categoria=&desde=&hasta= */
  @Roles('admin', 'operario')
  @AllowDownloadToken()
  @Get('excel/pedidos')
  async excelPedidos(@Query() filtro: PedidoReporteFiltroDto, @Res() res: Response) {
    const buffer = await this.reportesService.exportarExcelPedidos(filtro);
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="pedidos.xlsx"',
      'Content-Length': String(buffer.length),
    });
    res.end(buffer);
  }

  /** GET /reportes/excel/clientes */
  @Roles('admin')
  @AllowDownloadToken()
  @Get('excel/clientes')
  async excelClientes(@Res() res: Response) {
    const buffer = await this.reportesService.exportarExcelClientes();
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="clientes.xlsx"',
      'Content-Length': String(buffer.length),
    });
    res.end(buffer);
  }

  /** GET /reportes/excel/stock?categoria= */
  @Roles('admin', 'operario')
  @AllowDownloadToken()
  @Get('excel/stock')
  async excelStock(@Query() filtro: StockReporteFiltroDto, @Res() res: Response) {
    const buffer = await this.reportesService.exportarExcelStock(filtro);
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="stock.xlsx"',
      'Content-Length': String(buffer.length),
    });
    res.end(buffer);
  }

  /** GET /reportes/excel/kardex?desde=&hasta=&insumo_id=&tipo=&origen=&categoria_insumo_id= */
  @Roles('admin', 'operario')
  @AllowDownloadToken()
  @Get('excel/kardex')
  async excelKardex(@Query() filtro: KardexReporteFiltroDto, @Res() res: Response) {
    const buffer = await this.reportesService.exportarExcelKardex(filtro);
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="kardex.xlsx"',
      'Content-Length': String(buffer.length),
    });
    res.end(buffer);
  }

  // ── Diario ─────────────────────────────────────────────────────────────────

  /** GET /reportes/diario */
  @Roles('admin')
  @Get('diario')
  async getDiario() {
    return this.reportesService.getResumenDiario();
  }

  /** GET /reportes/pdf/diario */
  @Roles('admin')
  @AllowDownloadToken()
  @Get('pdf/diario')
  async pdfDiario(@Res() res: Response, @Req() req: any) {
    const now    = new Date();
    const fecha  = now.toISOString().slice(0, 10).split('-').reverse().join('-'); // dd-mm-yyyy
    const buffer = await this.reportesService.generarPDFDiario(req.user?.email);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="reporte-diario-${fecha}.pdf"`,
      'Content-Length': String(buffer.length),
    });
    res.end(buffer);
  }

  /** GET /reportes/excel/diario */
  @Roles('admin')
  @AllowDownloadToken()
  @Get('excel/diario')
  async excelDiario(@Res() res: Response) {
    const now    = new Date();
    const fecha  = now.toISOString().slice(0, 10).split('-').reverse().join('-'); // dd-mm-yyyy
    const buffer = await this.reportesService.exportarExcelDiario();
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="reporte-diario-${fecha}.xlsx"`,
      'Content-Length': String(buffer.length),
    });
    res.end(buffer);
  }
}
