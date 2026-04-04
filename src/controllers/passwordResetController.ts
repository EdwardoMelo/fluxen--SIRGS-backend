import { Request, Response } from 'express';
import { PasswordResetService } from '../services/passwordResetService';
import { logError } from '../utils/logger';

export class PasswordResetController {
  private passwordResetService = new PasswordResetService();

  /**
   * POST /api/auth/forgot-password
   * Solicita redefinição de senha
   */
  async requestPasswordReset(req: Request, res: Response) {
    try {
      const { email } = req.body;

      if (!email || typeof email !== 'string') {
        return res.status(400).json({ message: 'Email é obrigatório' });
      }

      // Sempre retorna sucesso para não revelar se o email existe
      await this.passwordResetService.requestPasswordReset(email);

      res.status(200).json({
        message: 'Se o email estiver cadastrado, você receberá um link para redefinir sua senha.',
      });
    } catch (error: any) {
      logError('Failed to request password reset', error);
      res.status(500).json({ message: 'Erro ao processar solicitação de redefinição de senha' });
    }
  }

  /**
   * POST /api/auth/reset-password
   * Redefine a senha usando o token
   */
  async resetPassword(req: Request, res: Response) {
    try {
      const { token, newPassword } = req.body;

      if (!token || typeof token !== 'string') {
        return res.status(400).json({ message: 'Token é obrigatório' });
      }

      if (!newPassword || typeof newPassword !== 'string') {
        return res.status(400).json({ message: 'Nova senha é obrigatória' });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ message: 'A senha deve ter pelo menos 6 caracteres' });
      }

      await this.passwordResetService.resetPassword(token, newPassword);

      res.status(200).json({
        message: 'Senha redefinida com sucesso',
      });
    } catch (error: any) {
      const errorMessage = error.message || 'Erro ao redefinir senha';

      if (errorMessage.includes('Token inválido') || errorMessage.includes('já foi utilizado') || errorMessage.includes('expirado')) {
        return res.status(400).json({ message: errorMessage });
      }

      logError('Failed to reset password', error);
      res.status(500).json({ message: 'Erro ao redefinir senha' });
    }
  }

  /**
   * GET /api/auth/validate-reset-token
   * Valida se um token de redefinição é válido
   */
  async validateToken(req: Request, res: Response) {
    try {
      const { token } = req.query;

      if (!token || typeof token !== 'string') {
        return res.status(400).json({ message: 'Token é obrigatório' });
      }

      const isValid = await this.passwordResetService.validateToken(token);

      if (!isValid) {
        return res.status(400).json({ message: 'Token inválido ou expirado' });
      }

      res.status(200).json({ valid: true });
    } catch (error: any) {
      logError('Failed to validate token', error);
      res.status(500).json({ message: 'Erro ao validar token' });
    }
  }
}

