import { Prisma } from '@prisma/client';
import { prisma } from '../database';
import { Equipamento } from '../types/Equipamento';
import { EquipmentFilters } from '../controllers/equipamentoController';

export class EquipamentoRepository {

  findByResponsableUser = async (
    userId: number,
    filters: EquipmentFilters,
    tenantId: number,
    tx?: Prisma.TransactionClient
  ): Promise<Equipamento[] | void[]> => {
    const executor = tx || prisma;
    const { generalFilter, columnFilters } = filters;
    const clients = await executor.cliente.findMany({
      where: {
        id_tenant: tenantId,
        usuario_perfil_cliente: {
          some: {
            id_usuario: userId,
            id_perfil: 2,
          }
        }
      }
    });
    //clientes em que o usuario é responsável
    const clientIds = clients.map(client => client.id);

    const where: Prisma.equipamentoWhereInput = {
      AND: [
        { id_tenant: tenantId },
        this.buildGeneralFilter(generalFilter),
        this.buildColumnFilters(columnFilters),
        {
          id_cliente: {
            in: clientIds,
          },
        }
      ],
    };

    return executor.equipamento
      .findMany({
        include: this.include(),
        where,
        orderBy: {
          id: 'desc'
        }
      })
      .then(this.formatArray)
  };

  findByManagerUser = async (
    userId: number,
    filters: EquipmentFilters,
    tenantId: number,
    tx?: Prisma.TransactionClient
  ): Promise<Equipamento[] | void[]> => {
    const executor = tx || prisma;
    const { generalFilter, columnFilters } = filters;
    const clients = await executor.cliente.findMany({
      where: {
        id_tenant: tenantId,
        usuario_perfil_cliente: {
          some: {
            id_usuario: userId,
            id_perfil: 3, // id_perfil 3 = gestor
          }
        }
      }
    });
    //clientes em que o usuario é gestor
    const clientIds = clients.map(client => client.id);

    const where: Prisma.equipamentoWhereInput = {
      AND: [
        { id_tenant: tenantId },
        this.buildGeneralFilter(generalFilter),
        this.buildColumnFilters(columnFilters),
        {
          id_cliente: {
            in: clientIds,
          },
        }
      ],
    };

    return executor.equipamento
      .findMany({
        include: this.include(),
        where,
        orderBy: {
          id: 'desc'
        }
      })
      .then(this.formatArray)
  };

  findAll = async (
    filters: EquipmentFilters,
    tenantId: number,
    tx?: Prisma.TransactionClient
  ): Promise<Equipamento[] | void[]> => {

    const executor = tx || prisma;
    const { generalFilter, columnFilters } = filters;
    const where: Prisma.equipamentoWhereInput = {
      AND: [
        { id_tenant: tenantId },
        this.buildGeneralFilter(generalFilter),
        this.buildColumnFilters(columnFilters),
      ],
    };

    return executor.equipamento
      .findMany({
        include: this.include(),
        where,
        orderBy: {
          id: 'desc'
        }
      }).then(this.formatArray);
  };

  include = (): Prisma.equipamentoInclude => {
    return {
      cliente: true,
    };
  };

