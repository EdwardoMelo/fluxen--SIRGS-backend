import { Prisma } from '@prisma/client';
import { prisma } from '../database';
import { EquipamentoLogGrupo } from '../types/EquipamentoLogGrupo';
import { toBrazilianTimezone } from '../utils/dateUtils';

export interface PaginationOptions {
  page?: number;
  pageSize?: number;
  /** Quando definido, busca apenas grupos com id maior (registros mais novos que o cursor). */
  afterGroupId?: number;
}

export interface GroupedLogsResult {
  groups: EquipamentoLogGrupo[];
  total: number;
}

export class EquipamentoLogRepository {
  async updateGroup(id: number, data: Partial<EquipamentoLogGrupo>, transaction?: Prisma.TransactionClient): Promise<EquipamentoLogGrupo> {
    // Remove 'id' from data if somehow present
    const { id : id_grupo, id_equipamento, timestamp, ...rest} = data as any;
    if (transaction) {
      return transaction.equipamento_log_grupo.update({ where: { id }, data: rest });
    }
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      return tx.equipamento_log_grupo.update({ where: { id }, data: rest });
    });
  }

  async createGroup( id_equipamento: number, tenantId: number, transaction? : Prisma.TransactionClient,): Promise<EquipamentoLogGrupo> {
    const timestamp = toBrazilianTimezone(new Date());
    if(transaction){ 
      return transaction.equipamento_log_grupo.create({ 
        data: { 
          timestamp, 
          id_equipamento,
          id_tenant: tenantId,
        } 
      });
    }
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      return tx.equipamento_log_grupo.create({ 
        data: { 
          timestamp, 
          id_equipamento,
          id_tenant: tenantId,
        } 
      });
    });
  }

  async findGroupedByTimestamp(
    id_equipamento: number,
    options: PaginationOptions = {},
    transaction?: Prisma.TransactionClient
  ): Promise<GroupedLogsResult> {
    const page = Math.max(options.page ?? 1, 1);
    const pageSize = Math.max(Math.min(options.pageSize ?? 50, 500), 1);
    const skip = (page - 1) * pageSize;
    const take = pageSize;

    const executor = transaction ?? prisma;

    const [groups, total] = await Promise.all([
      executor.equipamento_log_grupo.findMany({
        where: { id_equipamento },
        orderBy: {
          timestamp: 'desc'
        },
        skip,
        take
      }),
      executor.equipamento_log_grupo.count({
        where: { id_equipamento }
      })
    ]);

    return { groups, total };
  }

  /**
   * Grupos criados após o id informado (id monotônico), mais recentes primeiro.
   * Usado para refresh incremental na tabela de logs.
   */
  async findGroupsAfterGroupId(
    id_equipamento: number,
    afterGroupId: number,
    options: { take?: number } = {}
  ): Promise<EquipamentoLogGrupo[]> {
    const take = Math.max(Math.min(options.take ?? 50, 500), 1);
    return prisma.equipamento_log_grupo.findMany({
      where: { id_equipamento, id: { gt: afterGroupId } },
      orderBy: { timestamp: 'desc' },
      take,
    });
  }

  /**
   * Apenas o grupo mais recente — sem count nem paginação.
   * Evita o custo de COUNT(*) em equipamentos com muitos grupos (ex.: gráfico doughnut).
   */
  async findLatestGroupByEquipamento(
    id_equipamento: number,
    transaction?: Prisma.TransactionClient
  ): Promise<EquipamentoLogGrupo | null> {
    const executor = transaction ?? prisma;
    return executor.equipamento_log_grupo.findFirst({
      where: { id_equipamento },
      orderBy: { timestamp: 'desc' },
    });
  }

  async findGroupedByTimestampWithTimeRange(
    id_equipamento: number,
    startDate: Date,
    endDate: Date,
    options: PaginationOptions = {},
    transaction?: Prisma.TransactionClient
  ): Promise<GroupedLogsResult> {
    const page = Math.max(options.page ?? 1, 1);
    const pageSize = Math.max(Math.min(options.pageSize ?? 50, 500), 1);
    const skip = (page - 1) * pageSize;
    const take = pageSize;

    const executor = transaction ?? prisma;

    const [groups, total] = await Promise.all([
      executor.equipamento_log_grupo.findMany({
        where: {
          id_equipamento,
          timestamp: {
            gte: startDate,
            lte: endDate
          }
        },
        orderBy: {
          timestamp: 'asc' // Para gráficos, ordem crescente faz mais sentido
        },
        skip,
        take
      }),
      executor.equipamento_log_grupo.count({
        where: {
          id_equipamento,
          timestamp: {
            gte: startDate,
            lte: endDate
          }
        }
      })
    ]);

    return { groups, total };
  }

  /**
   * Busca todos os logs em um intervalo de datas (sem paginação - para relatórios)
   */
  async findByDateRange(
    id_equipamento: number,
    startDate: Date,
    endDate: Date,
    transaction?: Prisma.TransactionClient
  ): Promise<EquipamentoLogGrupo[]> {
    const executor = transaction ?? prisma;

    return executor.equipamento_log_grupo.findMany({
      where: {
        id_equipamento,
        timestamp: {
          gte: startDate,
          lte: endDate
        }
      },
      orderBy: {
        timestamp: 'asc'
      }
    });
  }
    
}


