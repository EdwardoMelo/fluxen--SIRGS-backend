import { EquipamentoLogRepository, PaginationOptions } from "../repositories/equipamentoLogRepository";
import { EquipamentoMetricaRepository } from "../repositories/equipamentoMetricaRepository";
import { EquipamentoMetrica } from "../types/EquipamentoMetrica";
import { Prisma } from "@prisma/client";
import { prisma } from "../database";
import { CreateEquipamentoLogsDTO } from "../dto/HttpRequestDTOS/CreateEquipamentoLogsDTO";
import { rabbitMQService } from "./rabbitmqService";
import { logError, logInfo, logWarn } from "../utils/logger";
import { NotificacaoService } from "./notificacaoService";
import { toBrazilianTimezone } from "../utils/dateUtils";

export class EquipamentoLogService {
  private equipamentoLogRepository: EquipamentoLogRepository;
  private equipamentoMetricaRepository: EquipamentoMetricaRepository;
  private notificacaoService: NotificacaoService;

  constructor() {
    this.equipamentoLogRepository = new EquipamentoLogRepository();
    this.equipamentoMetricaRepository = new EquipamentoMetricaRepository();
    this.notificacaoService = new NotificacaoService();
  }

  /**
   * Arredonda um valor para 2 casas decimais
   */
  private roundToTwoDecimals(value: number | null | undefined): number | undefined {
    if (value === null || value === undefined) {
      return undefined;
    }
    return Math.round(Number(value) * 100) / 100;
  }

  /**
   * Gera ou retorna o valor convertido arredondado
   * Se valor_convertido já foi fornecido, apenas arredonda
   * Caso contrário, calcula usando regra de 3
   */
  private getConvertedValue(
    valor: number,
    valor_convertido: number | null | undefined,
    valor_minimo: number,
    valor_maximo: number
  ): number {
    const range_original_min = 0;
    const range_original_max = 4095;

    if (valor_convertido === undefined || valor_convertido === null) {
      // Se valor_convertido não foi fornecido, calcular usando regra de 3
      const calculatedValue =
        ((Number(valor) - range_original_min) * (valor_maximo - valor_minimo)) /
        (range_original_max - range_original_min) +
        valor_minimo;
      return this.roundToTwoDecimals(calculatedValue)!;
    } else {
      // Se já foi fornecido, apenas arredondar
      return this.roundToTwoDecimals(valor_convertido)!;
    }
  }

  /**
   * Processa logs parseados do JSON e garante que os timestamps estejam no fuso horário brasileiro
   */
  private processParsedLogs(logs: any[]): any[] {
    return logs.map((log: any) => {
      if (log.timestamp) {
        // Converter timestamp para fuso horário brasileiro
        log.timestamp = toBrazilianTimezone(new Date(log.timestamp));
      }
      return log;
    });
  }

  async sendLogsToRabbitMQ(data: CreateEquipamentoLogsDTO): Promise<boolean> {
    try {
      const equipamentoId = data.logs?.[0]?.id_equipamento;
      const logsCount = Array.isArray(data.logs) ? data.logs.length : 0;

      logInfo('Starting sendLogsToRabbitMQ', {
        equipamentoId,
        logsCount
      });

      // Verificar se RabbitMQ está conectado
      if (!rabbitMQService.isConnected()) {
        logInfo('RabbitMQ is disconnected, connecting before publish', {
          equipamentoId
        });
        await rabbitMQService.connect();
      }

      // Publicar logs na fila
      const published = await rabbitMQService.publishLogs(data);

      if (published) {
        logInfo('Logs successfully published to RabbitMQ', {
          equipamentoId,
          logsCount
        });
        return true;
      }
      logWarn('RabbitMQ publish returned false', {
        equipamentoId,
        logsCount
      });
      return false;
    } catch (error) {
      logError('Failed to send logs to RabbitMQ', error, {
        equipamentoId: data.logs?.[0]?.id_equipamento
      });
      throw error;
    }
  }

