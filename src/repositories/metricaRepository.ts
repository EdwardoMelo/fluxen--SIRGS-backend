import { MetricasFilters } from '../controllers/metricaController';
import { prisma } from '../database';
import { Metrica } from '../types/Metrica';
import { Prisma } from '@prisma/client';


export class MetricaRepository {
  async findAll(filters: MetricasFilters, tenantId: number): Promise<Metrica[]> {
    const { generalFilter, columnFilters } = filters;
    const where: Prisma.metricaWhereInput = {
      AND: [
        { id_tenant: tenantId },
        this.buildGeneralFilter(generalFilter),
        this.buildColumnFilters(columnFilters),
      ],
    };

    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      return tx.metrica.findMany({ 
        where,
        include: {
          equipamento_metricas: true,
        },
        orderBy: {
          id: 'desc'
        }
      });
    });
  }

  buildGeneralFilter = (generalFilter: string): Prisma.metricaWhereInput => {
    if (!generalFilter || generalFilter.trim().length === 0) return {};
    return {
      OR: [
        { nome: { contains: generalFilter } },
        { unidade: { contains: generalFilter } },
      ],
    };
  };

  buildColumnFilters = (columnFilters: {
    id: string | null;
    nome: string | null;
    unidade: string | null;
  }): Prisma.metricaWhereInput => {
    const where: Prisma.metricaWhereInput = {};
    if(!columnFilters) return where;
    
    if (columnFilters.id && !isNaN(parseInt(columnFilters.id)))  {
      where.id = parseInt(columnFilters.id);
    }
    if (columnFilters.nome && columnFilters?.nome !== "") {
      where.nome = { contains: columnFilters.nome };
    }
    if (columnFilters.unidade && columnFilters?.unidade !== "") {
       where.unidade = { contains: columnFilters.unidade };
    }
    return where;
  };

  async findById(
    id: number,
    tenantId: number,
    tx?: Prisma.TransactionClient
  ): Promise<Metrica | null> {
    if (!tx) {
      return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        return tx.metrica.findFirst({ where: { id, id_tenant: tenantId } });
      });
    }
    return tx.metrica.findFirst({ where: { id, id_tenant: tenantId } });
  }

  async findByEquipamentoId(
    id_equipamento: number,
    tenantId: number,
    tx?: Prisma.TransactionClient
  ): Promise<Metrica[]> {
    if (!tx) {
      return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        return tx.metrica
          .findMany({
            where: {
              id_tenant: tenantId,
              equipamento_metricas: { some: { id_equipamento, id_tenant: tenantId } }
            },
            include: {
              equipamento_metricas: {
                where: { id_equipamento, id_tenant: tenantId },
              },
            },
            orderBy: {
              id: 'desc'
            }
          })
          .then((metricas) =>
            metricas.map((metrica) => ({
              ...metrica,
              equipamento_metrica: metrica.equipamento_metricas[0],
              valor_minimo: metrica.equipamento_metricas[0].valor_minimo,
              valor_maximo: metrica.equipamento_metricas[0].valor_maximo,
            }))
          );
      });
    }
    return tx.metrica
      .findMany({
        where: {
          id_tenant: tenantId,
          equipamento_metricas: { some: { id_equipamento, id_tenant: tenantId } }
        },
        include: {
          equipamento_metricas: {
            where: { id_equipamento, id_tenant: tenantId },
          },
        },
        orderBy: {
          id: 'desc'
        }
      })
      .then((metricas) => { 
        return metricas.map((metrica) => ({
          ...metrica,
          equipamento_metrica: metrica.equipamento_metricas[0],
          valor_minimo: metrica.equipamento_metricas[0].valor_minimo,
          valor_maximo: metrica.equipamento_metricas[0].valor_maximo,
        }));
      }
       

      );
  }

  async associateMetricToEquipamento(
    id_metrica: number,
    id_equipamento: number,
    valor_minimo: number,
    valor_maximo: number,
    tenantId: number,
    alarme_minimo: number | null = null,
    alarme_maximo: number | null = null,
    texto_alarme: string | null = null
  ): Promise<Metrica | null> {
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const equipamentMetrica = await tx.equipamento_metricas.create({
        data: {
          id_equipamento,
          id_metrica,
          id_tenant: tenantId,
          valor_minimo,
          valor_maximo,
          alarme_minimo,
          alarme_maximo,
          texto_alarme,
        },
      });
      const metrica = await this.findById(id_metrica, tenantId, tx);
      if (!metrica) return null;
      metrica.valor_minimo = equipamentMetrica.valor_minimo;
      metrica.valor_maximo = equipamentMetrica.valor_maximo;
      return metrica;
    });
  }

  async desassociateMetricToEquipamento(
    id_metrica: number,
    id_equipamento: number,
    tenantId: number
  ): Promise<Metrica[] | null> {
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // First, find the unique id of the equipamento_metrica entry
      const equipamentoMetrica = await tx.equipamento_metricas.findFirst({
        where: { id_metrica, id_equipamento, id_tenant: tenantId },
        select: { id: true },
      });
      if (equipamentoMetrica) {
        await tx.equipamento_metricas.delete({
          where: { id: equipamentoMetrica.id },
        });
      }
      return this.findByEquipamentoId(id_equipamento, tenantId, tx);
    });
  }

  async create(data: Metrica, tenantId: number): Promise<Metrica> {
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      return tx.metrica.create({
        data: {
          ...data,
          id_tenant: tenantId,
        }
      });
    });
  }

  async update(id: number, data: Partial<Metrica>): Promise<Metrica> {
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      return tx.metrica.update({ where: { id }, data });
    });
  }

  async delete(id: number): Promise<void> {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.metrica.delete({ where: { id } });
    });
  }

  async getMetricasStats(): Promise<{
    totalMetricas: number;
    metricasAtivas: number;
    unidadesUnicas: number;
  }> {
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const totalMetricas = await tx.metrica.count();

      const metricasAtivas = await tx.metrica.count({
        where: {
          equipamento_metricas: {
            some: {}
          }
        }
      });

      const unidadesResult = await tx.metrica.findMany({
        select: {
          unidade: true
        },
        distinct: ['unidade']
      });

      const unidadesUnicas = unidadesResult.length;

      return {
        totalMetricas,
        metricasAtivas,
        unidadesUnicas
      };
    });
  }
}
