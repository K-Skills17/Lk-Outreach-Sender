import { Resend } from 'resend';

let resend: Resend | null = null;

function getResend(): Resend {
  if (resend) return resend;
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not set');
  resend = new Resend(key);
  return resend;
}

const FROM = process.env.OUTREACH_FROM_EMAIL || 'Outreach <contato@lkdigital.org>';
const REPLY_TO = process.env.OUTREACH_REPLY_TO || 'contato@lkdigital.org';

export async function sendOutreachEmail(to: string, subject: string, body: string): Promise<{ id?: string; error?: unknown }> {
  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: system-ui, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
${body.replace(/\n/g, '<br>\n')}
</body>
</html>`;
  const { data, error } = await getResend().emails.send({
    from: FROM,
    to: [to],
    replyTo: REPLY_TO,
    subject,
    html,
  });
  if (error) return { error };
  return { id: data?.id };
}
