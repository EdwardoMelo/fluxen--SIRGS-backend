import { NotificacaoRepository } from '../repositories/notificacaoRepository';
import { Notificacao } from '../types/Notificacao';
import { EquipamentoLogRepository } from '../repositories/equipamentoLogRepository';
import { EquipamentoMetricaRepository } from '../repositories/equipamentoMetricaRepository';
import { Cliente } from '../types/Cliente';
import { prisma } from '../database';
import { logError } from '../utils/logger';

export class NotificacaoService {
  private notificacaoRepository = new NotificacaoRepository();
  private equipamentoLogRepository = new EquipamentoLogRepository();
  private equipamentoMetricaRepository = new EquipamentoMetricaRepository();

  /**
   * Cria notificações para alarmes detectados em um log específico
   * Chamado durante o processamento de logs recebidos dos equipamentos
   */
  async createNotificationsForLog(
    equipamentoId: number,
    log: { id_metrica: number; valor_convertido: number },
    equipamentoMetrica: any,
    timestamp: Date
  ): Promise<void> {
    try {
      // Buscar equipamento com cliente
      const equipamento = await prisma.equipamento.findUnique({
        where: { id: equipamentoId },
        include: {
          cliente: true
        }
      });

      if (!equipamento || !equipamento.cliente || !equipamento.id_tenant) {
        return; // Equipamento não encontrado, sem cliente ou sem tenant
      }

      const cliente = equipamento.cliente;
      const tenantId = equipamento.id_tenant;
      const valorConvertido = log.valor_convertido;
      const equipamentoMetricaData = equipamentoMetrica;

      // Verificar alarmes
      let tipoAlerta: 'min' | 'max' | null = null;

      if (equipamentoMetricaData.alarme_minimo !== null && equipamentoMetricaData.alarme_minimo !== undefined) {
        if (valorConvertido <= equipamentoMetricaData.alarme_minimo) {
          tipoAlerta = 'min';
        }
      }

      if (equipamentoMetricaData.alarme_maximo !== null && equipamentoMetricaData.alarme_maximo !== undefined) {
        if (valorConvertido >= equipamentoMetricaData.alarme_maximo) {
          tipoAlerta = 'max';
        }
      }

      if (!tipoAlerta) {
        return; // Nenhum alarme detectado
      }

      // Buscar métrica para nome e unidade (se não estiver aninhada, buscar separadamente)
      let metrica = equipamentoMetricaData.metrica;
      if (!metrica && equipamentoMetricaData.id_metrica) {
        metrica = await prisma.metrica.findUnique({
          where: { id: equipamentoMetricaData.id_metrica }
        });
      }
      const descricao = `Alerta ${tipoAlerta === 'min' ? 'MÍNIMO' : 'MÁXIMO'}: Equipamento "${equipamento.nome}" - Métrica "${metrica?.nome || 'Desconhecida'}" com valor ${valorConvertido.toFixed(2)} ${metrica?.unidade || ''} (${timestamp.toLocaleString('pt-BR')})`;

      // Criar notificações para responsáveis, gestores e administradores do cliente
      // Buscar todos os usuários com perfil de responsável (id_perfil: 2) ou gestor (id_perfil: 3) para este cliente do mesmo tenant
      const usuariosNotificacao = await prisma.usuario_perfil_cliente.findMany({
        where: {
          id_cliente: cliente.id,
          id_perfil: {
            in: [2, 3] // 2 = responsável, 3 = gestor
          },
          id_tenant: tenantId
        },
        select: {
          id_usuario: true
        }
      });

      // Buscar também administradores (id_perfil: 1) que podem ter acesso a todos os clientes do mesmo tenant
      const administradores = await prisma.usuario_perfil.findMany({
        where: {
          id_perfil: 1, // 1 = administrador
          id_tenant: tenantId
        },
        select: {
          id_usuario: true
        }
      });

      const notificacoesParaCriar: Array<{ id_usuario: number; descricao: string }> = [];
      const usuariosUnicos = new Set<number>();

      // Adicionar responsáveis e gestores do cliente
      usuariosNotificacao.forEach(upc => {
        if (!usuariosUnicos.has(upc.id_usuario)) {
          usuariosUnicos.add(upc.id_usuario);
          notificacoesParaCriar.push({
            id_usuario: upc.id_usuario,
            descricao
          });
        }
      });

      // Adicionar administradores
      administradores.forEach(up => {
        if (!usuariosUnicos.has(up.id_usuario)) {
          usuariosUnicos.add(up.id_usuario);
          notificacoesParaCriar.push({
            id_usuario: up.id_usuario,
            descricao
          });
        }
      });

      if (notificacoesParaCriar.length > 0) {
        await this.notificacaoRepository.createMany(notificacoesParaCriar, tenantId);
      }
    } catch (error) {
      logError(`[Notifications] Failed to create notifications for log`, error);
      // Não lançar erro para não interromper o processamento de logs
    }
  }

