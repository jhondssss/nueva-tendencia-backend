// ISP: interfaces específicas por tipo de reporte

import { PedidoReporteFiltroDto } from '../dto/pedido-reporte-filtro.dto';
import { StockReporteFiltroDto } from '../dto/stock-reporte-filtro.dto';
import { KardexReporteFiltroDto } from '../dto/kardex-reporte-filtro.dto';

export interface IReportePDF {
  generarPDFVentas(year: number, usuario?: string): Promise<Buffer>;
  generarPDFPedidos(filtro?: PedidoReporteFiltroDto, usuario?: string): Promise<Buffer>;
  generarPDFStock(filtro?: StockReporteFiltroDto, usuario?: string): Promise<Buffer>;
  generarPDFPedidosEntregados(filtro?: PedidoReporteFiltroDto, usuario?: string): Promise<Buffer>;
  generarPDFGanancias(month: number, year: number, usuario?: string): Promise<Buffer>;
  generarPDFDiario(data: ResumenDiario, usuario?: string): Promise<Buffer>;
  generarPDFKardex(filtro?: KardexReporteFiltroDto, usuario?: string): Promise<Buffer>;
}

export interface IReporteExcel {
  exportarExcelPedidos(filtro?: PedidoReporteFiltroDto): Promise<Buffer>;
  exportarExcelClientes(): Promise<Buffer>;
  exportarExcelStock(filtro?: StockReporteFiltroDto): Promise<Buffer>;
  exportarExcelPedidosEntregados(filtro?: PedidoReporteFiltroDto): Promise<Buffer>;
  exportarExcelGanancias(month: number, year: number): Promise<Buffer>;
  exportarExcelDiario(data: ResumenDiario): Promise<Buffer>;
}

// ─── Tipos para el reporte diario ─────────────────────────────────────────────

export interface ResumenDiario {
  fecha: string;
  pedidosCreados: any[];
  pedidosMovidos: any[];
  pedidosTerminados: any[];
  ventasDia: number;
  movimientosKardex: any[];
  accionesAuditoria: any[];
  alertasStock: any[];
  alertasInsumos: any[];
  resumen: {
    totalPedidosCreados: number;
    totalPedidosMovidos: number;
    totalVentasDia: number;
    totalMovimientosKardex: number;
    totalAlertasCriticas: number;
  };
}

export interface IReporteDiario {
  getResumenDiario(): Promise<ResumenDiario>;
}
