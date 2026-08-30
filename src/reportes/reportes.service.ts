import { Injectable } from '@nestjs/common';
import { PdfService } from './pdf.service';
import { ExcelService } from './excel.service';
import { DiarioService } from './diario.service';
import { ResumenDiario } from './interfaces/reporte.interface';
import { PedidoReporteFiltroDto } from './dto/pedido-reporte-filtro.dto';

// Facade Pattern: delega a PdfService, ExcelService y DiarioService (SRP + OCP + DIP)
@Injectable()
export class ReportesService {
  constructor(
    private readonly pdfService:    PdfService,
    private readonly excelService:  ExcelService,
    private readonly diarioService: DiarioService,
  ) {}

  // ── PDF ──────────────────────────────────────────────────────────────────

  generarPDFVentas(year: number, usuario?: string): Promise<Buffer> {
    return this.pdfService.generarPDFVentas(year, usuario);
  }

  generarPDFPedidos(filtro?: PedidoReporteFiltroDto, usuario?: string): Promise<Buffer> {
    return this.pdfService.generarPDFPedidos(filtro, usuario);
  }

  generarPDFStock(usuario?: string): Promise<Buffer> {
    return this.pdfService.generarPDFStock(usuario);
  }

  generarPDFPedidosEntregados(usuario?: string): Promise<Buffer> {
    return this.pdfService.generarPDFPedidosEntregados(usuario);
  }

  generarPDFGanancias(month: number, year: number, usuario?: string): Promise<Buffer> {
    return this.pdfService.generarPDFGanancias(month, year, usuario);
  }

  // ── Excel ─────────────────────────────────────────────────────────────────

  exportarExcelPedidos(filtro?: PedidoReporteFiltroDto): Promise<Buffer> {
    return this.excelService.exportarExcelPedidos(filtro);
  }

  exportarExcelClientes(): Promise<Buffer> {
    return this.excelService.exportarExcelClientes();
  }

  exportarExcelStock(): Promise<Buffer> {
    return this.excelService.exportarExcelStock();
  }

  exportarExcelPedidosEntregados(): Promise<Buffer> {
    return this.excelService.exportarExcelPedidosEntregados();
  }

  exportarExcelGanancias(month: number, year: number): Promise<Buffer> {
    return this.excelService.exportarExcelGanancias(month, year);
  }

  // ── Diario ────────────────────────────────────────────────────────────────

  getResumenDiario(): Promise<ResumenDiario> {
    return this.diarioService.getResumenDiario();
  }

  async generarPDFDiario(usuario?: string): Promise<Buffer> {
    const data = await this.diarioService.getResumenDiario();
    return this.pdfService.generarPDFDiario(data, usuario);
  }

  async exportarExcelDiario(): Promise<Buffer> {
    const data = await this.diarioService.getResumenDiario();
    return this.excelService.exportarExcelDiario(data);
  }
}
