import type { ChartData } from '../services/chartService';
import type { UsuarioEquipamentoDashboard } from './UsuarioEquipamentoDashboard';

export interface DashboardChartBundleEntry {
  dashboardItemId: number;
  chartData: ChartData | null;
  error: string | null;
}

export interface DashboardChartBundleResponse {
  items: UsuarioEquipamentoDashboard[];
  charts: DashboardChartBundleEntry[];
}
