import { Prisma } from '@prisma/client';
import { prisma } from '../database';
import { Notificacao } from '../types/Notificacao';

export class NotificacaoRepository {
  async create(data: { id_usuario: number; descricao: string }): Promise<Notificacao> {
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      return tx.notificacao.create({
        data: {
          id_usuario: data.id_usuario,
          descricao: data.descricao,
          visualizado: false
        }
      });
    });
  }

  async createMany(data: Array<{ id_usuario: number; descricao: string }>, tenantId: number): Promise<number> {
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const result = await tx.notificacao.createMany({
        data: data.map(item => ({
          id_usuario: item.id_usuario,
          descricao: item.descricao,
          id_tenant: tenantId,
          visualizado: false
        })),
        skipDuplicates: true
      });
      return result.count;
    });
  }

  async findByUser(userId: number, viewed?: boolean): Promise<Notificacao[]> {
    const where: Prisma.notificacaoWhereInput = {
      id_usuario: userId
    };

    if (viewed !== undefined) {
      where.visualizado = viewed;
    }

    return prisma.notificacao.findMany({
      where,
      orderBy: {
        created_at: 'desc'
      }
    });
  }

  async countByUser(userId: number, viewed?: boolean): Promise<number> {
    const where: Prisma.notificacaoWhereInput = {
      id_usuario: userId
    };

    if (viewed !== undefined) {
      where.visualizado = viewed;
    }

    return prisma.notificacao.count({ where });
  }

  async markAsRead(id: number): Promise<Notificacao> {
    return prisma.notificacao.update({
      where: { id },
      data: { visualizado: true }
    });
  }

  async markAllAsRead(userId: number): Promise<number> {
    const result = await prisma.notificacao.updateMany({
      where: {
        id_usuario: userId,
        visualizado: false
      },
      data: {
        visualizado: true
      }
    });
    return result.count;
  }

  async delete(id: number): Promise<void> {
    await prisma.notificacao.delete({
      where: { id }
    });
  }
}


