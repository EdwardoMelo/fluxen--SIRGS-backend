import { Router } from 'express';
import { EquipamentoController } from '../controllers/equipamentoController';
import { authenticateToken } from '../middlewares/authMiddleware';
import { validateTenant } from '../middlewares/tenantMiddleware';

const router = Router();
const equipamentoController = new EquipamentoController();

// Rotas com autenticação JWT e validação de tenant
router.get(
  "/equipamentos",
  authenticateToken,
  validateTenant,
  equipamentoController.getEquipamentos.bind(equipamentoController)
);
router.get(
  "/equipamentos/:id",
  authenticateToken,
  validateTenant,
  equipamentoController.getEquipamentoById.bind(equipamentoController)
);
router.get(
  "/equipamentos/:id/online-status",
  authenticateToken,
  validateTenant,
  equipamentoController.getOnlineStatus.bind(equipamentoController)
);
router.post(
  "/equipamentos",
  authenticateToken,
  validateTenant,
  equipamentoController.createEquipamento.bind(equipamentoController)
);
router.put(
  "/equipamentos/:id",
  authenticateToken,
  validateTenant,
  equipamentoController.updateEquipamento.bind(equipamentoController)
);
router.delete(
  "/equipamentos/:id",
  authenticateToken,
  validateTenant,
  equipamentoController.deleteEquipamento.bind(equipamentoController)
);

// Rotas para gerenciar API Keys
router.post(
  "/equipamentos/:id/generate-api-key",
  authenticateToken,
  validateTenant,
  equipamentoController.generateApiKey.bind(equipamentoController)
);
router.post(
  "/equipamentos/:id/regenerate-api-key",
  authenticateToken,
  validateTenant,
  equipamentoController.regenerateApiKey.bind(equipamentoController)
);

export default router;
