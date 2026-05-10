import { Prisma } from '@prisma/client';
import { prisma } from '../database';
import { UsuarioEquipamentoDashboard } from '../types/UsuarioEquipamentoDashboard';
import { Equipamento } from '../types/Equipamento';

export class UsuarioEquipamentoDashboardRepository {
  
  include = (): Prisma.usuario_equipamento_dashboardInclude => {
    return {
      usuario: {
        include: {
          usuario_perfil: {
            include: {
              perfil: true
            }
          }
        }
      },
      equipamento: {
        include: {
          cliente: true,
          equipamento_metricas: {
            include: {
              metrica: true
            }
          }
        }
      },
      metrica: true,
      tipo_grafico: true
    };
  };

  format = (item: any): UsuarioEquipamentoDashboard => {
    return {
      id: item.id,
      id_tenant: item.id_tenant,
      id_usuario: item.id_usuario,
      id_equipamento: item.id_equipamento,
      id_metrica: item.id_metrica,
      id_tipo_grafico: item.id_tipo_grafico,
      created_at: item.created_at,
      usuario: item.usuario,
      equipamento: item.equipamento as Equipamento,
      metrica: item.metrica,
      tipo_grafico: item.tipo_grafico
    };
  };

  /**
   * Busca todos os equipamentos associados ao dashboard de um usuário
   */
  async findByUsuarioId(
    id_usuario: number,
    tx?: Prisma.TransactionClient
  ): Promise<UsuarioEquipamentoDashboard[]> {
    const executor = tx || prisma;
    
    const items = await executor.usuario_equipamento_dashboard.findMany({
      where: {
        id_usuario
      },
      include: this.include(),
      orderBy: {
        created_at: 'desc'
      }
    });

    return items.map(item => this.format(item));
  }

  /**
   * Busca um equipamento específico do dashboard do usuário
   */
  async findByUsuarioAndEquipamento(
    id_usuario: number,
    id_equipamento: number,
    tx?: Prisma.TransactionClient
  ): Promise<UsuarioEquipamentoDashboard | null> {
    const executor = tx || prisma;
    
    const item = await executor.usuario_equipamento_dashboard.findFirst({
      where: {
        id_usuario,
        id_equipamento
      },
      include: this.include()
    });

    return item ? this.format(item) : null;
  }

  async findById(
    id: number,
    tx?: Prisma.TransactionClient
  ): Promise<UsuarioEquipamentoDashboard | null> {
    const executor = tx || prisma;
    const item = await executor.usuario_equipamento_dashboard.findUnique({
      where: { id },
      include: this.include()
    });
    return item ? this.format(item) : null;
  }

  /**
   * Adiciona um equipamento ao dashboard do usuário
   */
  async create(
    id_usuario: number,
    id_equipamento: number,
    tenantId: number,
    id_metrica?: number | null,
    id_tipo_grafico?: number | null,
    tx?: Prisma.TransactionClient
  ): Promise<UsuarioEquipamentoDashboard> {
    const executor = tx || prisma;
    
    const item = await executor.usuario_equipamento_dashboard.create({
      data: {
        id_usuario,
        id_equipamento,
        id_tenant: tenantId,
        id_metrica: id_metrica || null,
        id_tipo_grafico: id_tipo_grafico || null,
        created_at: new Date()
      },
      include: this.include()
    });

    return this.format(item);
  }

  /**
   * Remove um equipamento do dashboard do usuário (por ID da associação)
   */
  async deleteById(
    id: number,
    tx?: Prisma.TransactionClient
  ): Promise<void> {
    const executor = tx || prisma;
    await executor.usuario_equipamento_dashboard.delete({
      where: { id }
    });
  }

  /**
   * ID da associação (usuario + equipamento + métrica), para updates incrementais do bundle.
   */
  async findIdByUsuarioEquipamentoMetrica(
    id_usuario: number,
    id_equipamento: number,
    id_metrica?: number | null,
    tx?: Prisma.TransactionClient
  ): Promise<number | null> {
    const executor = tx || prisma;
    const row = await executor.usuario_equipamento_dashboard.findFirst({
      where: {
        id_usuario,
        id_equipamento,
        id_metrica: id_metrica ?? null
      },
      select: { id: true }
    });
    return row?.id ?? null;
  }

  /**
   * Remove um equipamento do dashboard do usuário (com métrica específica)
   */
  async delete(
    id_usuario: number,
    id_equipamento: number,
    id_metrica?: number | null,
    tx?: Prisma.TransactionClient
  ): Promise<void> {
    const executor = tx || prisma;
    const uniqueId = await this.findIdByUsuarioEquipamentoMetrica(
      id_usuario,
      id_equipamento,
      id_metrica,
      tx
    );
    if (uniqueId != null) {
      await executor.usuario_equipamento_dashboard.delete({
        where: { id: uniqueId }
      });
    }
  }

  /**
   * Remove todos os equipamentos do dashboard do usuário
   */
  async deleteAllByUsuario(
    id_usuario: number,
    tx?: Prisma.TransactionClient
  ): Promise<void> {
    const executor = tx || prisma;
    
    await executor.usuario_equipamento_dashboard.deleteMany({
      where: {
        id_usuario
      }
    });
  }

  /**
   * Verifica se um equipamento já está no dashboard do usuário (com a mesma métrica)
   */
  async exists(
    id_usuario: number,
    id_equipamento: number,
    id_metrica?: number | null,
    tx?: Prisma.TransactionClient
  ): Promise<boolean> {
    const executor = tx || prisma;
    
    const count = await executor.usuario_equipamento_dashboard.count({
      where: {
        id_usuario,
        id_equipamento,
        id_metrica: id_metrica || null
      }
    });

    return count > 0;
  }

  /**
   * Atualiza o tipo de gráfico de uma associação existente
   */
  async updateTipoGrafico(
    id: number,
    id_tipo_grafico: number | null,
    tx?: Prisma.TransactionClient
  ): Promise<UsuarioEquipamentoDashboard> {
    const executor = tx || prisma;
    
    const item = await executor.usuario_equipamento_dashboard.update({
      where: { id },
      data: {
        id_tipo_grafico: id_tipo_grafico || null
      },
      include: this.include()
    });

    return this.format(item);
  }

  async findUserIdsByEquipamentoId(
    id_equipamento: number,
    tx?: Prisma.TransactionClient
  ): Promise<number[]> {
    const executor = tx || prisma;
    const rows = await executor.usuario_equipamento_dashboard.findMany({
      where: { id_equipamento },
      select: { id_usuario: true },
      distinct: ['id_usuario']
    });
    return rows.map((row) => row.id_usuario);
  }
}


