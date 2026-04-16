import nodemailer from "nodemailer";

let _transporter: nodemailer.Transporter | null = null;

function transporter(): nodemailer.Transporter {
  if (_transporter) return _transporter;
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass || pass === "REPLACE_ME") {
    throw new Error(
      "GMAIL_USER or GMAIL_APP_PASSWORD missing. Tạo App Password tại myaccount.google.com/security và set vào .env.local",
    );
  }
  _transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
  return _transporter;
}

export async function sendMail(opts: {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  fromName?: string;
}): Promise<void> {
  const from = `"${opts.fromName || "Lỗ Vũ PO Manager"}" <${process.env.GMAIL_USER}>`;
  await transporter().sendMail({
    from,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
  });
}