  async processNotificationsForUser(userId: number): Promise<void> {
    // Obter tenantId do usuário
    const usuario = await prisma.usuario.findUnique({
      where: { id: userId },
      select: { id_tenant: true }
    });

    if (!usuario || !usuario.id_tenant) {
      return;
    }

    const tenantId = usuario.id_tenant;

    // Verificar se o usuário é administrador (tem perfil 1)
    const isAdmin = await prisma.usuario_perfil.findFirst({
      where: {
        id_usuario: userId,
        id_perfil: 1,
        id_tenant: tenantId
      }
    });

    let clientesIds: number[] = [];

    if (isAdmin) {
      // Se for admin, buscar todos os clientes do mesmo tenant
      const todosClientes = await prisma.cliente.findMany({
        where: {
          id_tenant: tenantId
        },
        select: { id: true }
      });
      clientesIds = todosClientes.map(c => c.id);
    } else {
      // Buscar clientes onde o usuário é responsável (id_perfil: 2) ou gestor (id_perfil: 3) do mesmo tenant
      const clientesUsuario = await prisma.usuario_perfil_cliente.findMany({
        where: {
          id_usuario: userId,
          id_perfil: {
            in: [2, 3] // 2 = responsável, 3 = gestor
          },
          id_tenant: tenantId
        },
        select: {
          id_cliente: true
        }
      });
      clientesIds = [...new Set(clientesUsuario.map(c => c.id_cliente))];
    }

    const todosClientes = await prisma.cliente.findMany({
      where: {
        id: {
          in: clientesIds
        },
        id_tenant: tenantId
      }
    });

    if (clientesIds.length === 0) {
      return;
    }

    // Buscar todos os equipamentos desses clientes do mesmo tenant
    const equipamentos = await prisma.equipamento.findMany({
      where: {
        id_cliente: {
          in: clientesIds
        },
        id_tenant: tenantId
      }
    });

    if (equipamentos.length === 0) {
      return;
    }

    const equipamentosIds = equipamentos.map(e => e.id);

    // Buscar logs grupos recentes (últimas 24 horas) desses equipamentos
    const umDiaAtras = new Date();
    umDiaAtras.setHours(umDiaAtras.getHours() - 24);

    const logsGrupos = await prisma.equipamento_log_grupo.findMany({
      where: {
        id_equipamento: {
          in: equipamentosIds
        },
        timestamp: {
          gte: umDiaAtras
        }
      },
      orderBy: {
        timestamp: 'desc'
      },
      take: 1000 // Limitar para não sobrecarregar
    });

    // Processar cada log grupo e verificar alarmes
    const notificacoesParaCriar: Array<{ id_usuario: number; descricao: string }> = [];

    for (const logGrupo of logsGrupos) {
      if (!logGrupo.id_equipamento) continue;

      const equipamento = equipamentos.find(e => e.id === logGrupo.id_equipamento);
      if (!equipamento) continue;

      // Buscar métricas do equipamento
      const metrics = await this.equipamentoMetricaRepository.findByEquipamentoId(logGrupo.id_equipamento);

      // Parse dos logs
      let parsedLogs: any[] = [];
      if (logGrupo.logs) {
        try {
          parsedLogs = typeof logGrupo.logs === 'string'
            ? JSON.parse(logGrupo.logs)
            : logGrupo.logs;
        } catch (error) {
          continue;
        }
      }

      // Verificar cada log por alarmes
      for (const log of parsedLogs) {
        const valorConvertido = log.valor_convertido !== null && log.valor_convertido !== undefined
          ? Number(log.valor_convertido)
          : null;

        if (valorConvertido === null) continue;

        const equipamentoMetrica = metrics.find(m => m.id_metrica === log.id_metrica);
        if (!equipamentoMetrica) continue;

        let tipoAlerta: 'min' | 'max' | null = null;

        // Verificar alarme mínimo
        if (equipamentoMetrica.alarme_minimo !== null && equipamentoMetrica.alarme_minimo !== undefined) {
          if (valorConvertido <= equipamentoMetrica.alarme_minimo) {
            tipoAlerta = 'min';
          }
        }

        // Verificar alarme máximo
        if (equipamentoMetrica.alarme_maximo !== null && equipamentoMetrica.alarme_maximo !== undefined) {
          if (valorConvertido >= equipamentoMetrica.alarme_maximo) {
            tipoAlerta = 'max';
          }
        }

        if (tipoAlerta) {
          const metrica = equipamentoMetrica.metrica;
          const descricao = `Alerta ${tipoAlerta === 'min' ? 'MÍNIMO' : 'MÁXIMO'}: Equipamento "${equipamento.nome}" - Métrica "${metrica?.nome || 'Desconhecida'}" com valor ${valorConvertido.toFixed(2)} ${metrica?.unidade || ''} (${new Date(logGrupo.timestamp || new Date()).toLocaleString('pt-BR')})`;

          // Criar notificação para responsáveis, gestores e administradores do cliente
          const cliente = todosClientes.find(c => c && c.id === equipamento.id_cliente);
          if (cliente) {
            // Buscar todos os usuários com perfil de responsável (id_perfil: 2) ou gestor (id_perfil: 3) para este cliente do mesmo tenant
            const usuariosNotificacao = await prisma.usuario_perfil_cliente.findMany({
              where: {
                id_cliente: cliente.id,
                id_perfil: {
                  in: [2, 3] // 2 = responsável, 3 = gestor
                },
                id_tenant: tenantId
              },
              select: {
                id_usuario: true
              }
            });

            // Buscar também administradores (id_perfil: 1) do mesmo tenant
            const administradores = await prisma.usuario_perfil.findMany({
              where: {
                id_perfil: 1, // 1 = administrador
                id_tenant: tenantId
              },
              select: {
                id_usuario: true
              }
            });

            const usuariosUnicos = new Set<number>();

            // Adicionar responsáveis e gestores do cliente
            usuariosNotificacao.forEach(upc => {
              if (!usuariosUnicos.has(upc.id_usuario)) {
                usuariosUnicos.add(upc.id_usuario);
                notificacoesParaCriar.push({
                  id_usuario: upc.id_usuario,
                  descricao
                });
              }
            });

            // Adicionar administradores
            administradores.forEach(up => {
              if (!usuariosUnicos.has(up.id_usuario)) {
                usuariosUnicos.add(up.id_usuario);
                notificacoesParaCriar.push({
                  id_usuario: up.id_usuario,
                  descricao
                });
              }
            });
          }
        }
      }
    }

    // Criar notificações em lote
    if (notificacoesParaCriar.length > 0) {
      await this.notificacaoRepository.createMany(notificacoesParaCriar, tenantId);
    }
  }

  async getNotificationsByUser(userId: number, viewed?: boolean): Promise<Notificacao[]> {
    return this.notificacaoRepository.findByUser(userId, viewed);
  }

  async getUnreadNotificationsCount(userId: number): Promise<number> {
    return this.notificacaoRepository.countByUser(userId, false);
  }

  async markAsRead(id: number): Promise<Notificacao> {
    return this.notificacaoRepository.markAsRead(id);
  }

  async markAllAsRead(userId: number): Promise<number> {
    return this.notificacaoRepository.markAllAsRead(userId);
  }
}

