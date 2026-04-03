import { Prisma } from '@prisma/client';
import { prisma } from '../database';
import { SystemAnnouncement } from '../types/SystemAnnouncement';

export interface SystemAnnouncementFilters {
  columnFilters?: {
    id: string;
    title: string;
    type: string;
    is_active: string;
  };
  generalFilter: string;
}

export class SystemAnnouncementRepository {
  include = (): any => {
    return {
      usuario: true,
    };
  };

  findAll = async (
    filters: SystemAnnouncementFilters,
    tenantId: number,
    tx?: Prisma.TransactionClient
  ): Promise<SystemAnnouncement[]> => {
    const executor = tx || prisma;
    const { generalFilter, columnFilters } = filters;
    const where: Prisma.system_announcementWhereInput = {
      AND: [
        { id_tenant: tenantId },
        this.buildGeneralFilter(generalFilter),
        this.buildColumnFilters(columnFilters),
      ],
    };
    return executor.system_announcement
      .findMany({
        include: this.include(),
        where,
        orderBy: {
          created_at: 'desc',
        },
      })
      .then(this.formatArray);
  };

  findById = async (
    id: number,
    tenantId: number,
    tx?: Prisma.TransactionClient
  ): Promise<SystemAnnouncement | null> => {
    const executor = tx || prisma;
    return executor.system_announcement
      .findFirst({
        where: {
          id,
          id_tenant: tenantId,
        },
        include: this.include(),
      })
      .then((announcement) => (announcement ? this.format(announcement) : null));
  };

  findActiveByTenant = async (
    tenantId: number,
    tx?: Prisma.TransactionClient
  ): Promise<SystemAnnouncement | null> => {
    const executor = tx || prisma;
    return executor.system_announcement
      .findFirst({
        where: {
          id_tenant: tenantId,
          is_active: true,
        },
        include: this.include(),
        orderBy: {
          created_at: 'desc',
        },
      })
      .then((announcement) => (announcement ? this.format(announcement) : null));
  };

  create = async (
    data: Partial<SystemAnnouncement>,
    tenantId: number,
    userId?: number,
    tx?: Prisma.TransactionClient
  ): Promise<SystemAnnouncement | null> => {
    const { title, description, type, is_active, starts_at } = data;
    if (!title || title === '') {
      throw new Error('Erro ao criar anúncio: título é obrigatório');
    }
    if (!description || description === '') {
      throw new Error('Erro ao criar anúncio: descrição é obrigatória');
    }
    if (!type) {
      throw new Error('Erro ao criar anúncio: tipo é obrigatório');
    }

    const executor = tx || prisma;
    return executor.system_announcement
      .create({
        data: {
          title,
          description,
          type: type as any,
          is_active: is_active ?? true,
          starts_at: starts_at || new Date(),
          ends_at: null,
          id_tenant: tenantId,
          created_by: userId || null,
        },
        include: this.include(),
      })
      .then((announcement) => this.format(announcement) as SystemAnnouncement);
  };

  update = async (
    id: number,
    data: Partial<SystemAnnouncement>,
    tenantId: number,
    tx?: Prisma.TransactionClient
  ): Promise<SystemAnnouncement> => {
    const executor = tx || prisma;
    return executor.system_announcement
      .update({
        where: { id },
        data: {
          title: data.title,
          description: data.description,
          type: data.type as any,
          is_active: data.is_active,
          starts_at: data.starts_at,
          ends_at: data.ends_at,
        },
        include: this.include(),
      })
      .then((a) => this.format(a) as SystemAnnouncement);
  };

  delete = async (id: number, tenantId: number): Promise<void> => {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.system_announcement.delete({
        where: { id },
      });
    });
  };

  buildGeneralFilter = (
    generalFilter: string
  ): Prisma.system_announcementWhereInput => {
    if (!generalFilter || generalFilter === '') return {};
    return {
      OR: [
        {
          title: {
            contains: generalFilter,
          },
        },
        {
          description: {
            contains: generalFilter,
          },
        },
      ],
    };
  };

  buildColumnFilters = (
    columnFilters: SystemAnnouncementFilters['columnFilters']
  ): Prisma.system_announcementWhereInput => {
    if (!columnFilters) return {};

    const filters: Prisma.system_announcementWhereInput = {};
    if (columnFilters?.id && !isNaN(parseInt(columnFilters.id))) {
      filters.id = { equals: parseInt(columnFilters.id) };
    }
    if (columnFilters?.title && columnFilters?.title !== '') {
      filters.title = { contains: columnFilters.title };
    }
    if (columnFilters?.type && columnFilters?.type !== '') {
      filters.type = { equals: columnFilters.type as any };
    }
    if (columnFilters?.is_active && columnFilters?.is_active !== '') {
      filters.is_active = { equals: columnFilters.is_active === 'true' };
    }
    return filters;
  };

  format = (announcement: SystemAnnouncement | any | null): SystemAnnouncement | null => {
    if (announcement == null) {
      return null;
    }
    return {
      id: announcement.id,
      id_tenant: announcement.id_tenant,
      title: announcement.title,
      description: announcement.description,
      type: announcement.type,
      is_active: announcement.is_active,
      starts_at: announcement.starts_at,
      ends_at: announcement.ends_at,
      created_by: announcement.created_by,
      created_at: announcement.created_at,
    };
  };

  formatArray = (announcements: any[]): SystemAnnouncement[] =>
    announcements.map((announcement) => this.format(announcement) as SystemAnnouncement);
}
