import { Injectable } from "@nestjs/common";
import { createTransport, type Transporter } from "nodemailer";

@Injectable()
export class EmailService {
  private readonly transporter: Transporter | null = null;
  private readonly from: string;

  constructor() {
    const smtpUrl = process.env.SMTP_URL ?? "";
    this.from = process.env.EMAIL_FROM ?? "no-reply@suchewohnung.de";
    if (smtpUrl) {
      this.transporter = createTransport(smtpUrl);
    }
  }

  private async send(to: string, subject: string, text: string, html?: string): Promise<void> {
    if (!this.transporter) {
      console.warn(`[email] SMTP not configured; would send to ${to}: ${subject}`);
      return;
    }
    await this.transporter.sendMail({ from: this.from, to, subject, text, html });
  }

  async sendVerification(email: string, token: string, baseUrl: string): Promise<void> {
    const link = `${baseUrl}/auth/verify-email?token=${token}`;
    await this.send(
      email,
      "Подтвердите ваш email — SucheWohnung",
      `Перейдите по ссылке для подтверждения: ${link}`,
      `<p>Перейдите по <a href="${link}">ссылке</a> для подтверждения email.</p>`,
    );
  }

  async sendPasswordReset(email: string, token: string, baseUrl: string): Promise<void> {
    const link = `${baseUrl}/auth/password/reset?token=${token}`;
    await this.send(
      email,
      "Сброс пароля — SucheWohnung",
      `Перейдите по ссылке для сброса пароля: ${link}`,
      `<p>Перейдите по <a href="${link}">ссылке</a> для сброса пароля.</p>`,
    );
  }
}
