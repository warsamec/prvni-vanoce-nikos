export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, error: "Method not allowed" });
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const { to, giftTitle, giftLink, token, origin } = body;
    if (!to || !giftTitle || !token || !origin) {
      return json(400, { ok: false, error: "Missing fields" });
    }

    const siteUrl = process.env.SITE_URL || origin;
    const confirmLink = `${siteUrl}#confirm=${encodeURIComponent(token)}`;
    const sender =
      process.env.SENDER_EMAIL ||
      "Nikoskův seznam <potvrzeni@prvni-vanoce-nikos.varsamis.cz>";

    const html = `
      <div style="font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; background: #f9fafb; padding: 28px;">
        <div style="max-width: 560px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 6px 18px rgba(0,0,0,.08);">
          <div style="background: linear-gradient(90deg, #7c3aed, #22d3ee); color: white; padding: 20px 24px; font-size: 20px; font-weight: 600;">
            🎄 Nikoskův vánoční dárek
          </div>

          <div style="padding: 24px 28px; color: #1e293b; line-height: 1.6;">
            <p>Milý dárce,</p>
            <p>maminka a tatínek Nikoska vám <strong>ze srdce děkují 💙</strong>, že chcete našeho malého obdarovat.</p>

            <p>Vybrali jste dárek: <strong>${giftTitle}</strong>.</p>

            <p style="margin-top: 22px; font-weight: 600; color: #0f172a; font-size: 17px; text-align: center;">
              👉 Potvrďte prosím svůj dárek kliknutím sem:
            </p>

            <p style="text-align: center; margin-top: 10px; margin-bottom: 26px;">
              <a href="${confirmLink}" target="_blank"
                 style="background: #7c3aed; color: white; text-decoration: none; padding: 12px 24px; border-radius: 999px; display: inline-block; font-weight: 600;">
                 Potvrdit rezervaci 🎁
              </a>
            </p>

            ${
              giftLink
                ? `<p style="text-align:center;margin-bottom:0;">
                    <a href="${giftLink}" target="_blank"
                       style="color:#2563eb;text-decoration:none;font-size:15px;">
                       🔗 Otevřít odkaz na e-shop
                    </a>
                   </p>`
                : ""
            }

            <p style="margin-top: 30px; font-size: 13px; color: #64748b;">
              Tento e-mail byl odeslán automaticky z Nikoskova vánočního seznamu přání 🎅<br>
              Po potvrzení odkazu bude dárek označen jako rezervovaný, aby se neopakoval.
            </p>
          </div>
        </div>
      </div>
    `;

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: sender,
        to,
        subject: "Nikoskův vánoční dárek 🎄",
        html,
      }),
    });

    if (!resp.ok) {
      const err = await resp.text().catch(() => "");
      return json(500, { ok: false, error: `Resend API error: ${err}` });
    }

    return json(200, { ok: true });
  } catch (e) {
    return json(500, { ok: false, error: String(e) });
  }
}

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(obj),
  };
}
