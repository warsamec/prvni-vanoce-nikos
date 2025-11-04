// /.netlify/functions/send-confirmation.js
// Node 18 runtime on Netlify
import { Resend } from "resend";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  try {
    const { to, giftTitle, giftLink, token, origin } = req.body || {};
    if (!to || !giftTitle || !token || !origin) {
      return res.status(400).json({ ok: false, error: "Missing fields" });
    }
    const apiKey = process.env.RESEND_API_KEY;
    const sender = process.env.SENDER_EMAIL || "Nikoskův seznam <noreply@varsamis.cz>";
    const siteUrl = process.env.SITE_URL || origin;
    const confirmLink = `${siteUrl}#confirm=${encodeURIComponent(token)}`;

    const resend = new Resend(apiKey);
    await resend.emails.send({
      from: sender,
      to,
      subject: "Potvrďte rezervaci dárku pro Nikoska",
      html: `
        <p>Ahoj,</p>
        <p>potvrď prosím rezervaci dárku: <b>${giftTitle}</b>.</p>
        ${giftLink ? `<p>Odkaz na produkt: <a href="${giftLink}">${giftLink}</a></p>` : ""}
        <p><a href="${confirmLink}">Dokončit rezervaci</a></p>
        <p>Díky!</p>
      `,
    });
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: String(e) });
  }
}
