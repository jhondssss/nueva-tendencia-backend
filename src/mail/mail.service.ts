import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { Resend } from 'resend';

interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend = new Resend(process.env.RESEND_API_KEY);
  private readonly from = 'Nueva Tendencia <onboarding@resend.dev>';

  async sendMail({ to, subject, html }: SendMailOptions): Promise<void> {
    let result: Awaited<ReturnType<typeof this.resend.emails.send>>;
    try {
      result = await this.resend.emails.send({ from: this.from, to, subject, html });
    } catch (err) {
      this.logger.error(`Error al enviar email a ${to}: ${err?.message}`, JSON.stringify(err));
      throw err;
    }

    if (result.error) {
      this.logger.error(`Resend rechazó el envío a ${to}: ${JSON.stringify(result.error)}`);
      throw new InternalServerErrorException(`No se pudo enviar el email: ${result.error.message}`);
    }

    this.logger.log(`Email enviado a ${to}: ${JSON.stringify(result)}`);
  }
}
