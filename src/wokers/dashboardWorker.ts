import '../loadEnv';
import { rabbitMQService } from '../services/rabbitmqService';
import { UsuarioEquipamentoDashboardService } from '../services/usuarioEquipamentoDashboardService';
import { logError, logInfo, logWarn } from '../utils/logger';
import { prisma } from '../database';

const usuarioEquipamentoDashboardService = new UsuarioEquipamentoDashboardService();

async function processDashboardBundleRefresh(data: any): Promise<void> {
  try {
    logInfo('dashboardWorker received refresh message', {
      trigger: data?.trigger ?? null,
      id_equipamento: data?.id_equipamento ?? null,
      created_at: data?.created_at ?? null
    });

    const equipamentoId = Number(data?.id_equipamento);
    if (!equipamentoId || Number.isNaN(equipamentoId)) {
      logWarn('dashboardWorker received invalid refresh payload', {
        payload: data
      });
      throw new Error('Invalid id_equipamento in dashboard refresh message');
    }

    await usuarioEquipamentoDashboardService.refreshBundlesByEquipamento(equipamentoId, 'logs');
    logInfo('dashboardWorker finished bundle refresh', {
      equipamentoId
    });
  } catch (error) {
    logError('Failed to process dashboard bundle refresh from queue', error);
    throw error;
  }
}

async function startDashboardWorker() {
  try {
    logInfo('Starting dashboard worker...');
    await rabbitMQService.connect();
    logInfo('dashboardWorker connected to RabbitMQ');
    await rabbitMQService.consumeDashboardBundleRefresh(processDashboardBundleRefresh);
    logInfo('dashboardWorker is consuming dashboard bundle refresh queue');
  } catch (error) {
    logError('Failed to start dashboard worker', error);
    process.exit(1);
  }
}

process.on('SIGINT', async () => {
  logInfo('dashboardWorker received SIGINT, shutting down gracefully');
  await rabbitMQService.close();
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logInfo('dashboardWorker received SIGTERM, shutting down gracefully');
  await rabbitMQService.close();
  await prisma.$disconnect();
  process.exit(0);
});

startDashboardWorker();

