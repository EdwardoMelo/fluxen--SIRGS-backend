import { Prisma } from '@prisma/client';
import { prisma } from '../database';
import { Cliente } from '../types/Cliente';

export interface ClienteFilters {
  columnFilters?: {
    id: string;
    nome: string;
    cnpj: string;
  };
  generalFilter: string;
}

export class ClienteRepository {



  findByResponsableUser = async (
    userId: number,
    filters: ClienteFilters,
    tenantId: number,
    tx?: Prisma.TransactionClient
  ): Promise<Cliente[] | void[]> => {
    const { generalFilter, columnFilters } = filters;
    const executor = tx || prisma;
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
    //acha os clientes em que o usuario é responsável
    const clientIds = clients.map(client => client.id);
    //filtra os clientes pelos filtros
    const where: Prisma.clienteWhereInput = {
      AND: [
        { id_tenant: tenantId },
        this.buildGeneralFilter(generalFilter),
        this.buildColumnFilters(columnFilters),
        {
          id: {
            in: clientIds,
          },
        }
      ],
    };
    return executor.cliente
      .findMany({
        include: this.include(),
        where,
        orderBy: {
          id: 'desc'
        }
      })
      .then(this.formatArray);



  };

  findByManagerUser = async (
    userId: number,
    filters: ClienteFilters,
    tenantId: number,
    tx?: Prisma.TransactionClient
  ): Promise<Cliente[] | void[]> => {
    const { generalFilter, columnFilters } = filters;
    const executor = tx || prisma;
    const clients = await executor.cliente.findMany({
      where: {
        id_tenant: tenantId,
        usuario_perfil_cliente: {
          some: {
            id_usuario: userId,
            id_perfil: 3, // gestor
          }
        }
      }
    });
    //acha os clientes em que o usuario é gestor
    const clientIds = clients.map(client => client.id);
    //filtra os clientes pelos filtros
    const where: Prisma.clienteWhereInput = {
      AND: [
        { id_tenant: tenantId },
        this.buildGeneralFilter(generalFilter),
        this.buildColumnFilters(columnFilters),
        {
          id: {
            in: clientIds,
          },
        }
      ],
    };
    return executor.cliente
      .findMany({
        include: this.include(),
        where,
        orderBy: {
          id: 'desc'
        }
      })
      .then(this.formatArray);
  };

  findAll = async (
    filters: ClienteFilters,
    tenantId: number,
    tx?: Prisma.TransactionClient
  ): Promise<Cliente[] | void[]> => {
    const executor = tx || prisma;
    const { generalFilter, columnFilters } = filters;
    const where: Prisma.clienteWhereInput = {
      AND: [
        { id_tenant: tenantId },
        this.buildGeneralFilter(generalFilter),
        this.buildColumnFilters(columnFilters),
      ],
    };
    return executor.cliente
      .findMany({
        include: this.include(),
        where,
        orderBy: {
          id: 'desc'
        }
      })
      .then(this.formatArray);

  };

  include = (): Prisma.clienteInclude => {
    return {

    };
  };

  findById = async (id: number, tenantId: number, tx?: Prisma.TransactionClient): Promise<Cliente | null> => {
    if (tx) {
      return tx.cliente
        .findFirst({ where: { id, id_tenant: tenantId }, include: this.include() })
        .then((cliente) => this.format(cliente));
    }

    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      return tx.cliente
        .findFirst({ where: { id, id_tenant: tenantId }, include: this.include() })
        .then((cliente) => this.format(cliente));
    });
  };

  create = async (data: Partial<Cliente>, tenantId: number, tx?: Prisma.TransactionClient): Promise<Cliente | null> => {
    const { nome, cnpj } = data;
    if (!nome || nome === "") {
      throw new Error(`Erro ao criar cliente: nome é obrigatório`);
    }
    if (tx) {
      return tx.cliente
        .create({
          data: {
            nome: nome,
            cnpj: cnpj || null,
            id_tenant: tenantId,
          },
          include: this.include(),
        })
        .then((cliente) => this.format(cliente));
    }

    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      return tx.cliente
        .create({
          data: {
            nome: nome,
            cnpj: cnpj || null,
            id_tenant: tenantId,
          },
          include: this.include(),
        })
        .then((cliente) => this.format(cliente));
    });
  };

  update = async (id: number, data: any, tx?: Prisma.TransactionClient): Promise<Cliente> => {
    if (tx) {
      return tx.cliente
        .update({ where: { id }, data, include: this.include() })
        .then(this.format);
    }

    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      return tx.cliente
        .update({ where: { id }, data, include: this.include() })
        .then(this.format);
    });
  };

  delete = async (id: number): Promise<void> => {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.cliente.delete({ where: { id } });
    });
  };

  buildGeneralFilter = (
    generalFilter: string
  ): Prisma.clienteWhereInput => {
    if (!generalFilter || generalFilter === "") return {};
    return {
      OR: [
        {
          nome: {
            contains: generalFilter,
          },
        },
        {
          cnpj: {
            contains: generalFilter,
          },
        },
      ],
    };
  };

  buildColumnFilters = (
    columnFilters: ClienteFilters["columnFilters"]
  ): Prisma.clienteWhereInput => {
    if (!columnFilters) return {};

    const filters: Prisma.clienteWhereInput = {};
    if (columnFilters?.id && !isNaN(parseInt(columnFilters.id))) {
      filters.id = { equals: parseInt(columnFilters.id) };
    }
    if (columnFilters?.nome && columnFilters?.nome !== "") {
      filters.nome = { contains: columnFilters.nome };
    }
    if (columnFilters?.cnpj && columnFilters?.cnpj !== "") {
      filters.cnpj = { contains: columnFilters.cnpj };
    }
    return filters;
  };

  format = (cliente: Cliente | any): Cliente => {
    return {
      ...cliente,
    };
  };

  formatArray = (clientes: any[]): Cliente[] =>
    clientes.map((cliente) => this.format(cliente));
}
