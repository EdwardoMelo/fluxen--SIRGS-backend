import { Request, Response } from 'express';
import { UsuarioPerfilClienteService } from '../services/usuarioPerfilClienteService';
import { logError } from '../utils/logger';

export class UsuarioPerfilClienteController {
  private service = new UsuarioPerfilClienteService();

  async getRelacionamentosByUsuario(req: Request, res: Response): Promise<void> {
    try {
      const { id_usuario } = req.params;
      const relacionamentos = await this.service.getRelacionamentosByUsuario(Number(id_usuario));
      res.json(relacionamentos);
    } catch (error) {
      logError('Failed to get usuario_perfil_cliente relationships', error, {
        usuarioId: req.params.id_usuario,
      });
      res.status(500).json({ message: 'Erro ao buscar relacionamentos do usuário' });
    }
  }

  async updateRelacionamentos(req: Request, res: Response): Promise<void> {
    try {
      const { id_usuario } = req.params;
      const tenantId = req.tenantId;
      
      if (!tenantId) {
        res.status(400).json({ message: 'Tenant ID is required' });
        return;
      }

      const relacionamentos = await this.service.updateRelacionamentos({
        id_usuario: Number(id_usuario),
        relacionamentos: req.body.relacionamentos || [],
      }, tenantId);
      res.json(relacionamentos);
    } catch (error) {
      logError('Failed to update usuario_perfil_cliente relationships', error, {
        usuarioId: req.params.id_usuario,
      });
      res.status(500).json({ message: 'Erro ao atualizar relacionamentos do usuário' });
    }
  }

  async getRelacionamentosByCliente(req: Request, res: Response): Promise<void> {
    try {
      const { id_cliente } = req.params;
      const relacionamentos = await this.service.getRelacionamentosByCliente(Number(id_cliente));
      res.json(relacionamentos);
    } catch (error) {
      logError('Failed to get usuario_perfil_cliente relationships by cliente', error, {
        clienteId: req.params.id_cliente,
      });
      res.status(500).json({ message: 'Erro ao buscar relacionamentos do cliente' });
    }
  }

  async updateRelacionamentosByCliente(req: Request, res: Response): Promise<void> {
    try {
      const { id_cliente } = req.params;
      const tenantId = req.tenantId;
      
      if (!tenantId) {
        res.status(400).json({ message: 'Tenant ID is required' });
        return;
      }

      const relacionamentos = await this.service.updateRelacionamentosByCliente({
        id_cliente: Number(id_cliente),
        relacionamentos: req.body.relacionamentos || [],
      }, tenantId);
      res.json(relacionamentos);
    } catch (error) {
      logError('Failed to update usuario_perfil_cliente relationships by cliente', error, {
        clienteId: req.params.id_cliente,
      });
      res.status(500).json({ message: 'Erro ao atualizar relacionamentos do cliente' });
    }
  }
}

