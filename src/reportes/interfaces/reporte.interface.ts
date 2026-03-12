// ISP: interfaces específicas por tipo de reporte

export interface IReportePDF {
  generarPDFVentas(year: number): Promise<Buffer>;
  generarPDFPedidos(): Promise<Buffer>;
  generarPDFStock(): Promise<Buffer>;
  generarPDFPedidosEntregados(): Promise<Buffer>;
  generarPDFGanancias(month: number, year: number): Promise<Buffer>;
  generarPDFDiario(data: ResumenDiario): Promise<Buffer>;
}

export interface IReporteExcel {
  exportarExcelPedidos(): Promise<Buffer>;
  exportarExcelClientes(): Promise<Buffer>;
  exportarExcelStock(): Promise<Buffer>;
  exportarExcelPedidosEntregados(): Promise<Buffer>;
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
