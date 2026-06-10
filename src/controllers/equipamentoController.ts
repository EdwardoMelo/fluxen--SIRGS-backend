import { Request, Response } from 'express';
import { EquipamentoService } from '../services/equipamentoService';
import { logError } from '../utils/logger';

export interface EquipmentFilters {
  columnFilters?: {
    id: string;
    nome: string;
    cliente_nome: string;
  };
  generalFilter: string;
}

export class EquipamentoController {
  private equipamentoService = new EquipamentoService();

  private validateTimeoutOnlineSegundos(value: unknown): string | null {
    if (value === undefined || value === null || value === '') {
      return null;
    }
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) {
      return 'timeout_online_segundos deve ser um inteiro maior que zero';
    }
    if (parsed > 86400) {
      return 'timeout_online_segundos não pode exceder 86400 segundos (24h)';
    }
    return null;
  }

  async getEquipamentos(req: Request, res: Response): Promise<void> {
    const filters: EquipmentFilters = req.query ? req.query as any : {};
    const userId = req.query.userId as string;
    const tenantId = req.tenantId;

    if (!tenantId) {
      res.status(400).json({ message: 'Tenant ID is required' });
      return;
    }

    try {
      const equipamentos = await this.equipamentoService.getEquipamentos(Number(userId), filters, tenantId);
      res.json(equipamentos);
    } catch (error) {
      logError('Failed to get equipment', error, { userId, tenantId });
      res.status(500).json({ message: 'Erro ao buscar equipamentos' });
    }
  }

  async getEquipamentoById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;

      if (!tenantId) {
        res.status(400).json({ message: 'Tenant ID is required' });
        return;
      }

      const equipamento = await this.equipamentoService.getEquipamentoById(Number(id), tenantId);
      if (!equipamento) {
        res.status(404).json({ message: 'Equipamento não encontrado' });
        return;
      }
      res.json(equipamento);
    } catch (error) {
      logError('Failed to get equipment by ID', error, { equipamentoId: req.params.id });
      res.status(500).json({ message: 'Erro ao buscar equipamento' });
    }
  }

  async createEquipamento(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id ? Number(req.user.id) : undefined;
      const tenantId = req.tenantId;

      if (!tenantId) {
        res.status(400).json({ message: 'Tenant ID is required' });
        return;
      }

      const timeoutError = this.validateTimeoutOnlineSegundos(req.body?.timeout_online_segundos);
      if (timeoutError) {
        res.status(400).json({ message: timeoutError });
        return;
      }

      const equipamento = await this.equipamentoService.createEquipamento(req.body, tenantId, userId);
      res.status(201).json(equipamento);
    } catch (error: any) {
      if (error.message?.includes('permissão') || error.message?.includes('obrigatório')) {
        res.status(403).json({ message: error.message });
        return;
      }
      logError('Failed to create equipment', error);
      res.status(500).json({ message: 'Erro ao criar equipamento' });
    }
  }

  async updateEquipamento(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    try {
      const timeoutError = this.validateTimeoutOnlineSegundos(req.body?.timeout_online_segundos);
      if (timeoutError) {
        res.status(400).json({ message: timeoutError });
        return;
      }

      const equipamento = await this.equipamentoService.updateEquipamento(Number(id), req.body);
      res.json(equipamento);
    } catch (error) {
      logError('Failed to update equipment', error, { equipamentoId: id });
      res.status(500).json({ message: 'Erro ao atualizar equipamento' });
    }
  }

  async deleteEquipamento(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    try {
      await this.equipamentoService.deleteEquipamento(Number(id));
      res.status(204).send();
    } catch (error) {
      logError('Failed to delete equipment', error, { equipamentoId: id });
      res.status(500).json({ message: 'Erro ao deletar equipamento' });
    }
  }

  async generateApiKey(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    try {
      const apiKey = await this.equipamentoService.generateApiKey(Number(id));
      res.json({ api_key: apiKey });
    } catch (error) {
      logError('Failed to generate API key', error, { equipamentoId: id });
      res.status(500).json({ message: 'Erro ao gerar API key' });
    }
  }

  async regenerateApiKey(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    try {
      const apiKey = await this.equipamentoService.regenerateApiKey(Number(id));
      res.json({ api_key: apiKey });
    } catch (error) {
      logError('Failed to regenerate API key', error, { equipamentoId: id });
      res.status(500).json({ message: 'Erro ao regenerar API key' });
    }
  }

  async getOnlineStatus(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;
      const userId = req.user?.id ? Number(req.user.id) : undefined;

      if (!tenantId) {
        res.status(400).json({ message: 'Tenant ID is required' });
        return;
      }

      const status = await this.equipamentoService.getOnlineStatus(
        Number(id),
        tenantId,
        userId
      );

      if (!status) {
        res.status(404).json({ message: 'Equipamento não encontrado' });
        return;
      }

      res.json(status);
    } catch (error: any) {
      if (error.message?.includes('permissão')) {
        res.status(403).json({ message: error.message });
        return;
      }
      logError('Failed to get equipment online status', error, { equipamentoId: req.params.id });
      res.status(500).json({ message: 'Erro ao buscar status do equipamento' });
    }
  }
}
