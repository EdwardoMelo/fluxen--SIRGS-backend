import { UsuarioEquipamentoDashboardRepository } from '../repositories/usuarioEquipamentoDashboardRepository';
import { UsuarioDashboardBundleRepository } from '../repositories/usuarioDashboardBundleRepository';
import { UsuarioEquipamentoDashboard } from '../types/UsuarioEquipamentoDashboard';
import type {
  DashboardChartBundleEntry,
  DashboardChartBundleResponse,
} from '../types/DashboardChartBundle';
import { EquipamentoRepository } from '../repositories/equipamentoRepository';
import { hasEquipamentoPermission } from '../utils/equipamentoPermissionHelper';
import { ChartService, TimeRange } from './chartService';
import { logInfo, logWarn } from '../utils/logger';

export type AddEquipamentoToDashboardResult = {
  item: UsuarioEquipamentoDashboard;
  bundle: DashboardChartBundleResponse;
};

export type UpdateTipoGraficoResult = {
  item: UsuarioEquipamentoDashboard;
  bundle: DashboardChartBundleResponse;
};

export class UsuarioEquipamentoDashboardService {
  private repository = new UsuarioEquipamentoDashboardRepository();
  private dashboardBundleRepository = new UsuarioDashboardBundleRepository();
  private equipamentoRepository = new EquipamentoRepository();
  private chartService = new ChartService();

  /**
   * Busca todos os equipamentos do dashboard do usuário
   */
  async getEquipamentosDashboard(userId: number): Promise<UsuarioEquipamentoDashboard[]> {
    return this.repository.findByUsuarioId(userId);
  }

  /**
   * Lista do dashboard + dados de gráfico de cada card (paralelo por card).
   * Usa o mesmo critério de métrica/tipo que o ChartCard (métrica salva ou primeira do equipamento).
   */
  async getDashboardBundle(userId: number): Promise<DashboardChartBundleResponse> {
    try {
      const storedBundle = await this.dashboardBundleRepository.findByUsuarioId(userId);
      if (storedBundle?.bundle_json) {
        const parsed = this.parseStoredBundle(storedBundle.bundle_json);
        if (parsed && !this.isStoredBundleLikelyStale(parsed)) {
          return parsed;
        }
      }
    } catch (error) {
      logWarn('Failed to read stored dashboard bundle, using fallback', { userId, error });
    }

    return this.createDashboardBundle(userId, 'fallback');
  }

  async createDashboardBundle(
    userId: number,
    source: 'dashboard_edit' | 'logs' | 'fallback' = 'dashboard_edit'
  ): Promise<DashboardChartBundleResponse> {
    const bundle = await this.buildDashboardBundle(userId);
    await this.persistBundle(userId, bundle, source);
    return bundle;
  }

  /**
   * Atualiza só o card novo: reutiliza bundle persistido e monta um único gráfico.
   * Se não houver bundle alinhado ou estiver stale, cai no rebuild completo.
   */
  async addEquipamentoToBundle(
    userId: number,
    created: UsuarioEquipamentoDashboard
  ): Promise<DashboardChartBundleResponse> {
    const stored = await this.safeLoadParsedBundle(userId);
    if (
      !stored ||
      this.isStoredBundleLikelyStale(stored) ||
      !this.isBundleItemsChartsAligned(stored) ||
      stored.items.some((i) => i.id === created.id)
    ) {
      return this.createDashboardBundle(userId, 'dashboard_edit');
    }

    const newChart = await this.buildOneChartEntry(created);
    const bundle: DashboardChartBundleResponse = {
      items: [created, ...stored.items],
      charts: [newChart, ...stored.charts.filter((c) => c.dashboardItemId !== created.id)],
    };

    if (bundle.items.length !== stored.items.length + 1 || bundle.charts.length !== stored.charts.length + 1) {
      return this.createDashboardBundle(userId, 'dashboard_edit');
    }

    await this.persistBundle(userId, bundle, 'dashboard_edit');
    return bundle;
  }

