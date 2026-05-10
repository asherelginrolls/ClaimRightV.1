import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY!)

export async function sendDisputeLetterEmail(
  email: string,
  caseId: string,
  downloadUrl: string,
): Promise<void> {
  await resend.emails.send({
    from: 'ClaimRight <noreply@claimright.in>',
    to: email,
    subject: 'Your Dispute Letter is Ready — ClaimRight',
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#111;">
        <h2 style="color:#0f1f2e;">Your dispute letter is ready.</h2>
        <p>Your ClaimRight dispute letter has been generated. It cites the specific IRDAI regulations and ombudsman precedents relevant to your case.</p>
        <p>
          <a href="${downloadUrl}"
             style="display:inline-block;background:#1f3b2a;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">
            Download Your Dispute Letter
          </a>
        </p>
        <p style="color:#666;font-size:13px;">
          This link expires in 24 hours.
          <a href="https://claimright.in/download/${caseId}" style="color:#1f3b2a;">Log back in to get a fresh link.</a>
        </p>
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
        <h3 style="color:#0f1f2e;">What to do next:</h3>
        <ol style="color:#444;line-height:1.8;">
          <li>
            <strong>Step 1 — GRO:</strong> Email or post the dispute letter to your insurer's
            Grievance Redressal Officer. The insurer must respond within 15 days.
          </li>
          <li>
            <strong>Step 2 — IGMS:</strong> If no satisfactory response in 15 days, file at
            <a href="https://bimabharosa.irdai.gov.in" style="color:#1f3b2a;">bimabharosa.irdai.gov.in</a>
            using the reference number from your insurer's response.
          </li>
          <li>
            <strong>Step 3 — Ombudsman:</strong> If still unresolved, file at
            <a href="https://cioins.co.in" style="color:#1f3b2a;">cioins.co.in</a> — it's free,
            takes 1–3 months, and the resolution rate is 94.5%.
          </li>
        </ol>
        <p style="color:#999;font-size:11px;margin-top:24px;">
          NOT LEGAL ADVICE. NOT A LAW FIRM. This letter is based on IRDAI regulations for guidance only.
        </p>
      </div>
    `,
  })
}
