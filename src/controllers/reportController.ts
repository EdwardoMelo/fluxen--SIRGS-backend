import { Request, Response } from 'express';
import { rabbitMQService } from '../services/rabbitmqService';
import { logError, logWarn } from '../utils/logger';
import { hasEquipamentoPermission } from '../utils/equipamentoPermissionHelper';
import { prisma } from '../database';

export class ReportController {
  async requestReport(req: Request, res: Response): Promise<void> {
    try {
      const { id_equipamento } = req.params;
      const { startDate, endDate, format, email } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ message: 'Usuário não autenticado' });
        return;
      }

      // Validar parâmetros
      if (!startDate || !endDate || !format) {
        res.status(400).json({ 
          message: 'startDate, endDate e format são obrigatórios' 
        });
        return;
      }

      if (!['xlsx', 'pdf'].includes(format)) {
        res.status(400).json({ 
          message: 'Formato deve ser "xlsx" ou "pdf"' 
        });
        return;
      }

      // Validar datas
      const start = new Date(startDate);
      const end = new Date(endDate);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        res.status(400).json({ message: 'Datas inválidas' });
        return;
      }

      if (start > end) {
        res.status(400).json({ message: 'Data inicial deve ser anterior à data final' });
        return;
      }

      // Validar intervalo máximo (30 dias)
      const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      if (daysDiff > 30) {
        res.status(400).json({ 
          message: 'Intervalo máximo permitido é de 30 dias' 
        });
        return;
      }

      // Verificar permissão
      const hasPermission = await hasEquipamentoPermission(userId, Number(id_equipamento));
      if (!hasPermission) {
        res.status(403).json({ 
          message: 'Você não tem permissão para gerar relatório deste equipamento' 
        });
        return;
      }

      // Buscar email do usuário se não fornecido
      let recipientEmail = email;
      if (!recipientEmail) {
        const usuario = await prisma.usuario.findUnique({
          where: { id: userId },
          select: { email: true }
        });
        recipientEmail = usuario?.email || null;
      }

      if (!recipientEmail) {
        res.status(400).json({ 
          message: 'Email é obrigatório. Forneça um email ou certifique-se de ter um email cadastrado.' 
        });
        return;
      }

      // Enviar requisição para a fila
      try {
        const sentToQueue = await rabbitMQService.publishReportRequest({
          id_equipamento: Number(id_equipamento),
          userId,
          startDate: start.toISOString(),
          endDate: end.toISOString(),
          format,
          email: recipientEmail,
        });

        if (sentToQueue) {
          res.json({
            message: 'Relatório em processamento. Você receberá por email quando estiver pronto.',
            estimatedTime: Math.ceil(daysDiff * 0.5), // Estimativa em minutos
          });
        } else {
          logWarn('Failed to send report request to queue - queue buffer full');
          res.status(503).json({ 
            message: 'Sistema ocupado. Tente novamente em alguns instantes.' 
          });
        }
      } catch (error) {
        logError('Failed to send report request to RabbitMQ', error);
        res.status(500).json({ 
          message: 'Erro ao processar requisição de relatório' 
        });
      }
    } catch (error) {
      logError('Failed to request report', error);
      res.status(500).json({ message: 'Erro ao solicitar relatório' });
    }
  }
}

