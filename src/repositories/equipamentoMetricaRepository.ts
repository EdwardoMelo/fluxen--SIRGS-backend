import { Prisma } from '@prisma/client';
import { prisma } from '../database';
import { EquipamentoMetrica } from '../types/EquipamentoMetrica';
import { CreateEquipamentoMetricaDTO } from '../dto/ServiceDTOS/CreateEquipamentoMetricaDTO';
import { UpdateEquipamentoMetricaDTO } from '../dto/ServiceDTOS/UpdateEquipamentoMetricaDTO';

export class EquipamentoMetricaRepository {
  async findAll(tx?: Prisma.TransactionClient): Promise<EquipamentoMetrica[]> {
    if (tx) {
      return tx.equipamento_metricas.findMany({
        orderBy: {
          id: 'desc'
        }
      });
    }
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      return tx.equipamento_metricas.findMany({
        orderBy: {
          id: 'desc'
        }
      });
    });
  }

  async findById(
    id: number,
    tx?: Prisma.TransactionClient
  ): Promise<EquipamentoMetrica | null> {
    if (tx) {
      return tx.equipamento_metricas.findUnique({ where: { id } });
    }
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      return tx.equipamento_metricas.findUnique({ where: { id } });
    });
  }

  async findByEquipamentoId(id_equipamento: number, tx?: Prisma.TransactionClient): Promise<EquipamentoMetrica[]> {
    if (tx) {
      return tx.equipamento_metricas.findMany({
        where: { id_equipamento },
        include: { metrica: true },
        orderBy: {
          id: 'desc'
        }
      });
    }
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      return tx.equipamento_metricas.findMany({
        where: { id_equipamento },
        include: { metrica: true },
        orderBy: {
          id: 'desc'
        }
      });
    });
  }

  async findByEquipamentoAndMetrica(
    id_equipamento: number,
    id_metrica: number,
    tx?: Prisma.TransactionClient
  ): Promise<EquipamentoMetrica | null> {
    if (tx) {
      return tx.equipamento_metricas.findFirst({
        where: {
          id_equipamento,
          id_metrica
        },
        include: { metrica: true }
      });
    }
    return prisma.equipamento_metricas.findFirst({
      where: {
        id_equipamento,
        id_metrica
      },
      include: { metrica: true }
    });
  }

  async create(
    data: CreateEquipamentoMetricaDTO,
    tenantId: number,
    tx?: Prisma.TransactionClient
  ): Promise<EquipamentoMetrica> {

    if (tx) {
      return tx.equipamento_metricas.create({ 
        data: {
          ...data,
          id_tenant: tenantId,
        }
      });
    }
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      return tx.equipamento_metricas.create({ 
        data: {
          ...data,
          id_tenant: tenantId,
        }
      });
    });
  }

  async update(
    id: number,
    data: UpdateEquipamentoMetricaDTO,
    tx?: Prisma.TransactionClient
  ): Promise<EquipamentoMetrica> {
    
    if (tx) {
      return tx.equipamento_metricas.update({ where: { id }, data });
    }
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      return tx.equipamento_metricas.update({ where: { id }, data });
    });
  }

  async delete(id: number, tx?: Prisma.TransactionClient): Promise<void> {
    if (tx) {
      await tx.equipamento_metricas.delete({ where: { id } });
    } else {
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.equipamento_metricas.delete({ where: { id } });
      });
    }
  }
}