  /**
   * Remove um card do JSON persistido sem recalcular os demais gráficos.
   */
  async removeEquipamentoFromBundle(
    userId: number,
    dashboardItemId: number
  ): Promise<DashboardChartBundleResponse> {
    const stored = await this.safeLoadParsedBundle(userId);
    if (!stored || this.isStoredBundleLikelyStale(stored) || !this.isBundleItemsChartsAligned(stored)) {
      return this.createDashboardBundle(userId, 'dashboard_edit');
    }

    const nextItems = stored.items.filter((i) => i.id !== dashboardItemId);
    const nextCharts = stored.charts.filter((c) => c.dashboardItemId !== dashboardItemId);

    if (nextItems.length === stored.items.length) {
      return this.createDashboardBundle(userId, 'dashboard_edit');
    }

    const bundle: DashboardChartBundleResponse = { items: nextItems, charts: nextCharts };
    if (!this.isBundleItemsChartsAligned(bundle)) {
      return this.createDashboardBundle(userId, 'dashboard_edit');
    }

    await this.persistBundle(userId, bundle, 'dashboard_edit');
    return bundle;
  }

  /**
   * Atualiza só o gráfico do card cujo tipo mudou: reescreve o item no JSON e recalcula um chart (inclui intervalo linha/barras via buildOneChartEntry).
   */
  async updateTipoGraficoInBundle(
    userId: number,
    updated: UsuarioEquipamentoDashboard,
    timeRange?: TimeRange
  ): Promise<DashboardChartBundleResponse> {
    logInfo('Atualizando tipo de gráfico no bundle', { userId, updated });
    
    const stored = await this.safeLoadParsedBundle(userId);
    if (!stored || this.isStoredBundleLikelyStale(stored) || !this.isBundleItemsChartsAligned(stored)) {
      return this.createDashboardBundle(userId, 'dashboard_edit');
    }

    if (!stored.items.some((i) => i.id === updated.id)) {
      return this.createDashboardBundle(userId, 'dashboard_edit');
    }

    const nextItems = stored.items.map((i) => (i.id === updated.id ? updated : i));
    const newChart = await this.buildOneChartEntry(updated, { timeRange });
    const nextCharts = stored.charts.map((c) =>
      c.dashboardItemId === updated.id ? newChart : c
    );

    const bundle: DashboardChartBundleResponse = { items: nextItems, charts: nextCharts };
    if (!this.isBundleItemsChartsAligned(bundle)) {
      return this.createDashboardBundle(userId, 'dashboard_edit');
    }

    logInfo('Bundle atualizado', { userId, bundle });

    await this.persistBundle(userId, bundle, 'dashboard_edit');
    return bundle;
  }

  /**
   * Atualiza apenas o timeRange do gráfico de um card no bundle persistido.
   */
  async updateTimeRangeInBundleByItemId(
    dashboardItemId: number,
    timeRange: TimeRange
  ): Promise<DashboardChartBundleResponse> {
    const item = await this.repository.findById(dashboardItemId);
    if (!item) {
      throw new Error('Item do dashboard não encontrado');
    }
    return this.updateTimeRangeInBundle(item.id_usuario, item, timeRange);
  }

  private async updateTimeRangeInBundle(
    userId: number,
    item: UsuarioEquipamentoDashboard,
    timeRange: TimeRange
  ): Promise<DashboardChartBundleResponse> {
    const stored = await this.safeLoadParsedBundle(userId);
    if (!stored || this.isStoredBundleLikelyStale(stored) || !this.isBundleItemsChartsAligned(stored)) {
      return this.createDashboardBundle(userId, 'dashboard_edit');
    }

    if (!stored.items.some((i) => i.id === item.id)) {
      return this.createDashboardBundle(userId, 'dashboard_edit');
    }

    const newChart = await this.buildOneChartEntry(item, { timeRange });
    const nextCharts = stored.charts.map((c) =>
      c.dashboardItemId === item.id ? newChart : c
    );

    const bundle: DashboardChartBundleResponse = { items: stored.items, charts: nextCharts };
    if (!this.isBundleItemsChartsAligned(bundle)) {
      return this.createDashboardBundle(userId, 'dashboard_edit');
    }

    await this.persistBundle(userId, bundle, 'dashboard_edit');
    return bundle;
  }

  private async persistBundle(
    userId: number,
    bundle: DashboardChartBundleResponse,
    source: 'dashboard_edit' | 'logs' | 'fallback'
  ): Promise<void> {
    const tenantId = this.extractTenantId(bundle.items);
    try {
      await this.dashboardBundleRepository.upsertByUsuarioId(userId, tenantId, bundle, source);
    } catch (error) {
      logWarn('Failed to persist dashboard bundle', { userId, source, error });
    }
  }

