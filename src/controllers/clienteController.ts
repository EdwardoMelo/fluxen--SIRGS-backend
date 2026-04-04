import { Request, Response } from 'express';
import { ClienteService } from '../services/clienteService';
import { ClienteFilters } from '../repositories/clienteRepository';
import { logError, logWarn } from '../utils/logger';

export class ClienteController {
  private clienteService = new ClienteService();

  async getClientes(req: Request, res: Response): Promise<void> {
    const filters: ClienteFilters = req.query ? req.query as any : {};
    const userId = req.query['userId'] || req.user?.id;
    const tenantId = req.tenantId;

    if (!userId) {
      logWarn('Get clients failed: missing user ID', { path: req.path });
      res.status(400).json({ message: 'User ID is required' });
      return;
    }

    if (!tenantId) {
      logWarn('Get clients failed: missing tenant ID', { path: req.path });
      res.status(400).json({ message: 'Tenant ID is required' });
      return;
    }

    try {
      const clientes = await this.clienteService.getClientes(Number(userId), filters, tenantId);
      res.json(clientes);
    } catch (error) {
      logError('Failed to get clients', error, { userId, tenantId });
      res.status(500).json({ message: 'Erro ao buscar clientes' });
    }
  }

  async getClienteById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const tenantId = req.tenantId;
      
      if (!tenantId) {
        res.status(400).json({ message: 'Tenant ID is required' });
        return;
      }

      const cliente = await this.clienteService.getClienteById(Number(id), tenantId);
      if (!cliente) {
        res.status(404).json({ message: 'Cliente não encontrado' });
        return;
      }
      res.json(cliente);
    } catch (error) {
      logError('Failed to get client by ID', error, { clienteId: req.params.id });
      res.status(500).json({ message: 'Erro ao buscar cliente' });
    }
  }

  async createCliente(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) {
        res.status(400).json({ message: 'Tenant ID is required' });
        return;
      }
      const cliente = await this.clienteService.createCliente(req.body, tenantId);
      res.status(201).json(cliente);
    } catch (error) {
      logError('Failed to create client', error);
      res.status(500).json({ message: 'Erro ao criar cliente' });
    }
  }

  async updateCliente(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const cliente = await this.clienteService.updateCliente(Number(id), req.body);
      res.json(cliente);
    } catch (error) {
      logError('Failed to update client', error, { clienteId: req.params.id });
      res.status(500).json({ message: 'Erro ao atualizar cliente' });
    }
  }

  async deleteCliente(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      await this.clienteService.deleteCliente(Number(id));
      res.status(204).send();
    } catch (error) {
      logError('Failed to delete client', error, { clienteId: req.params.id });
      res.status(500).json({ message: 'Erro ao deletar cliente' });
    }
  }

  async getClientesByManager(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id ? Number(req.user.id) : undefined;
      const tenantId = req.tenantId;

      if (!userId) {
        res.status(400).json({ message: 'User ID is required' });
        return;
      }

      if (!tenantId) {
        res.status(400).json({ message: 'Tenant ID is required' });
        return;
      }

      const filters: ClienteFilters = req.query ? req.query as any : {
        columnFilters: {
          id: null,
          nome: null,
          cnpj: null,
        },
        generalFilter: "",
      };

      const clientes = await this.clienteService.getClientesByManager(userId, tenantId, filters);
      res.json(clientes);
    } catch (error) {
      logError('Failed to get clients by manager', error, { userId: req.user?.id });
      res.status(500).json({ message: 'Erro ao buscar clientes do gestor' });
    }
  }
}

