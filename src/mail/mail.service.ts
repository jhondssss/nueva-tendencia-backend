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

  // ══════════════════════════════════════════════════════════════════════════
  // Plantillas reutilizables
  // ══════════════════════════════════════════════════════════════════════════

  private layout(titulo: string, cuerpoHtml: string): string {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <h2>${titulo}</h2>
        ${cuerpoHtml}
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
        <p style="color: #999; font-size: 12px;">Calzados Nueva Tendencia</p>
      </div>
    `;
  }

  private botonHtml(url: string, texto: string): string {
    return `
      <p style="margin: 24px 0;">
        <a href="${url}"
           style="display: inline-block; padding: 12px 24px; background-color: #4F46E5;
                  color: white; text-decoration: none; border-radius: 6px;">
          ${texto}
        </a>
      </p>
    `;
  }

  async sendPasswordResetEmail(to: string, nombre: string, resetUrl: string): Promise<void> {
    const html = this.layout('Recuperación de contraseña', `
      <p>Hola <strong>${nombre}</strong>,</p>
      <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta.</p>
      ${this.botonHtml(resetUrl, 'Restablecer contraseña')}
      <p style="color: #666; font-size: 14px;">Este enlace expira en <strong>1 hora</strong>.</p>
      <p style="color: #666; font-size: 14px;">Si no solicitaste este cambio, puedes ignorar este mensaje.</p>
    `);
    await this.sendMail({ to, subject: 'Recuperación de contraseña — Calzados Nueva Tendencia', html });
  }

  async sendClienteAccessEmail(to: string, nombre: string, tempPassword: string, loginUrl: string): Promise<void> {
    const html = this.layout('Bienvenido a Nueva Tendencia', `
      <p>Hola <strong>${nombre}</strong>,</p>
      <p>Se habilitó tu acceso para consultar tus pedidos en línea.</p>
      <p>Tu contraseña temporal es:</p>
      <p style="margin: 24px 0; font-size: 18px; font-weight: bold; letter-spacing: 1px;">${tempPassword}</p>
      ${this.botonHtml(loginUrl, 'Iniciar sesión')}
      <p style="color: #666; font-size: 14px;">Por seguridad, te pediremos que cambies esta contraseña la primera vez que inicies sesión.</p>
    `);
    await this.sendMail({ to, subject: 'Acceso a tu cuenta — Calzados Nueva Tendencia', html });
  }

  async sendSolicitudAprobadaEmail(
    to: string,
    params: { nombreCliente: string; idSolicitud: number; idPedido: number; nombreProducto: string; fechaEntrega: string },
  ): Promise<void> {
    const { nombreCliente, idSolicitud, idPedido, nombreProducto, fechaEntrega } = params;
    const html = this.layout('¡Tu solicitud fue aprobada!', `
      <p>Hola <strong>${nombreCliente}</strong>,</p>
      <p>Tu solicitud de pedido #${idSolicitud} fue aprobada y ya generamos tu pedido #${idPedido}.</p>
      <p>Producto: <strong>${nombreProducto}</strong></p>
      <p>Fecha de entrega estimada: <strong>${fechaEntrega}</strong></p>
      ${this.botonHtml('https://nueva-tendencia-frontend.vercel.app/login', 'Ver mi pedido')}
    `);
    await this.sendMail({ to, subject: 'Tu solicitud de pedido fue aprobada — Calzados Nueva Tendencia', html });
  }

  async sendSolicitudRechazadaEmail(to: string, nombreCliente: string, idSolicitud: number, motivo: string): Promise<void> {
    const html = this.layout('Tu solicitud fue rechazada', `
      <p>Hola <strong>${nombreCliente}</strong>,</p>
      <p>Lamentablemente tu solicitud de pedido #${idSolicitud} fue rechazada.</p>
      <p>Motivo: <strong>${motivo}</strong></p>
      <p>Si tenés dudas, podés contactarnos para más información.</p>
    `);
    await this.sendMail({ to, subject: 'Tu solicitud de pedido fue rechazada — Calzados Nueva Tendencia', html });
  }
}
