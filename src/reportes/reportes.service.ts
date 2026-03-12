import { Injectable } from '@nestjs/common';
import { PdfService } from './pdf.service';
import { ExcelService } from './excel.service';
import { DiarioService } from './diario.service';
import { ResumenDiario } from './interfaces/reporte.interface';

// Facade Pattern: delega a PdfService, ExcelService y DiarioService (SRP + OCP + DIP)
@Injectable()
export class ReportesService {
  constructor(
    private readonly pdfService:    PdfService,
    private readonly excelService:  ExcelService,
    private readonly diarioService: DiarioService,
  ) {}

  // ── PDF ──────────────────────────────────────────────────────────────────

  generarPDFVentas(year: number): Promise<Buffer> {
    return this.pdfService.generarPDFVentas(year);
  }

  generarPDFPedidos(): Promise<Buffer> {
    return this.pdfService.generarPDFPedidos();
  }

  generarPDFStock(): Promise<Buffer> {
    return this.pdfService.generarPDFStock();
  }

  generarPDFPedidosEntregados(): Promise<Buffer> {
    return this.pdfService.generarPDFPedidosEntregados();
  }

  generarPDFGanancias(month: number, year: number): Promise<Buffer> {
    return this.pdfService.generarPDFGanancias(month, year);
  }

  // ── Excel ─────────────────────────────────────────────────────────────────

  exportarExcelPedidos(): Promise<Buffer> {
    return this.excelService.exportarExcelPedidos();
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

  async generarPDFDiario(): Promise<Buffer> {
    const data = await this.diarioService.getResumenDiario();
    return this.pdfService.generarPDFDiario(data);
  }

  async exportarExcelDiario(): Promise<Buffer> {
    const data = await this.diarioService.getResumenDiario();
    return this.excelService.exportarExcelDiario(data);
  }
}