  findById = async (id: number, tenantId: number, tx?: Prisma.TransactionClient): Promise<Equipamento | null> => {
    if (tx) {
      return tx.equipamento
        .findFirst({ where: { id, id_tenant: tenantId }, include: this.include() })
        .then((equipamento) => this.format(equipamento));
    }

    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      return tx.equipamento
        .findFirst({ where: { id, id_tenant: tenantId }, include: this.include() })
        .then((equipamento) => this.format(equipamento));
    });
  };

  create = async (data: Partial<Equipamento>, tenantId: number, tx?: Prisma.TransactionClient): Promise<Equipamento | null> => {
    // Gerar API key automaticamente
    const generateApiKey = (equipamentoId: number): string => {
      return `eq_${equipamentoId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    };
    if (tx) {
      return tx.equipamento
        .create({
          data: {
            nome: data.nome || '',
            id_cliente: data.id_cliente,
            id_tenant: tenantId,
            api_key: null,
            timeout_online_segundos:
              data.timeout_online_segundos !== undefined && data.timeout_online_segundos !== null
                ? Number(data.timeout_online_segundos)
                : null,
          },
          include: this.include(),
        })
        .then(async (equipamento) => {
          // Gerar e atualizar a API key
          const apiKey = generateApiKey(equipamento.id);
          const updatedEquipamento = await tx.equipamento.update({
            where: { id: equipamento.id },
            data: { api_key: apiKey },
            include: this.include(),
          });
          return this.format(updatedEquipamento);
        });
    }
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      return tx.equipamento
        .create({
          data: {
            nome: data.nome || '',
            id_cliente: data.id_cliente,
            id_tenant: tenantId,
            api_key: null,
            timeout_online_segundos:
              data.timeout_online_segundos !== undefined && data.timeout_online_segundos !== null
                ? Number(data.timeout_online_segundos)
                : null,
          },
          include: this.include(),
        })
        .then(async (equipamento) => {
          // Gerar e atualizar a API key
          const apiKey = generateApiKey(equipamento.id);
          const updatedEquipamento = await tx.equipamento.update({
            where: { id: equipamento.id },
            data: { api_key: apiKey },
            include: this.include(),
          });
          return this.format(updatedEquipamento);
        });
    });
  };

  update = async (id: number, data: any, tx?: Prisma.TransactionClient): Promise<Equipamento> => {
    if (tx) {
      return tx.equipamento
        .update({ where: { id }, data, include: this.include() })
        .then(this.format);
    }

    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      return tx.equipamento
        .update({ where: { id }, data, include: this.include() })
        .then(this.format);
    });
  };

  delete = async (id: number, tx?: Prisma.TransactionClient): Promise<void> => {
    const deleteWithChildren = async (client: Prisma.TransactionClient) => {
      // Remove filhos antes do equipamento (cobre FKs sem ON DELETE CASCADE no banco).
      await client.usuario_equipamento_dashboard.deleteMany({
        where: { id_equipamento: id },
      });
      await client.equipamento_metricas.deleteMany({
        where: { id_equipamento: id },
      });
      await client.equipamento_log_grupo.deleteMany({
        where: { id_equipamento: id },
      });
      await client.equipamento.delete({ where: { id } });
    };

    if (tx) {
      await deleteWithChildren(tx);
      return;
    }

    await prisma.$transaction(async (client: Prisma.TransactionClient) => {
      await deleteWithChildren(client);
    });
  };

  buildGeneralFilter = (
    generalFilter: string
  ): Prisma.equipamentoWhereInput => {
    if (!generalFilter || generalFilter === "") return {};
    return {
      OR: [
        {
          nome: {
            contains: generalFilter,
          },
        },
        {
          cliente: {
            OR: [
              { nome: { contains: generalFilter } }
            ],
          },
        },
      ],
    };
  };

  buildColumnFilters = (
    columnFilters: EquipmentFilters["columnFilters"]
  ): Prisma.equipamentoWhereInput => {
    if (!columnFilters) return {};

    const filters: Prisma.equipamentoWhereInput = {};
    if (columnFilters?.id && !isNaN(parseInt(columnFilters.id))) {
      filters.id = { equals: parseInt(columnFilters.id) };
    }
    if (columnFilters?.nome && columnFilters?.nome !== "") {
      filters.nome = { contains: columnFilters.nome };
    }
    if (columnFilters?.cliente_nome && columnFilters?.cliente_nome !== "") {
      filters.cliente = {
        OR: [{ nome: { contains: columnFilters.cliente_nome } }],
      };
    }
    return filters;
  };

  format = (equipamento: Equipamento | any): Equipamento => {
    return {
      ...equipamento,
      cliente: equipamento.cliente,
      cliente_nome: equipamento.cliente?.nome,
    };
  };

  formatArray = (equipamentos: any[]): Equipamento[] =>
    equipamentos.map((equipamento) => this.format(equipamento));
}

