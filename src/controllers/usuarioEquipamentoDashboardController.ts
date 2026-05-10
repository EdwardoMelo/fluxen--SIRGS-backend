import { Request, Response } from 'express';
import { UsuarioEquipamentoDashboardService } from '../services/usuarioEquipamentoDashboardService';
import type { TimeRange } from '../services/chartService';
import { logError } from '../utils/logger';

const VALID_TIME_RANGES: ReadonlyArray<TimeRange> = ['5min', '15min', '30min', '1h', '6h', '24h', '7d'];

export class UsuarioEquipamentoDashboardController {
  private service = new UsuarioEquipamentoDashboardService();

  /**
   * GET /usuario-equipamento-dashboard/:userId
   * Busca todos os equipamentos do dashboard do usuário
   */
  async getEquipamentosDashboard(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const equipamentos = await this.service.getEquipamentosDashboard(Number(userId));
      res.json(equipamentos);
    } catch (error) {
      logError('Failed to get dashboard equipment', error, { userId: req.params.userId });
      res.status(500).json({ message: 'Erro ao buscar equipamentos do dashboard' });
    }
  }

  /**
   * GET /usuario-equipamento-dashboard/:userId/chart-bundle
   * Lista do dashboard + dados de todos os gráficos (uma requisição).
   */
  async getDashboardChartBundle(req: Request, res: Response): Promise<void> {
    try {
      const userId = Number(req.params.userId);
      const authId = req.user?.id != null ? Number(req.user.id) : NaN;

      if (isNaN(userId) || userId <= 0) {
        res.status(400).json({ message: 'userId inválido' });
        return;
      }

      if (isNaN(authId) || authId !== userId) {
        res.status(403).json({ message: 'Acesso negado' });
        return;
      }

      const bundle = await this.service.getDashboardBundle(userId);
      res.json(bundle);
    } catch (error) {
      logError('Failed to get dashboard chart bundle', error, { userId: req.params.userId });
      res.status(500).json({ message: 'Erro ao buscar bundle do dashboard' });
    }
  }

  /**
   * POST /usuario-equipamento-dashboard
   * Adiciona um equipamento ao dashboard do usuário
   */
  async addEquipamentoToDashboard(req: Request, res: Response): Promise<void> {
    try {
      const { userId, equipamentoId, id_metrica, id_tipo_grafico } = req.body;
      const tenantId = req.tenantId;

      if (!userId || !equipamentoId) {
        res.status(400).json({ message: 'userId e equipamentoId são obrigatórios' });
        return;
      }

      if (!tenantId) {
        res.status(400).json({ message: 'Tenant ID is required' });
        return;
      }

      const result = await this.service.addEquipamentoToDashboard(
        Number(userId),
        Number(equipamentoId),
        tenantId,
        id_metrica ? Number(id_metrica) : null,
        id_tipo_grafico ? Number(id_tipo_grafico) : null
      );
      res.status(201).json(result);
    } catch (error: any) {
      logError('Failed to add equipment to dashboard', error);
      const statusCode = error.message.includes('não encontrado') || 
                        error.message.includes('já está') ? 400 : 500;
      res.status(statusCode).json({ message: error.message || 'Erro ao adicionar equipamento ao dashboard' });
    }
  }

  /**
   * DELETE /usuario-equipamento-dashboard/:id
   * Remove um equipamento do dashboard do usuário por ID da associação
   */
  async removeEquipamentoFromDashboardById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const bundle = await this.service.removeEquipamentoFromDashboardById(Number(id));
      res.status(200).json({ bundle });
    } catch (error: any) {
      logError('Failed to remove equipment from dashboard by id', error, {
        id: req.params.id
      });
      res.status(500).json({ message: error.message || 'Erro ao remover equipamento do dashboard' });
    }
  }

  /**
   * DELETE /usuario-equipamento-dashboard/:userId/:equipamentoId
   * Remove um equipamento do dashboard do usuário (com métrica específica)
   */
  async removeEquipamentoFromDashboard(req: Request, res: Response): Promise<void> {
    try {
      const { userId, equipamentoId } = req.params;
      const { id_metrica } = req.query;

      const bundle = await this.service.removeEquipamentoFromDashboard(
        Number(userId),
        Number(equipamentoId),
        id_metrica ? Number(id_metrica) : null
      );
      res.status(200).json({ bundle });
    } catch (error: any) {
      logError('Failed to remove equipment from dashboard', error, {
        userId: req.params.userId,
        equipamentoId: req.params.equipamentoId
      });
      const statusCode = error.message.includes('não está') ? 404 : 500;
      res.status(statusCode).json({ message: error.message || 'Erro ao remover equipamento do dashboard' });
    }
  }

  /**
   * GET /usuario-equipamento-dashboard/:userId/:equipamentoId/check
   * Verifica se um equipamento está no dashboard do usuário
   */
  async checkEquipamentoInDashboard(req: Request, res: Response): Promise<void> {
    try {
      const { userId, equipamentoId } = req.params;
      const exists = await this.service.isEquipamentoInDashboard(
        Number(userId),
        Number(equipamentoId)
      );
      res.json({ exists });
    } catch (error) {
      logError('Failed to check equipment in dashboard', error, {
        userId: req.params.userId,
        equipamentoId: req.params.equipamentoId
      });
      res.status(500).json({ message: 'Erro ao verificar equipamento no dashboard' });
    }
  }

  /**
   * PATCH /usuario-equipamento-dashboard/item/:id/tipo-grafico
   * Atualiza o tipo de gráfico de uma associação existente
   */
  async updateTipoGrafico(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { id_tipo_grafico, timeRange } = req.body;

      if (id_tipo_grafico === undefined) {
        res.status(400).json({ message: 'id_tipo_grafico é obrigatório' });
        return;
      }
      if (timeRange !== undefined && (typeof timeRange !== 'string' || !VALID_TIME_RANGES.includes(timeRange as TimeRange))) {
        res.status(400).json({ message: 'timeRange inválido' });
        return;
      }

      const result = await this.service.updateTipoGrafico(
        Number(id),
        id_tipo_grafico ? Number(id_tipo_grafico) : null,
        typeof timeRange === 'string' ? (timeRange as TimeRange) : undefined
      );
      res.json(result);
    } catch (error: any) {
      logError('Failed to update tipo grafico', error, {
        id: req.params.id
      });
      const statusCode = error.message.includes('não encontrado') ? 404 : 500;
      res.status(statusCode).json({ message: error.message || 'Erro ao atualizar tipo de gráfico' });
    }
  }

  /**
   * PATCH /usuario-equipamento-dashboard/item/:id/time-range
   * Atualiza o intervalo de um gráfico específico no bundle persistido.
   */
  async updateTimeRange(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { timeRange } = req.body;

      if (typeof timeRange !== 'string' || !VALID_TIME_RANGES.includes(timeRange as TimeRange)) {
        res.status(400).json({ message: 'timeRange inválido' });
        return;
      }

      const bundle = await this.service.updateTimeRangeInBundleByItemId(
        Number(id),
        timeRange as TimeRange
      );
      res.json({ bundle });
    } catch (error: any) {
      logError('Failed to update time range', error, {
        id: req.params.id,
      });
      const statusCode = error.message.includes('não encontrado') ? 404 : 500;
      res.status(statusCode).json({ message: error.message || 'Erro ao atualizar intervalo do gráfico' });
    }
  }
}


