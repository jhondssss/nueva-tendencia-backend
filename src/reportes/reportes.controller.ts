import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ReportesService } from './reportes.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { PedidoReporteFiltroDto } from './dto/pedido-reporte-filtro.dto';

@Controller('reportes')
export class ReportesController {
  constructor(private readonly reportesService: ReportesService) {}

  // ── PDF endpoints ──────────────────────────────────────────────────────────

  /** GET /reportes/pdf/ventas?year=2025 */
  @Roles('admin')
  @Get('pdf/ventas')
  async pdfVentas(@Query('year') year: string, @Res() res: Response, @Req() req: any) {
    const y = parseInt(year, 10) || new Date().getFullYear();
    const buffer = await this.reportesService.generarPDFVentas(y, req.user?.email);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="ventas-${y}.pdf"`,
      'Content-Length': String(buffer.length),
    });
    res.end(buffer);
  }

  /** GET /reportes/pdf/pedidos?cliente=&producto=&categoria=&desde=&hasta= */
  @Roles('admin', 'operario')
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

  /** GET /reportes/pdf/stock */
  @Roles('admin', 'operario')
  @Get('pdf/stock')
  async pdfStock(@Res() res: Response, @Req() req: any) {
    const buffer = await this.reportesService.generarPDFStock(req.user?.email);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="stock-critico.pdf"',
      'Content-Length': String(buffer.length),
    });
    res.end(buffer);
  }

  /** GET /reportes/pdf/stock-critico */
  @Roles('admin', 'operario')
  @Get('pdf/stock-critico')
  async pdfStockCritico(@Res() res: Response, @Req() req: any) {
    const buffer = await this.reportesService.generarPDFStock(req.user?.email);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="stock-critico.pdf"',
      'Content-Length': String(buffer.length),
    });
    res.end(buffer);
  }

  /** GET /reportes/pdf/pedidos-entregados */
  @Roles('admin', 'operario')
  @Get('pdf/pedidos-entregados')
  async pdfPedidosEntregados(@Res() res: Response, @Req() req: any) {
    const buffer = await this.reportesService.generarPDFPedidosEntregados(req.user?.email);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="pedidos-entregados.pdf"',
      'Content-Length': String(buffer.length),
    });
    res.end(buffer);
  }

  /** GET /reportes/pdf/ganancias?month=3&year=2026 */
  @Roles('admin')
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

  // ── Excel endpoints ────────────────────────────────────────────────────────

  /** GET /reportes/excel/pedidos-entregados */
  @Roles('admin', 'operario')
  @Get('excel/pedidos-entregados')
  async excelPedidosEntregados(@Res() res: Response) {
    const buffer = await this.reportesService.exportarExcelPedidosEntregados();
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

  /** GET /reportes/excel/stock */
  @Roles('admin', 'operario')
  @Get('excel/stock')
  async excelStock(@Res() res: Response) {
    const buffer = await this.reportesService.exportarExcelStock();
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="stock.xlsx"',
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