  private async safeLoadParsedBundle(userId: number): Promise<DashboardChartBundleResponse | null> {
    try {
      const stored = await this.dashboardBundleRepository.findByUsuarioId(userId);
      if (!stored?.bundle_json) {
        return null;
      }
      return this.parseStoredBundle(stored.bundle_json);
    } catch (error) {
      logWarn('Failed to load parsed dashboard bundle', { userId, error });
      return null;
    }
  }

  private isBundleItemsChartsAligned(bundle: DashboardChartBundleResponse): boolean {
    if (!Array.isArray(bundle.items) || !Array.isArray(bundle.charts)) {
      return false;
    }
    if (bundle.items.length !== bundle.charts.length) {
      return false;
    }
    const chartIds = new Set(bundle.charts.map((c) => c.dashboardItemId));
    return bundle.items.every((i) => chartIds.has(i.id));
  }

  async refreshBundlesByEquipamento(
    equipamentoId: number,
    source: 'logs' | 'dashboard_edit' = 'logs'
  ): Promise<void> {
    const userIds = await this.repository.findUserIdsByEquipamentoId(equipamentoId);
    for (const userId of userIds) {
      await this.createDashboardBundle(userId, source);
    }
  }

  /** Limite de cards processados em paralelo para não esgotar o pool do Prisma (cada gráfico dispara várias queries). */
  private static readonly CHART_BUNDLE_CONCURRENCY = 3;

  private async buildDashboardBundle(userId: number): Promise<DashboardChartBundleResponse> {
    const items = await this.repository.findByUsuarioId(userId);

    const charts: DashboardChartBundleEntry[] = [];
    const chunkSize = UsuarioEquipamentoDashboardService.CHART_BUNDLE_CONCURRENCY;

    for (let i = 0; i < items.length; i += chunkSize) {
      const slice = items.slice(i, i + chunkSize);
      const batch = await Promise.all(slice.map((item) => this.buildOneChartEntry(item)));
      charts.push(...batch);
    }

    return { items, charts };
  }

  private async buildOneChartEntry(
    item: UsuarioEquipamentoDashboard,
    options?: { timeRange?: TimeRange }
  ): Promise<DashboardChartBundleEntry> {
    const idMetrica = this.resolveMetricIdForChart(item);
    if (idMetrica == null) {
      return {
        dashboardItemId: item.id,
        chartData: null,
        error: 'Nenhuma métrica disponível para este equipamento',
      };
    }

    const tipo = item.id_tipo_grafico ?? 3;
    const timeRange = this.resolveTimeRangeForChart(tipo, options?.timeRange);
    try {
      let chartData;
      switch (tipo) {
        case 1:
          chartData = await this.chartService.getDoughnutChartData(item.id_equipamento, idMetrica);
          break;
        case 2:
          chartData = await this.chartService.getBarChartData(item.id_equipamento, idMetrica, timeRange);
          break;
        case 3:
        default:
          chartData = await this.chartService.getLineChartData(item.id_equipamento, idMetrica, timeRange);
          break;
      }
      return { dashboardItemId: item.id, chartData, error: null };
    } catch (e: any) {
      return {
        dashboardItemId: item.id,
        chartData: null,
        error: e?.message ?? 'Erro ao carregar gráfico',
      };
    }
  }

  /**
   * Bundle salvo com erro transitório de infra (ex.: pool Prisma) não deve ficar “preso” no GET.
   */
  private isStoredBundleLikelyStale(bundle: DashboardChartBundleResponse): boolean {
    const poolMsg = 'connection pool';
    return bundle.charts.some(
      (c) =>
        typeof c.error === 'string' &&
        (c.error.includes(poolMsg) || c.error.includes('Timed out fetching a new connection'))
    );
  }

