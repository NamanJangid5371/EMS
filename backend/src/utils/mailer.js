import nodemailer from 'nodemailer';
import config from '../config/index.js';

let transporter = null;
let verified = false;
let provider = null;
let fromAddress = config.smtpFrom;
let lastGmailError = '';

function gmailTransports() {
  return [
    nodemailer.createTransport({
      service: 'gmail',
      auth: { user: config.emailUser, pass: config.emailPass },
    }),
    nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: config.emailUser, pass: config.emailPass },
    }),
    nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: { user: config.emailUser, pass: config.emailPass },
    }),
  ];
}

export function isSmtpConfigured() {
  return Boolean(config.emailUser && config.emailPass);
}

async function createEtherealTransporter() {
  const account = await nodemailer.createTestAccount();
  const tx = nodemailer.createTransport({
    host: account.smtp.host,
    port: account.smtp.port,
    secure: account.smtp.secure,
    auth: {
      user: account.user,
      pass: account.pass,
    },
  });
  fromAddress = `Appinop EMS <${account.user}>`;
  return { tx, account };
}

async function connectGmail() {
  lastGmailError = '';
  for (const tx of gmailTransports()) {
    try {
      await tx.verify();
      return tx;
    } catch (err) {
      lastGmailError = err.message;
    }
  }
  throw new Error(lastGmailError || 'Gmail SMTP login failed');
}

async function ensureTransporter() {
  if (transporter && verified) return transporter;

  if (isSmtpConfigured()) {
    try {
      const tx = await connectGmail();
      transporter = tx;
      verified = true;
      provider = 'gmail';
      fromAddress = `Appinop EMS <${config.emailUser}>`;
      console.log(`[mailer] SMTP ready (Gmail) as ${config.emailUser}`);
      return transporter;
    } catch (err) {
      transporter = null;
      verified = false;
      provider = null;
      console.error(`[mailer] Gmail rejected login: ${err.message}`);
      console.error('[mailer] Real Gmail sending is OFF. EMAIL_PASS must be a 16-letter Google App Password, not the account password.');
      return null;
    }
  }

  try {
    const { tx, account } = await createEtherealTransporter();
    await tx.verify();
    transporter = tx;
    verified = true;
    provider = 'ethereal';
    console.log(`[mailer] SMTP ready (Ethereal test inbox) as ${account.user}`);
    return transporter;
  } catch (err) {
    transporter = null;
    verified = false;
    provider = null;
    console.error('[mailer] Could not enable SMTP:', err.message);
    return null;
  }
}

export async function verifySmtpConnection() {
  const tx = await ensureTransporter();
  if (!tx) {
    return {
      ok: false,
      reason: isSmtpConfigured() ? 'smtp_auth_failed' : 'smtp_not_configured',
      message: lastGmailError
        ? `Gmail login failed: ${lastGmailError}`
        : 'Could not start SMTP',
      provider,
    };
  }
  return {
    ok: true,
    reason: 'verified',
    message: provider === 'gmail'
      ? `SMTP ready (Gmail) as ${config.emailUser}`
      : 'SMTP ready (Ethereal test inbox — not real Gmail)',
    provider,
  };
}

export async function sendMail({ to, subject, html, text, replyTo, from }) {
  const recipients = [...new Set((Array.isArray(to) ? to : [to]).filter(Boolean))];
  if (!recipients.length) {
    return { sent: false, reason: 'no_recipients' };
  }

  try {
    const tx = await ensureTransporter();
    if (!tx) {
      return {
        sent: false,
        reason: isSmtpConfigured() ? 'smtp_auth_failed' : 'smtp_not_configured',
        error: lastGmailError,
        to: recipients,
        replyTo: replyTo || null,
      };
    }

    const info = await tx.sendMail({
      from: from || fromAddress,
      to: recipients.join(', '),
      replyTo: replyTo || undefined,
      subject,
      text,
      html,
    });

    const previewUrl = nodemailer.getTestMessageUrl(info) || null;
    if (previewUrl) console.log(`[mailer] Preview email: ${previewUrl}`);
    console.log(`[mailer] Sent via ${provider} to ${recipients.join(', ')} · ${subject}`);

    return {
      sent: true,
      to: recipients,
      replyTo: replyTo || null,
      messageId: info.messageId,
      provider,
      previewUrl,
    };
  } catch (err) {
    console.error('[mailer] Send failed:', err.message);
    const authFailed = /Invalid login|EAUTH|535/i.test(String(err.message) + (err.code || ''));
    return {
      sent: false,
      reason: authFailed ? 'smtp_auth_failed' : 'send_failed',
      error: err.message,
      to: recipients,
    };
  }
}
