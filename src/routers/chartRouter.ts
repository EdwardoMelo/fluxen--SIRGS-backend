import { Router } from 'express';
import { ChartController } from '../controllers/chartController';
import { authenticateToken } from '../middlewares/authMiddleware';
import { validateTenant } from '../middlewares/tenantMiddleware';

const router = Router();
const chartController = new ChartController();

// Rotas para gráficos (requerem autenticação JWT e validação de tenant)
router.get(
  '/charts/line/:id_equipamento/:id_metrica',
  authenticateToken,
  validateTenant,
  chartController.getLineChartData.bind(chartController)
);

router.get(
  '/charts/doughnut/:id_equipamento/:id_metrica',
  authenticateToken,
  validateTenant,
  chartController.getDoughnutChartData.bind(chartController)
);

router.get(
  '/charts/bar/:id_equipamento/:id_metrica',
  authenticateToken,
  validateTenant,
  chartController.getBarChartData.bind(chartController)
);

router.get(
  '/charts/counter/:id_equipamento/:id_metrica',
  authenticateToken,
  validateTenant,
  chartController.getCounterChartData.bind(chartController)
);

export default router;

