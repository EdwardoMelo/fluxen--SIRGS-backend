import { Request, Response } from 'express';
import { EquipamentoLogService } from '../services/equipamentoLogService';
import { CreateEquipamentoLogsDTO } from '../dto/HttpRequestDTOS/CreateEquipamentoLogsDTO';
import { logError, logWarn, logInfo } from '../utils/logger';

export class EquipamentoLogController {
  private equipamentoLogService = new EquipamentoLogService();

  async receiveLogsFromEquipamento(req: Request, res: Response): Promise<void> {
    try {
      const data = req.body as CreateEquipamentoLogsDTO;
      const equipamentoId = req.equipamento?.id;

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
        const sentToQueue = await this.equipamentoLogService.sendLogsToRabbitMQ(data);
        
        if (sentToQueue) {
          // Logs enviados para fila com sucesso - processamento assíncrono
          logInfo('Equipment logs queued for async processing', {
            equipamentoId,
            logsCount: data.logs?.length || 0
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
      logInfo('Processing logs synchronously (RabbitMQ unavailable or queue full)', {
        equipamentoId
      });
      // Obter tenantId do equipamento autenticado
      const tenantId = req.equipamento?.id_tenant;
      const group = await this.equipamentoLogService.createManyEquipamentoLogs(data, tenantId);
      logInfo('Equipment logs processed successfully (sync)', {
        equipamentoId,
        groupId: group.id,
        logsCount: data.logs?.length || 0
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
