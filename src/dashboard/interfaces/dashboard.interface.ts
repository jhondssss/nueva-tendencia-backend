// ISP: interfaces específicas por responsabilidad del dashboard

export interface IKpiService {
  getKpis(): Promise<any>;
  getOrdersStatus(): Promise<any[]>;
  getProductionFunnel(): Promise<any[]>;
  getRecentActivity(): Promise<any>;
}

export interface IPrediccionService {
  getPrediccionStock(): Promise<any[]>;
  getVentasPorMes(): Promise<any[]>;
  getTopProductos(): Promise<any[]>;
}
