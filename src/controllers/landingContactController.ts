import type { Request, Response } from 'express';
import { emailService } from '../services/emailService';
import { logError } from '../utils/logger';

const CONTACT_TO = process.env.CONTACT_INBOX_EMAIL || 'contato@fluxen.cloud';

const MAX_LEN = {
  name: 200,
  email: 320,
  company: 200,
  message: 8000,
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export class LandingContactController {
  async submitContact(req: Request, res: Response): Promise<void> {
    try {
      const body = req.body as Record<string, unknown>;
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      const email = typeof body.email === 'string' ? body.email.trim() : '';
      const company = typeof body.company === 'string' ? body.company.trim() : '';
      const message = typeof body.message === 'string' ? body.message.trim() : '';

      if (!name || !email || !message) {
        res.status(400).json({ error: 'Nome, email e mensagem são obrigatórios.' });
        return;
      }
      if (name.length > MAX_LEN.name || email.length > MAX_LEN.email || company.length > MAX_LEN.company || message.length > MAX_LEN.message) {
        res.status(400).json({ error: 'Um ou mais campos excedem o tamanho permitido.' });
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        res.status(400).json({ error: 'Email inválido.' });
        return;
      }

      if (!emailService.isConfigured()) {
        res.status(503).json({ error: 'Envio de email temporariamente indisponível.' });
        return;
      }

      const subject = `[Site Fluxen] Contato — ${name}`;
      const safeName = escapeHtml(name);
      const safeEmail = escapeHtml(email);
      const safeCompany = escapeHtml(company || '—');
      const safeMessage = escapeHtml(message).replace(/\r\n|\r|\n/g, '<br/>');

      const html = `
        <html>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <h2 style="color: #1e3a5f;">Novo contato pela landing</h2>
            <p><strong>Nome:</strong> ${safeName}</p>
            <p><strong>Email:</strong> <a href="mailto:${safeEmail}">${safeEmail}</a></p>
            <p><strong>Empresa:</strong> ${safeCompany}</p>
            <p><strong>Mensagem:</strong></p>
            <div style="background:#f4f6f8;padding:12px;border-radius:8px;">${safeMessage}</div>
          </body>
        </html>
      `;

      const text = [
        'Novo contato pela landing',
        '',
        `Nome: ${name}`,
        `Email: ${email}`,
        `Empresa: ${company || '—'}`,
        '',
        'Mensagem:',
        message,
      ].join('\n');

      await emailService.sendEmail({
        to: CONTACT_TO,
        subject,
        text,
        html,
        replyTo: email,
      });

      res.status(200).json({ success: true });
    } catch (error) {
      logError('Landing contact submit failed', error);
      res.status(500).json({ error: 'Não foi possível enviar sua mensagem. Tente novamente mais tarde.' });
    }
  }
}
