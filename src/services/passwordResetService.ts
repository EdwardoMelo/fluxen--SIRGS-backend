import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { prisma } from '../database';
import { PasswordResetTokenRepository } from '../repositories/passwordResetTokenRepository';
import { PasswordResetAuditRepository } from '../repositories/passwordResetAuditRepository';
import { UsuarioRepository } from '../repositories/usuarioRepository';
import { emailService } from './emailService';
import { logError } from '../utils/logger';

export class PasswordResetService {
  private tokenRepository = new PasswordResetTokenRepository();
  private auditRepository = new PasswordResetAuditRepository();
  private usuarioRepository = new UsuarioRepository();

  /**
   * Gera um token seguro para redefinição de senha
   */
  private generateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Solicita redefinição de senha - envia email com link
   */
  async requestPasswordReset(email: string): Promise<void> {
    try {
      // Buscar usuário por email
      const usuario = await this.usuarioRepository.findByEmail(email);

      if (!usuario) {
        // Não revelar se o usuário existe ou não por segurança
        return;
      }

      // Gerar token
      const token = this.generateToken();
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 1); // Token válido por 1 hora

      // Salvar token no banco
      await this.tokenRepository.create({
        id_usuario: usuario.id,
        token,
        expires_at: expiresAt,
      });

      // Construir URL de redefinição
      const frontendUrl = process.env.FRONTEND_URL;
      const resetUrl = `${frontendUrl}/reset-password?token=${token}`;

      // Enviar email
      const emailSubject = 'Redefinição de Senha - FLUXEN';
      const emailHtml = `
        <html>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
              <h2 style="color: #2c3e50;">Redefinição de Senha</h2>
              <p>Olá ${usuario.nome},</p>
              <p>Você solicitou a redefinição de senha da sua conta.</p>
              <p>Clique no link abaixo para redefinir sua senha:</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${resetUrl}" 
                   style="background-color: #3498db; color: white; padding: 12px 24px; 
                          text-decoration: none; border-radius: 5px; display: inline-block;">
                  Redefinir Senha
                </a>
              </div>
              <p>Ou copie e cole o link abaixo no seu navegador:</p>
              <p style="word-break: break-all; color: #7f8c8d; font-size: 12px;">${resetUrl}</p>
              <p><strong>Este link expira em 1 hora.</strong></p>
              <p>Se você não solicitou esta redefinição, ignore este email.</p>
              <p style="margin-top: 30px; color: #7f8c8d; font-size: 12px;">
                Este é um email automático, por favor não responda.
              </p>
            </div>
          </body>
        </html>
      `;

      const emailText = `
Redefinição de Senha

Olá ${usuario.nome},

Você solicitou a redefinição de senha da sua conta.

Clique no link abaixo para redefinir sua senha:
${resetUrl}

Este link expira em 1 hora.

Se você não solicitou esta redefinição, ignore este email.
      `;

      await emailService.sendEmail({
        to: email,
        subject: emailSubject,
        text: emailText,
        html: emailHtml,
      });
    } catch (error) {
      logError('Failed to request password reset', error, { email });
      throw error;
    }
  }

  /**
   * Redefine a senha usando o token
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    try {
      // Buscar token
      const resetToken = await this.tokenRepository.findByToken(token);

      if (!resetToken) {
        throw new Error('Token inválido');
      }

      // Verificar se token foi usado
      if (resetToken.used) {
        throw new Error('Token já foi utilizado');
      }

      // Verificar se token expirou
      if (new Date() > resetToken.expires_at) {
        throw new Error('Token expirado');
      }

      // Buscar usuário atual para pegar senha anterior
      const usuario = await this.usuarioRepository.findById(resetToken.id_usuario);
      if (!usuario) {
        throw new Error('Usuário não encontrado');
      }

      const senhaHashAnterior = usuario.senha;

      // Hash da nova senha
      const senhaHashAtual = await bcrypt.hash(newPassword, 10);

      // Atualizar senha e marcar token como usado em uma transação
      await prisma.$transaction(async (tx) => {
        // Atualizar senha
        await tx.usuario.update({
          where: { id: resetToken.id_usuario },
          data: { senha: senhaHashAtual },
        });

        // Marcar token como usado
        await this.tokenRepository.markAsUsed(token, tx);

        // Registrar na auditoria
        await this.auditRepository.create(
          {
            id_usuario: resetToken.id_usuario,
            senha_hash_anterior: senhaHashAnterior,
            senha_hash_atual: senhaHashAtual,
          },
          tx
        );
      });
    } catch (error) {
      logError('Failed to reset password', error, { token });
      throw error;
    }
  }

  /**
   * Valida se um token é válido (sem usar)
   */
  async validateToken(token: string): Promise<boolean> {
    try {
      const resetToken = await this.tokenRepository.findByToken(token);

      if (!resetToken) {
        return false;
      }

      if (resetToken.used) {
        return false;
      }

      if (new Date() > resetToken.expires_at) {
        return false;
      }

      return true;
    } catch (error) {
      logError('Failed to validate token', error, { token });
      return false;
    }
  }
}

