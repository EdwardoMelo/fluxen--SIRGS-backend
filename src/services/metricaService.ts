import { MetricasFilters } from '../controllers/metricaController';
import { MetricaRepository } from '../repositories/metricaRepository';
import { Metrica } from '../types/Metrica';
import { hasEquipamentoPermission } from '../utils/equipamentoPermissionHelper';

export class MetricaService {
  private metricaRepository = new MetricaRepository();

  async getMetricas(filters: MetricasFilters, tenantId: number): Promise<Metrica[]> {

    return await this.metricaRepository.findAll(filters, tenantId);
  }

  async getMetricaById(id: number, tenantId: number): Promise<Metrica | null> {
    return this.metricaRepository.findById(id, tenantId);
  }

  async associateMetricToEquipamento(
    id_metrica: number,
    id_equipamento: number,
    valor_minimo: number,
    valor_maximo: number,
    tenantId: number,
    alarme_minimo: number | null = null,
    alarme_maximo: number | null = null,
    texto_alarme: string | null = null,
    userId?: number
  ): Promise<Metrica | null> {
    // Verificar permissão se userId foi fornecido
    if (userId) {
      const hasPermission = await hasEquipamentoPermission(userId, id_equipamento);
      if (!hasPermission) {
        throw new Error('Usuário não tem permissão para associar métricas a este equipamento');
      }
    }

    return this.metricaRepository.associateMetricToEquipamento(
      id_metrica,
      id_equipamento,
      valor_minimo,
      valor_maximo,
      tenantId,
      alarme_minimo,
      alarme_maximo,
      texto_alarme
    );
  }

  async desassociateMetricToEquipamento(id_metrica: number, id_equipamento: number, tenantId: number, userId?: number): Promise<Metrica[] | null> {
    // Verificar permissão se userId foi fornecido
    if (userId) {
      const hasPermission = await hasEquipamentoPermission(userId, id_equipamento);
      if (!hasPermission) {
        throw new Error('Usuário não tem permissão para desassociar métricas deste equipamento');
      }
    }

    return this.metricaRepository.desassociateMetricToEquipamento(id_metrica, id_equipamento, tenantId);
  }

  async getMetricaByEquipamentoId(id_equipamento: number, tenantId: number, userId?: number): Promise<Metrica[]> {
    // Verificar permissão se userId foi fornecido
    if (userId) {
      const hasPermission = await hasEquipamentoPermission(userId, id_equipamento);
      if (!hasPermission) {
        throw new Error('Usuário não tem permissão para visualizar métricas deste equipamento');
      }
    }

    return this.metricaRepository.findByEquipamentoId(id_equipamento, tenantId);
  }

  async createMetrica(data: Metrica, tenantId: number): Promise<Metrica> {
    return this.metricaRepository.create(data, tenantId);
  }

  async updateMetrica(id: number, data: Partial<Metrica>): Promise<Metrica> {
    return this.metricaRepository.update(id, data);
  }

  async deleteMetrica(id: number): Promise<void> {
    await this.metricaRepository.delete(id);
  }

  async getMetricasStats(): Promise<{
    totalMetricas: number;
    metricasAtivas: number;
    unidadesUnicas: number;
  }> {
    return this.metricaRepository.getMetricasStats();
  }
}