  async createManyEquipamentoLogs(
    data: CreateEquipamentoLogsDTO,
    tenantId?: number
  ): Promise<any> {
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const equipamentoId = data.logs[0].id_equipamento;

      if (!equipamentoId) return { success: false, message: 'Equipamento ID não fornecido' };
      
      // Se tenantId não foi fornecido, buscar do equipamento
      let equipamentoTenantId = tenantId;
      if (!equipamentoTenantId) {
        const equipamento = await tx.equipamento.findUnique({
          where: { id: equipamentoId },
          select: { id_tenant: true }
        });
        if (!equipamento || !equipamento.id_tenant) {
          throw new Error('Equipamento não encontrado ou sem tenant associado');
        }
        equipamentoTenantId = equipamento.id_tenant;
      }

      const equipamentoMetricas =
        await this.equipamentoMetricaRepository.findByEquipamentoId(
          equipamentoId,
          tx
        );
      const metricaToEquipamentoMetrica = new Map<number, EquipamentoMetrica>();
      const newGroup = await this.equipamentoLogRepository.createGroup(equipamentoId, equipamentoTenantId, tx);

      //mapeando equipamentoMetrica (que contém informações para conversão) para cada métrica em cada log
      for (const equipamentoMetrica of equipamentoMetricas) {
        metricaToEquipamentoMetrica.set(
          equipamentoMetrica.id_metrica || 0,
          equipamentoMetrica
        );
      }

      for (const log of data.logs) {
        const equipamentoMetrica = metricaToEquipamentoMetrica.get(
          log.id_metrica || 0
        );
        if (equipamentoMetrica) {
          const { valor } = log;
          const { valor_minimo, valor_maximo } = equipamentoMetrica;
          // Gerar ou atribuir o valor convertido
          log.valor_convertido = this.getConvertedValue(
            valor,
            log.valor_convertido,
            valor_minimo,
            valor_maximo
          );
          log.id_equipamento_metrica = equipamentoMetrica.id;
          // Sempre garantir que o timestamp esteja no fuso horário brasileiro
          log.timestamp = toBrazilianTimezone(new Date());
          // Criar notificações se houver alarme (fora da transação para não bloquear)
          // valor_convertido sempre existirá após o processamento acima
          const valorConvertido = log.valor_convertido!;
          const idMetrica = log.id_metrica || 0;
          const logTimestamp = log.timestamp;
          setImmediate(() => {
            this.notificacaoService.createNotificationsForLog(
              equipamentoId,
              { id_metrica: idMetrica, valor_convertido: valorConvertido },
              equipamentoMetrica,
              logTimestamp
            ).catch(error => {
              logError('Failed to create notifications for log', error);
            });
          });
        }
      }
      newGroup.logs = JSON.stringify(data.logs);
     const updatedGroup = await this.equipamentoLogRepository.updateGroup(newGroup.id, newGroup, tx);

      // Retornar o grupo criado com os logs
      return updatedGroup;
    });
  }

  private getSituation(groupedLogs: any[]): 'working' | 'frozen' {
    if (!Array.isArray(groupedLogs) || groupedLogs.length < 5) return 'working';
    const lastFiveLogs = groupedLogs.slice(0, 5);
    // Criar cópias sanitizadas sem timestamp e id, mantendo apenas os valores das métricas
    const sanitizedLogs = lastFiveLogs.map((log) => {
      const { timestamp, id, ...rest } = log;
      // Remover campos de alerta também para comparação
      const sanitized: any = {};
      Object.keys(rest).forEach(key => {
        if (!key.endsWith('_alert') && !key.endsWith('_device_alarme') && !key.endsWith('_alarme_texto')) {
          sanitized[key] = rest[key];
        }
      });
      return sanitized;
    });
    const allEqual = sanitizedLogs.every((log) => {
      return JSON.stringify(log) === JSON.stringify(sanitizedLogs[0]);
    })
    return allEqual ? 'frozen' : 'working';
  }

  private checkValueLimits(value: number, metricId: number, metrics: any[]): 'min' | 'max' | 'none' {
    // metrics é um array de EquipamentoMetrica[] (já vem do findByEquipamentoId)
    // Cada item já contém: id, id_equipamento, id_metrica, valor_minimo, valor_maximo, alarme_minimo, alarme_maximo, metrica
    const equipamentoMetrica = metrics.find(m => m.id_metrica === metricId);

    if (!equipamentoMetrica || !equipamentoMetrica.valor_maximo) {
      return 'none';
    }

    // Se alarme_minimo está configurado, verificar se o valor está abaixo
    if (equipamentoMetrica.alarme_minimo !== null && equipamentoMetrica.alarme_minimo !== undefined) {
      if (value <= equipamentoMetrica.alarme_minimo) {
        return 'min';
      }
    }

    // Se alarme_maximo está configurado, verificar se o valor está acima
    if (equipamentoMetrica.alarme_maximo !== null && equipamentoMetrica.alarme_maximo !== undefined) {
      if (value >= equipamentoMetrica.alarme_maximo) {
       
        return 'max';
      }
    }

    // Se não há alarmes configurados, retornar 'none' (sem alarme)
    return 'none';
  }

  private buildLogTableColumns(metrics: any[]): any[] {
    const columnsArray: any[] = [
      {
        field: 'timestamp',
        headerName: 'Timestamp',
        flex: 1,
        disableColumnMenu: true,
        type: 'dateTime'
      }
    ];
    metrics.forEach((metric) => {
      if (metric.metrica?.nome) {
        columnsArray.push({
          field: `metrica_${metric.id_metrica}`,
          headerName: `${metric.metrica.nome} (${metric.metrica.unidade})`,
          flex: 1,
          disableColumnMenu: true,
          type: 'number'
        });
      }
    });
    return columnsArray;
  }

  private buildRowsFromGroups(groups: any[], metrics: any[]): any[] {
    return groups.map((group: any) => {
      const row: any = {
        id: group.id,
        timestamp: group.timestamp
      };
      let parsedLogs: any[] = [];
      if (group.logs) {
        try {
          parsedLogs = JSON.parse(group.logs);
          // Garantir que os timestamps dos logs estejam no fuso horário brasileiro
        } catch (error) {
          console.error('Error parsing logs JSON:', error);
          parsedLogs = [];
        }
      }

      parsedLogs.forEach((log: any) => {
        const valorConvertido = this.roundToTwoDecimals(log.valor_convertido);
        const metricField = `metrica_${log.id_metrica}`;
        row[metricField] = valorConvertido;

        const equipamentoMetrica = metrics.find(m => m.id_metrica === log.id_metrica);

        if (log.alarme === true) {
          const textoAlarme = equipamentoMetrica?.texto_alarme?.trim();
          if (textoAlarme) {
            row[`${metricField}_device_alarme`] = true;
            row[`${metricField}_alarme_texto`] = textoAlarme;
          }
        }

        if (valorConvertido !== undefined) {
          const alert = this.checkValueLimits(valorConvertido, log.id_metrica, metrics);
          row[`${metricField}_alert`] = alert;
        }
      });

      return row;
    });
  }

  async getLogsTableData(
    id_equipamento: number,
    paginationOptions: PaginationOptions = {},
    startDate?: Date,
    endDate?: Date
  ): Promise<any> {
    const metrics = await this.equipamentoMetricaRepository.findByEquipamentoId(id_equipamento);

    const afterGroupId = paginationOptions.afterGroupId;
    if (
      afterGroupId !== undefined &&
      afterGroupId !== null &&
      !startDate &&
      !endDate
    ) {
      const pageSize = Math.max(Math.min(paginationOptions.pageSize ?? 50, 500), 1);
      const groups = await this.equipamentoLogRepository.findGroupsAfterGroupId(
        id_equipamento,
        afterGroupId,
        { take: pageSize }
      );
      const columnsArray = this.buildLogTableColumns(metrics);
      const rows = this.buildRowsFromGroups(groups, metrics);
      const { groups: recentGroups } = await this.equipamentoLogRepository.findGroupedByTimestamp(
        id_equipamento,
        { page: 1, pageSize: 5 }
      );
      const situationRows = this.buildRowsFromGroups(recentGroups, metrics);

      return {
        columns: columnsArray,
        rows,
        situation: this.getSituation(situationRows),
        metrics,
        pagination: {
          page: 1,
          pageSize,
          totalItems: null,
          totalPages: null,
          hasNextPage: false,
          incremental: true
        }
      };
    }

    let groups: any[];
    let hasNextPage = false;

    // Se datas forem fornecidas, buscar até MAX_EQUIPAMENTO_LOG_GRUPOS_PARA_TABELA grupos (mais recentes no intervalo)
    if (startDate && endDate) {
      groups = await this.equipamentoLogRepository.findByDateRange(
        id_equipamento,
        startDate,
        endDate
      );
      hasNextPage = false;
    } else {
    // Caso contrário, usar paginação normal
      const page = Math.max(paginationOptions.page ?? 1, 1);
      const pageSize = Math.max(Math.min(paginationOptions.pageSize ?? 50, 500), 1);
      const result = await this.equipamentoLogRepository.findGroupedByTimestamp(
        id_equipamento,
        { page, pageSize }
      );
      
      groups = result.groups;

      hasNextPage = result.hasNextPage ?? false;
    }

    const columnsArray = this.buildLogTableColumns(metrics);
    const rows = this.buildRowsFromGroups(groups, metrics);

    let situationRows = rows;
    // Só buscar situation rows se não estiver usando filtro de data e não estiver na primeira página
    if (!startDate && !endDate) {
      const page = Math.max(paginationOptions.page ?? 1, 1);
      if (page !== 1) {
        const { groups: recentGroups } = await this.equipamentoLogRepository.findGroupedByTimestamp(
          id_equipamento,
          { page: 1, pageSize: 5 }
        );
        situationRows = this.buildRowsFromGroups(recentGroups, metrics);
      }
    }

    const page = Math.max(paginationOptions.page ?? 1, 1);
    const pageSize = Math.max(Math.min(paginationOptions.pageSize ?? 50, 500), 1);

    return { 
      columns: columnsArray,
      rows,
      situation: this.getSituation(situationRows),
      metrics,
      pagination: {
        page,
        pageSize,
        totalItems: null,
        totalPages: null,
        hasNextPage
      }
    };
  }
}
