export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const { to, giftTitle, giftLink, token, origin } = req.body || {};
    if (!to || !giftTitle || !token || !origin) {
      return res.status(400).json({ ok: false, error: "Missing fields" });
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
      return res.status(500).json({ ok: false, error: `Resend API error: ${err}` });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("Email error:", e);
    return res.status(500).json({ ok: false, error: String(e) });
  }
}
