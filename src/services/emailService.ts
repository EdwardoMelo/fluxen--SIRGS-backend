import nodemailer from 'nodemailer';
import { logError } from '../utils/logger';

interface EmailConfig {
  host: string;
  port: number;
  secure: boolean; // true para 465, false para outras portas
  auth: {
    user: string;
    pass: string;
  };
}

interface SendEmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
  attachments?: Array<{
    filename: string;
    path?: string;
    content?: Buffer;
    contentType?: string;
  }>;
}

class EmailService {
  private transporter: nodemailer.Transporter | null = null;
  private fromEmail: string;

  constructor() {
    this.fromEmail = process.env.EMAIL_FROM || 'no-reply@fluxen.com.br';
  }

  /**
   * Inicializa o transporter do nodemailer
   */
  async initialize(): Promise<void> {
    try {
      const config: EmailConfig = {
        host: process.env.EMAIL_HOST || '',
        port: parseInt(process.env.EMAIL_PORT || '587'),
        secure: process.env.EMAIL_SECURE === 'true', // true para porta 465, false para outras
        auth: {
          user: process.env.EMAIL_USER || '',
          pass: process.env.EMAIL_PASSWORD || '',
        },
      };

      // Validar configurações obrigatórias
      if (!config.host || !config.auth.user || !config.auth.pass) {
        throw new Error('Email configuration is incomplete. Please check EMAIL_HOST, EMAIL_USER, and EMAIL_PASSWORD environment variables.');
      }

      this.transporter = nodemailer.createTransport(config);

      // Verificar conexão
      await this.transporter.verify();
    } catch (error) {
      logError('Failed to initialize email service', error);
      throw error;
    }
  }

  /**
   * Envia um email
   */
  async sendEmail(options: SendEmailOptions): Promise<void> {
    if (!this.transporter) {
      await this.initialize();
    }

    if (!this.transporter) {
      throw new Error('Email transporter not initialized');
    }

    try {
      const mailOptions = {
        from: this.fromEmail,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
        replyTo: options.replyTo,
        attachments: options.attachments,
      };

      await this.transporter.sendMail(mailOptions);
    } catch (error) {
      logError('Failed to send email', error, {
        to: options.to,
        subject: options.subject,
      });
      throw error;
    }
  }

  /**
   * Envia relatório por email
   */
  async sendReportEmail(
    to: string,
    equipamentoNome: string,
    startDate: Date,
    endDate: Date,
    format: 'xlsx' | 'pdf',
    fileBuffer: Buffer
  ): Promise<void> {
    const formatName = format.toUpperCase();
    const fileName = `relatorio_${equipamentoNome.replace(/\s+/g, '_')}_${startDate.toISOString().split('T')[0]}_${endDate.toISOString().split('T')[0]}.${format}`;

    const subject = `Relatório de Logs - ${equipamentoNome}`;
    const html = `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #2c3e50;">Relatório de Logs de Equipamento</h2>
            <p>Olá,</p>
            <p>Seu relatório de logs foi gerado com sucesso.</p>
            <div style="background-color: #f4f4f4; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <p><strong>Equipamento:</strong> ${equipamentoNome}</p>
              <p><strong>Período:</strong> ${startDate.toLocaleDateString('pt-BR')} até ${endDate.toLocaleDateString('pt-BR')}</p>
              <p><strong>Formato:</strong> ${formatName}</p>
            </div>
            <p>O arquivo está anexado a este email.</p>
            <p style="margin-top: 30px; color: #7f8c8d; font-size: 12px;">
              Este é um email automático, por favor não responda.
            </p>
          </div>
        </body>
      </html>
    `;

    const text = `
Relatório de Logs de Equipamento

Equipamento: ${equipamentoNome}
Período: ${startDate.toLocaleDateString('pt-BR')} até ${endDate.toLocaleDateString('pt-BR')}
Formato: ${formatName}

O arquivo está anexado a este email.
    `;

    await this.sendEmail({
      to,
      subject,
      text,
      html,
      attachments: [
        {
          filename: fileName,
          content: fileBuffer,
          contentType: format === 'xlsx' 
            ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            : 'application/pdf',
        },
      ],
    });
  }

  /**
   * Verifica se o serviço está configurado
   */
  isConfigured(): boolean {
    return !!(
      process.env.EMAIL_HOST &&
      process.env.EMAIL_USER &&
      process.env.EMAIL_PASSWORD
    );
  }
}

export const emailService = new EmailService();

