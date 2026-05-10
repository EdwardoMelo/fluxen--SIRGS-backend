import { Request, Response } from 'express';
import { EquipamentoLogService } from '../services/equipamentoLogService';
import { UsuarioEquipamentoDashboardService } from '../services/usuarioEquipamentoDashboardService';
import { CreateEquipamentoLogsDTO } from '../dto/HttpRequestDTOS/CreateEquipamentoLogsDTO';
import { logError, logInfo, logWarn } from '../utils/logger';

export class EquipamentoLogController {
  private equipamentoLogService = new EquipamentoLogService();
  private usuarioDashboardService = new UsuarioEquipamentoDashboardService();

  async receiveLogsFromEquipamento(req: Request, res: Response): Promise<void> {
    try {
      const data = req.body as CreateEquipamentoLogsDTO;
      const equipamentoId = req.equipamento?.id;
      const logsCount = Array.isArray(data?.logs) ? data.logs.length : 0;

      logInfo('Equipment logs request received', {
        equipamentoId,
        logsCount,
        hasTenant: req.equipamento?.id_tenant != null
      });

      // Validação de métricas duplicadas
      if (data && data.logs && Array.isArray(data.logs)) {
        const seenMetricas = new Set<number>();
        for (const log of data.logs) {
          if (seenMetricas.has(log.id_metrica)) {
            logWarn('Duplicate metric ID in log batch', {
              equipamentoId,
              metricId: log.id_metrica
            });
            res.status(400).json({ message: "Não pode haver mais de um valor com o mesmo id_metrica" });
            return;
          }
          seenMetricas.add(log.id_metrica);
        }
      }

      // Tentar processamento assíncrono via RabbitMQ primeiro
      try {
        logInfo('Attempting async log processing via RabbitMQ', {
          equipamentoId,
          logsCount
        });
        const sentToQueue = await this.equipamentoLogService.sendLogsToRabbitMQ(data);
        
        if (sentToQueue) {
          logInfo('Logs accepted for async processing', {
            equipamentoId,
            logsCount,
            processingMode: 'async'
          });
          res.status(202).json({ 
            message: 'Logs recebidos e em processamento',
            accepted: true,
            processingMode: 'async'
          });
          return;
        }
      } catch (queueError) {
        // Erro ao enviar para fila - fazer fallback para processamento síncrono
        logWarn('Failed to send logs to RabbitMQ, falling back to sync processing', {
          equipamentoId,
          error: queueError
        });
      }

      // Fallback: processamento síncrono (fila cheia ou RabbitMQ indisponível)
      // Obter tenantId do equipamento autenticado
      const tenantId = req.equipamento?.id_tenant;
      logWarn('Using sync fallback for equipment logs processing', {
        equipamentoId,
        tenantId,
        logsCount
      });
      const group = await this.equipamentoLogService.createManyEquipamentoLogs(data, tenantId);
      if (equipamentoId) {
        logInfo('Refreshing dashboard bundles after sync log processing', {
          equipamentoId
        });
        await this.usuarioDashboardService.refreshBundlesByEquipamento(equipamentoId, 'logs');
      }
      logInfo('Equipment logs processed synchronously', {
        equipamentoId,
        logsCount,
        processingMode: 'sync'
      });
      res.status(201).json({
        ...group,
        processingMode: 'sync'
      });
    } catch (error) {
      logError('Failed to receive equipment logs', error, {
        equipamentoId: req.equipamento?.id
      });
      res.status(500).json({ message: 'Erro ao receber logs de equipamento' });
    }
  }


  async getLogsTableData(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const page = req.query.page ? Number(req.query.page) : undefined;
      const pageSize = req.query.pageSize ? Number(req.query.pageSize) : undefined;
      const afterGroupIdRaw = req.query.afterGroupId;
      const afterGroupId =
        afterGroupIdRaw !== undefined && afterGroupIdRaw !== ''
          ? Number(afterGroupIdRaw)
          : undefined;

      if (afterGroupId !== undefined && (Number.isNaN(afterGroupId) || afterGroupId < 1)) {
        res.status(400).json({ message: 'afterGroupId inválido (use um número inteiro >= 1)' });
        return;
      }

      const tableData = await this.equipamentoLogService.getLogsTableData(Number(id), {
        page,
        pageSize,
        afterGroupId
      });
      res.json(tableData);
    } catch (error) {
      logError('Failed to get logs table data', error, { equipamentoId: req.params.id });
      res.status(500).json({ message: 'Erro ao buscar dados da tabela de logs' });
    }
  }
}