  private parseStoredBundle(raw: unknown): DashboardChartBundleResponse | null {
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (
        parsed &&
        typeof parsed === 'object' &&
        Array.isArray((parsed as DashboardChartBundleResponse).items) &&
        Array.isArray((parsed as DashboardChartBundleResponse).charts)
      ) {
        return parsed as DashboardChartBundleResponse;
      }
      return null;
    } catch {
      return null;
    }
  }

  private extractTenantId(items: UsuarioEquipamentoDashboard[]): number | null {
    if (!items.length) {
      return null;
    }
    const firstTenant = items[0].id_tenant;
    return firstTenant ?? null;
  }

  private resolveMetricIdForChart(item: UsuarioEquipamentoDashboard): number | null {
    if (item.id_metrica != null) {
      return Number(item.id_metrica);
    }
    const em = (item.equipamento as { equipamento_metricas?: { id_metrica: number }[] } | undefined)
      ?.equipamento_metricas;
    if (Array.isArray(em) && em.length > 0 && em[0].id_metrica != null) {
      return Number(em[0].id_metrica);
    }
    return null;
  }

  private resolveTimeRangeForChart(tipo: number, requested?: TimeRange): TimeRange {
    if (requested) {
      return requested;
    }
    return tipo === 2 ? '1h' : '5min';
  }

  /**
   * Adiciona um equipamento ao dashboard do usuário
   * Verifica se o usuário tem permissão para ver o equipamento
   * Como os equipamentos já são filtrados por perfil x cliente, se o equipamento
   * aparece para o usuário, ele pode adicioná-lo ao seu dashboard
   */
  async addEquipamentoToDashboard(
    userId: number,
    equipamentoId: number,
    tenantId: number,
    id_metrica?: number | null,
    id_tipo_grafico?: number | null
  ): Promise<AddEquipamentoToDashboardResult> {
    // Verifica se o equipamento existe
    const equipamento = await this.equipamentoRepository.findById(equipamentoId, tenantId);
    if (!equipamento) {
      throw new Error('Equipamento não encontrado');
    }

    if (!equipamento.id_cliente) {
      throw new Error('Equipamento não está associado a um cliente');
    }
    // Verificar se o usuário tem permissão básica para acessar o equipamento
    const hasPermission = await hasEquipamentoPermission(userId, equipamentoId);

    if (!hasPermission) {
      throw new Error('Usuário não tem permissão para adicionar este equipamento ao dashboard');
    }
    // Verifica se já está no dashboard com a mesma métrica
    const exists = await this.repository.exists(userId, equipamentoId, id_metrica);
    if (exists) {
      throw new Error('Esta combinação de equipamento e métrica já está no dashboard');
    }
    logInfo('Adicionando equipamento ao dashboard', { userId, equipamentoId, tenantId, id_metrica, id_tipo_grafico });
    const created = await this.repository.create(userId, equipamentoId, tenantId, id_metrica, id_tipo_grafico);
    const bundle = await this.addEquipamentoToBundle(userId, created);
    return { item: created, bundle };
  }

  /**
   * Remove um equipamento do dashboard do usuário (por ID da associação)
   */
  async removeEquipamentoFromDashboardById(id: number): Promise<DashboardChartBundleResponse> {
    const item = await this.repository.findById(id);
    if (!item) {
      throw new Error('Item do dashboard não encontrado');
    }
    const userId = item.id_usuario;
    await this.repository.deleteById(id);
    return this.removeEquipamentoFromBundle(userId, id);
  }

  /**
   * Remove um equipamento do dashboard do usuário (com métrica específica)
   */
  async removeEquipamentoFromDashboard(
    userId: number,
    equipamentoId: number,
    id_metrica?: number | null
  ): Promise<DashboardChartBundleResponse> {
    const associationId = await this.repository.findIdByUsuarioEquipamentoMetrica(
      userId,
      equipamentoId,
      id_metrica
    );
    if (associationId == null) {
      throw new Error('Equipamento não está no dashboard');
    }

    await this.repository.deleteById(associationId);
    return this.removeEquipamentoFromBundle(userId, associationId);
  }

  /**
   * Verifica se um equipamento está no dashboard do usuário
   */
  async isEquipamentoInDashboard(
    userId: number,
    equipamentoId: number,
    id_metrica?: number | null
  ): Promise<boolean> {
    return this.repository.exists(userId, equipamentoId, id_metrica);
  }

  /**
   * Atualiza o tipo de gráfico de uma associação existente
   */
  async updateTipoGrafico(
    id: number,
    id_tipo_grafico: number | null,
    timeRange?: TimeRange
  ): Promise<UpdateTipoGraficoResult> {
    const updated = await this.repository.updateTipoGrafico(id, id_tipo_grafico);
    const bundle = await this.updateTipoGraficoInBundle(updated.id_usuario, updated, timeRange);
    return { item: updated, bundle };
  }
}


