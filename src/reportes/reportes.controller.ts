import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ReportesService } from './reportes.service';
import { Public } from '../auth/decorators/public.decorator';

@Public()
@Controller('reportes')
export class ReportesController {
  constructor(private readonly reportesService: ReportesService) {}

  // ── PDF endpoints ──────────────────────────────────────────────────────────

  /** GET /reportes/pdf/ventas?year=2025 */
  @Get('pdf/ventas')
  async pdfVentas(@Query('year') year: string, @Res() res: Response) {
    const y = parseInt(year, 10) || new Date().getFullYear();
    const buffer = await this.reportesService.generarPDFVentas(y);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="ventas-${y}.pdf"`,
      'Content-Length': String(buffer.length),
    });
    res.end(buffer);
  }

  /** GET /reportes/pdf/pedidos */
  @Get('pdf/pedidos')
  async pdfPedidos(@Res() res: Response) {
    const buffer = await this.reportesService.generarPDFPedidos();
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="pedidos.pdf"',
      'Content-Length': String(buffer.length),
    });
    res.end(buffer);
  }

  /** GET /reportes/pdf/stock */
  @Get('pdf/stock')
  async pdfStock(@Res() res: Response) {
    const buffer = await this.reportesService.generarPDFStock();
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="stock-critico.pdf"',
      'Content-Length': String(buffer.length),
    });
    res.end(buffer);
  }

  /** GET /reportes/pdf/stock-critico */
  @Get('pdf/stock-critico')
  async pdfStockCritico(@Res() res: Response) {
    const buffer = await this.reportesService.generarPDFStock();
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="stock-critico.pdf"',
      'Content-Length': String(buffer.length),
    });
    res.end(buffer);
  }

  /** GET /reportes/pdf/pedidos-entregados */
  @Get('pdf/pedidos-entregados')
  async pdfPedidosEntregados(@Res() res: Response) {
    const buffer = await this.reportesService.generarPDFPedidosEntregados();
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="pedidos-entregados.pdf"',
      'Content-Length': String(buffer.length),
    });
    res.end(buffer);
  }

  /** GET /reportes/pdf/ganancias?month=3&year=2026 */
  @Get('pdf/ganancias')
  async pdfGanancias(
    @Query('month') month: string,
    @Query('year') year: string,
    @Res() res: Response,
  ) {
    const now = new Date();
    const m = parseInt(month, 10) || now.getMonth() + 1;
    const y = parseInt(year, 10)  || now.getFullYear();
    const buffer = await this.reportesService.generarPDFGanancias(m, y);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="ganancias-${y}-${String(m).padStart(2, '0')}.pdf"`,
      'Content-Length': String(buffer.length),
    });
    res.end(buffer);
  }

  // ── Excel endpoints ────────────────────────────────────────────────────────

  /** GET /reportes/excel/pedidos-entregados */
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

  /** GET /reportes/excel/pedidos */
  @Get('excel/pedidos')
  async excelPedidos(@Res() res: Response) {
    const buffer = await this.reportesService.exportarExcelPedidos();
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="pedidos.xlsx"',
      'Content-Length': String(buffer.length),
    });
    res.end(buffer);
  }

  /** GET /reportes/excel/clientes */
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
  @Get('diario')
  async getDiario() {
    return this.reportesService.getResumenDiario();
  }

  /** GET /reportes/pdf/diario */
  @Get('pdf/diario')
  async pdfDiario(@Res() res: Response) {
    const now    = new Date();
    const fecha  = now.toISOString().slice(0, 10).split('-').reverse().join('-'); // dd-mm-yyyy
    const buffer = await this.reportesService.generarPDFDiario();
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="reporte-diario-${fecha}.pdf"`,
      'Content-Length': String(buffer.length),
    });
    res.end(buffer);
  }

  /** GET /reportes/excel/diario */
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
