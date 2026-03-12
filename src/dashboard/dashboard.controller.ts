import { Controller, Get } from '@nestjs/common';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('kpis')
  getKpis() {
    return this.dashboardService.getKpis();
  }

  @Get('orders-status')
  getOrdersStatus() {
    return this.dashboardService.getOrdersStatus();
  }

  @Get('production-funnel')
  getProductionFunnel() {
    return this.dashboardService.getProductionFunnel();
  }

  @Get('top-productos')
  getTopProductos() {
    return this.dashboardService.getTopProductos();
  }

  @Get('ventas-por-mes')
  getVentasPorMes() {
    return this.dashboardService.getVentasPorMes();
  }

  @Get('prediccion-stock')
  getPrediccionStock() {
    return this.dashboardService.getPrediccionStock();
  }

  @Get('recent-activity')
  getRecentActivity() {
    return this.dashboardService.getRecentActivity();
  }

  @Get('proximos-a-entregar')
  getProximosAEntregar() {
    return this.dashboardService.getProximosAEntregar();
  }
}
