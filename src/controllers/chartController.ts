import { Request, Response } from 'express';
import { ChartService, TimeRange } from '../services/chartService';
import { logError } from '../utils/logger';

export class ChartController {
  private chartService = new ChartService();

  async getLineChartData(req: Request, res: Response): Promise<void> {
    try {
      const id_equipamento = Number(req.params.id_equipamento);
      const id_metrica = Number(req.params.id_metrica);
      const timeRange = (req.query.timeRange as TimeRange) || '5min';

      if (isNaN(id_equipamento) || isNaN(id_metrica)) {
        res.status(400).json({ message: 'ID do equipamento e ID da métrica devem ser números válidos' });
        return;
      }

      const chartData = await this.chartService.getLineChartData(id_equipamento, id_metrica, timeRange);
      res.json(chartData);
    } catch (error: any) {
      logError('Failed to get line chart data', error, {
        equipamentoId: req.params.id_equipamento,
        metricaId: req.params.id_metrica
      });
      res.status(500).json({ message: error.message || 'Erro ao buscar dados do gráfico de linha' });
    }
  }

  async getDoughnutChartData(req: Request, res: Response): Promise<void> {
    try {
      const id_equipamento = Number(req.params.id_equipamento);
      const id_metrica = Number(req.params.id_metrica);

      if (isNaN(id_equipamento) || isNaN(id_metrica)) {
        res.status(400).json({ message: 'ID do equipamento e ID da métrica devem ser números válidos' });
        return;
      }

      const chartData = await this.chartService.getDoughnutChartData(id_equipamento, id_metrica);
      res.json(chartData);
    } catch (error: any) {
      logError('Failed to get doughnut chart data', error, {
        equipamentoId: req.params.id_equipamento,
        metricaId: req.params.id_metrica
      });
      res.status(500).json({ message: error.message || 'Erro ao buscar dados do gráfico de rosca' });
    }
  }

  async getCounterChartData(req: Request, res: Response): Promise<void> {
    try {
      const id_equipamento = Number(req.params.id_equipamento);
      const id_metrica = Number(req.params.id_metrica);
      const timeRange = (req.query.timeRange as TimeRange) || '24h';

      if (isNaN(id_equipamento) || isNaN(id_metrica)) {
        res.status(400).json({ message: 'ID do equipamento e ID da métrica devem ser números válidos' });
        return;
      }

      const chartData = await this.chartService.getCounterChartData(id_equipamento, id_metrica, timeRange);
      res.json(chartData);
    } catch (error: any) {
      logError('Failed to get counter chart data', error, {
        equipamentoId: req.params.id_equipamento,
        metricaId: req.params.id_metrica
      });
      res.status(500).json({ message: error.message || 'Erro ao buscar dados do contador' });
    }
  }

  async getBarChartData(req: Request, res: Response): Promise<void> {
    try {
      const id_equipamento = Number(req.params.id_equipamento);
      const id_metrica = Number(req.params.id_metrica);
      const timeRange = (req.query.timeRange as TimeRange) || '1h';

      if (isNaN(id_equipamento) || isNaN(id_metrica)) {
        res.status(400).json({ message: 'ID do equipamento e ID da métrica devem ser números válidos' });
        return;
      }

      const chartData = await this.chartService.getBarChartData(id_equipamento, id_metrica, timeRange);
      res.json(chartData);
    } catch (error: any) {
      logError('Failed to get bar chart data', error, {
        equipamentoId: req.params.id_equipamento,
        metricaId: req.params.id_metrica
      });
      res.status(500).json({ message: error.message || 'Erro ao buscar dados do gráfico de barras' });
    }
  }
}

