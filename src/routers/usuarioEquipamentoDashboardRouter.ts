import { Router } from 'express';
import { UsuarioEquipamentoDashboardController } from '../controllers/usuarioEquipamentoDashboardController';
import { authenticateToken } from '../middlewares/authMiddleware';
import { validateTenant } from '../middlewares/tenantMiddleware';

const router = Router();
const controller = new UsuarioEquipamentoDashboardController();

// Todas as rotas requerem autenticação JWT e validação de tenant
router.get(
  '/usuario-equipamento-dashboard/:userId/chart-bundle',
  authenticateToken,
  validateTenant,
  controller.getDashboardChartBundle.bind(controller)
);

router.get(
  '/usuario-equipamento-dashboard/:userId',
  authenticateToken,
  validateTenant,
  controller.getEquipamentosDashboard.bind(controller)
);

router.post(
  '/usuario-equipamento-dashboard',
  authenticateToken,
  validateTenant,
  controller.addEquipamentoToDashboard.bind(controller)
);

// Rota para deletar por ID da associação
router.delete(
  '/usuario-equipamento-dashboard/item/:id',
  authenticateToken,
  validateTenant,
  controller.removeEquipamentoFromDashboardById.bind(controller)
);

router.delete(
  '/usuario-equipamento-dashboard/:userId/:equipamentoId',
  authenticateToken,
  validateTenant,
  controller.removeEquipamentoFromDashboard.bind(controller)
);

router.get(
  '/usuario-equipamento-dashboard/:userId/:equipamentoId/check',
  authenticateToken,
  validateTenant,
  controller.checkEquipamentoInDashboard.bind(controller)
);

router.put(
  '/usuario-equipamento-dashboard/item/:id/tipo-grafico',
  authenticateToken,
  validateTenant,
  controller.updateTipoGrafico.bind(controller)
);

router.patch(
  '/usuario-equipamento-dashboard/item/:id/time-range',
  authenticateToken,
  validateTenant,
  controller.updateTimeRange.bind(controller)
);

export default router;


