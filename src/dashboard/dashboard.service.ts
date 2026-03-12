import { Injectable } from '@nestjs/common';
import { KpiService } from './kpi.service';
import { PrediccionService } from './prediccion.service';

// Facade Pattern: delega a KpiService y PrediccionService (SRP + OCP + DIP)
@Injectable()
export class DashboardService {
  constructor(
    private readonly kpiService:       KpiService,
    private readonly prediccionService: PrediccionService,
  ) {}

  // ── KPI ──────────────────────────────────────────────────────────────────

  getKpis() {
    return this.kpiService.getKpis();
  }

  getOrdersStatus() {
    return this.kpiService.getOrdersStatus();
  }

  getProductionFunnel() {
    return this.kpiService.getProductionFunnel();
  }

  getRecentActivity() {
    return this.kpiService.getRecentActivity();
  }

  getProximosAEntregar() {
    return this.kpiService.getProximosAEntregar();
  }

  // ── Predicción ────────────────────────────────────────────────────────────

  getPrediccionStock() {
    return this.prediccionService.getPrediccionStock();
  }

  getVentasPorMes() {
    return this.prediccionService.getVentasPorMes();
  }

  getTopProductos() {
    return this.prediccionService.getTopProductos();
  }
}
