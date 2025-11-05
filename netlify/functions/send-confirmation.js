// netlify/functions/send-confirmation.js

// Tento handler přijímá JSON:
// { to: string, giftTitle: string, giftLink?: string, token: string, origin: string }

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM = process.env.RESEND_FROM || "Seznam vánočních dárků <potvrzeni@prvni-vanoce-nikos.varsamis.cz>";
const RESEND_REPLY_TO = process.env.RESEND_REPLY_TO || "";

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return json(405, { error: "Method Not Allowed" });
    }

    if (!RESEND_API_KEY) {
      return json(500, { error: "Missing RESEND_API_KEY" });
    }

    const { to, giftTitle, giftLink = "", token, origin } = safeParse(event.body);

    if (!to || !giftTitle || !token || !origin) {
      return json(400, { error: "Missing required fields (to, giftTitle, token, origin)" });
    }

    const subject = "Nikoskův vánoční dárek 🎄 – potvrďte rezervaci";
    const confirmUrl = `${stripHash(origin)}#confirm=${encodeURIComponent(token)}`;

    const text = [
      "Tatínek a maminka moc děkují, že chcete Nikoska obdarovat.",
      "",
      `Dárek: ${giftTitle}`,
      "",
      "👉 Pro dokončení rezervace prosím klikněte na tento odkaz:",
      confirmUrl,
      "",
      giftLink ? `Odkaz na vybraný produkt: ${giftLink}` : "",
      "",
      "Pokud jste rezervaci nezadali vy, můžete tento e-mail ignorovat.",
      "",
      "Seznam vánočních dárků • prvni-vanoce-nikos.varsamis.cz",
    ].join("\n");

    const html = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;line-height:1.6;color:#0f172a">
        <p>Tatínek a maminka moc děkují, že chcete Nikoska obdarovat.</p>
        <p><strong>Dárek:</strong> ${escapeHtml(giftTitle)}</p>
        <p style="margin:20px 0">
          <a href="${confirmUrl}" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px">
            Potvrdit rezervaci
          </a>
        </p>
        ${giftLink ? `<p>Pro informaci: <a href="${escapeAttr(giftLink)}">odkaz na vybraný produkt</a></p>` : ""}
        <p style="font-size:12px;color:#64748b;margin-top:24px">
          Pokud jste rezervaci nezadali vy, tento e-mail ignorujte.
        </p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0" />
        <p style="font-size:12px;color:#64748b">Seznam vánočních dárků • prvni-vanoce-nikos.varsamis.cz</p>
      </div>
    `;

    const payload = {
      from: RESEND_FROM,
      to: [to],
      subject,
      html,
      text,
      ...(RESEND_REPLY_TO ? { reply_to: RESEND_REPLY_TO } : {}),
      // Volitelně: headers pro některé filtry (není nutné)
      // headers: { "List-Unsubscribe": `<${confirmUrl}>` },
    };

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!r.ok) {
      const errTxt = await r.text().catch(() => "");
      return json(r.status, { error: "Resend send failed", details: errTxt });
    }

    const data = await r.json();
    return json(200, { ok: true, id: data.id || null });
  } catch (e) {
    return json(500, { error: "Unhandled error", details: String(e && e.message || e) });
  }
};

/* ---------- Helpers ---------- */

function json(status, body) {
  return {
    statusCode: status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

function safeParse(s) {
  try {
    return JSON.parse(s || "{}");
  } catch {
    return {};
  }
}

function stripHash(url) {
  try {
    const u = new URL(url, "http://dummy");
    // Pokud origin už obsahuje hash (neměl by), odstraníme jej:
    return (u.origin === "null" ? "" : `${u.pathname}`) // fallback, když by přišel jen path
      ? `${url.split("#")[0]}`
      : url.split("#")[0];
  } catch {
    return String(url || "").split("#")[0];
  }
}

function escapeHtml(s = "") {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s = "") {
  // Konzervativní escapování do HTML atributu href
  return escapeHtml(s).replace(/"/g, "&quot;");
}
