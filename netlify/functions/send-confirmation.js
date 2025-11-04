// Netlify Function (Node 18+) – bez SDK, volá Resend REST API přes fetch

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
      <p>Ahoj,</p>
      <p>Potvrď prosím rezervaci dárku <b>${giftTitle}</b> pro Nikoska.</p>
      ${giftLink ? `<p>🔗 <a href="${giftLink}" target="_blank">Otevřít odkaz na e-shop</a></p>` : ""}
      <p>👉 <a href="${confirmLink}" target="_blank">Dokončit rezervaci</a></p>
      <p>Děkujeme! 💙</p>
      <p><small>Tento e-mail byl odeslán automaticky z Nikoskova seznamu přání.</small></p>
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
        subject: "Potvrďte rezervaci dárku pro Nikoska 🎁",
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
