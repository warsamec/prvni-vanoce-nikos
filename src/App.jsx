import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

/* === Konfigurace / konstanty === */
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
const ADMIN_PIN = (import.meta.env && import.meta.env.VITE_ADMIN_PIN) || "nikos2025";
const SITE_HAS_SUPABASE = !!(SUPABASE_URL && SUPABASE_ANON_KEY);
const TABLE = "gifts_registry";

/* Výchozí data (pouze pro lokální verzi) */
const DEFAULT_GIFTS = [
  {
    id: "duplo-zviratka",
    title: "LEGO® DUPLO Zvířátka",
    link: "https://www.lego.com/",
    image:
      "https://images.unsplash.com/photo-1601758064138-4c3d2a9d6d3e?q=80&w=1200",
    priceCZK: 899,
    note: "Ideálně se zvířátky na farmě. Vhodné od 18 měsíců.",
  },
  {
    id: "knizka-kontrasty",
    title: "Kontrastní leporelo (černá–bílá)",
    link: "https://www.knihydobrovsky.cz/",
    image:
      "https://images.unsplash.com/photo-1481627834876-b7833e8f5570?q=80&w=1200",
    priceCZK: 249,
    note: "Tvrdé stránky, odolné vůči dětským ručičkám.",
  },
  {
    id: "zimni-overal",
    title: "Zimní overal (vel. 86)",
    link: "https://www.zoot.cz/",
    image:
      "https://images.unsplash.com/photo-1543466835-00a7907e9de1?q=80&w=1200",
    priceCZK: 1190,
    note: "Neutrální barva, snadné oblékání.",
  },
];

/* Pomocné utility */
const currency = (n) =>
  typeof n === "number"
    ? n.toLocaleString("cs-CZ", { style: "currency", currency: "CZK" })
    : "";
const maskEmail = (email = "") => {
  const [u, d] = String(email).split("@");
  if (!u || !d) return "(neznámý e-mail)";
  const m = u.length <= 2 ? "**" : u[0] + "***" + u.slice(-1);
  return `${m}@${d}`;
};
const genToken = () => crypto.getRandomValues(new Uint32Array(4)).join("");

/* Datastore (Supabase / LocalStorage) */
function useDataStore() {
  async function listGifts() {
    if (SITE_HAS_SUPABASE) {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?select=*`, {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
      });
      if (!res.ok) throw new Error("Supabase listGifts selhal");
      return await res.json();
    }
    const raw = localStorage.getItem("nikos-gifts");
    if (!raw) {
      localStorage.setItem("nikos-gifts", JSON.stringify(DEFAULT_GIFTS));
      return DEFAULT_GIFTS;
    }
    return JSON.parse(raw);
  }

async function upsertGift(gift) {
  if (!SITE_HAS_SUPABASE) {
    const gifts = await listGifts();
    const i = gifts.findIndex((g) => g.id === gift.id);
    if (i === -1) gifts.push(gift);
    else gifts[i] = gift;
    localStorage.setItem("nikos-gifts", JSON.stringify(gifts));
    return gift;
  }

  // ❗ Odfiltrujeme generated columns, které nejdou zapisovat
  const {
    reservation_status,
    status_icon,
    is_reserved,
    reservation_email,
    ...cleanGift
  } = gift || {};

  const baseHeaders = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };

  // Zjistíme, zda záznam existuje
  const check = await fetch(
    `${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(cleanGift.id)}&select=id`,
    { headers: baseHeaders }
  );
  if (!check.ok) throw new Error(await check.text());
  const rows = await check.json();

  if (rows.length) {
    // PATCH existujícího záznamu – POZOR: neposíláme generated columns
    const { id, ...rest } = cleanGift;
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(id)}`,
      { method: "PATCH", headers: baseHeaders, body: JSON.stringify(rest) }
    );
    if (!(res.ok || res.status === 204)) throw new Error(await res.text());
    return gift;
  } else {
    // POST nového záznamu – opět bez generated columns
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}`, {
      method: "POST",
      headers: baseHeaders,
      body: JSON.stringify([cleanGift]),
    });
    if (!res.ok) throw new Error(await res.text());
    return gift;
  }
}


  async function removeGift(id) {
    if (!SITE_HAS_SUPABASE) {
      const gifts = await listGifts();
      localStorage.setItem(
        "nikos-gifts",
        JSON.stringify(gifts.filter((g) => g.id !== id))
      );
      return;
    }
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(id)}`,
      {
        method: "DELETE",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
      }
    );
    if (!res.ok) throw new Error(await res.text());
  }

  async function createPendingReservation(id, email, token) {
    const gifts = await listGifts();
    const g = gifts.find((x) => x.id === id);
    if (!g) throw new Error("Dárek nenalezen");
    if (g.reservation?.status === "confirmed")
      throw new Error("Dárek je již potvrzeně zarezervován");
    return await upsertGift({
      ...g,
      reservation: { status: "pending", email, token, at: new Date().toISOString() },
    });
  }

  async function confirmReservationByToken(token) {
    const items = await listGifts();
    const g = items.find(
      (x) => x.reservation?.token === token && x.reservation?.status === "pending"
    );
    if (!g) throw new Error("Neplatný nebo již použitý odkaz");
    return await upsertGift({
      ...g,
      reservation: { ...g.reservation, status: "confirmed", at: new Date().toISOString() },
    });
  }

  async function unreserveGift(id) {
    const items = await listGifts();
    const g = items.find((x) => x.id === id);
    if (!g) throw new Error("Dárek nenalezen");
    return await upsertGift({ ...g, reservation: null });
  }

  return {
    listGifts,
    upsertGift,
    removeGift,
    createPendingReservation,
    confirmReservationByToken,
    unreserveGift,
  };
}

function ModalPortal({ children }) {
  const elRef = useRef(null);
  if (!elRef.current) {
    elRef.current = document.createElement("div");
  }
  useEffect(() => {
    const el = elRef.current;
    document.body.appendChild(el);
    return () => {
      document.body.removeChild(el);
    };
  }, []);
  return createPortal(children, elRef.current);
}

export default function App() {
  const store = useDataStore();

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState("");
  const [admin, setAdmin] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const adminWrapRef = useRef(null);
  useEffect(() => {
    function onDocClick(e) {
      if (adminWrapRef.current && !adminWrapRef.current.contains(e.target)) {
        setAdminMenuOpen(false);
      }
    }
    function onEsc(e) {
      if (e.key === "Escape") setAdminMenuOpen(false);
    }
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);

  const [reserveModal, setReserveModal] = useState({ open: false, giftId: "" });
  const [email, setEmail] = useState("");
  const [info, setInfo] = useState("");
  const [reserveNotice, setReserveNotice] = useState("");
  const [reserveSending, setReserveSending] = useState(false);

  // --- Stabilní pořadí jen po dobu návštěvy (reset při reloadu) ---
  const [orderMap, setOrderMap] = useState({});
  const orderInitRef = useRef(false);

  useEffect(() => {
    (async () => {
      const data = await store.listGifts();
      setItems(data);
      setLoading(false);
    })();
  }, []);

  // Inicializace náhodného pořadí POUZE jednou po prvním načtení položek
  useEffect(() => {
    if (orderInitRef.current) return;
    if (!items.length) return;
    const map = {};
    for (const g of items) {
      map[g.id] = crypto.getRandomValues(new Uint32Array(1))[0];
    }
    setOrderMap(map);
    orderInitRef.current = true;
  }, [items]);

  // Pokud přibydou nové položky po inicializaci, přiřaď jim nové klíče,
  // ale existující položky NEMĚŇ (stálé pořadí v rámci návštěvy).
  useEffect(() => {
    if (!orderInitRef.current || !items.length) return;
    const next = { ...orderMap };
    let changed = false;
    for (const g of items) {
      if (next[g.id] == null) {
        next[g.id] = crypto.getRandomValues(new Uint32Array(1))[0];
        changed = true;
      }
    }
    if (changed) setOrderMap(next);
  }, [items]); // eslint-disable-line react-hooks/exhaustive-deps

  // Po potvrzovacím odkazu
  useEffect(() => {
    (async () => {
      const h = location.hash;
      if (h.startsWith("#confirm=")) {
        const t = decodeURIComponent(h.replace("#confirm=", ""));
        try {
          const g = await store.confirmReservationByToken(t);
          setInfo(`Rezervace potvrzena: ${g.title}`);
          setItems(await store.listGifts());
        } catch (e) {
          setInfo(e.message || "Potvrzení se nepodařilo");
        } finally {
          location.hash = "";
          setTimeout(() => setInfo(""), 5000);
        }
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = !q
      ? items
      : items.filter((g) =>
          [g.title, g.note, g.link]
            .filter(Boolean)
            .some((v) => v.toLowerCase().includes(q))
        );

    // rozdělení na volné vs. rezervované (pending i confirmed bereme jako rezervované)
    const isReserved = (g) =>
      g.reservation &&
      (g.reservation.status === "pending" || g.reservation.status === "confirmed");

    const free = base.filter((g) => !isReserved(g));
    const reserved = base.filter((g) => isReserved(g));

    // Když ještě není připraven orderMap (úplně první moment), aspoň dáme volné nahoru
    if (!Object.keys(orderMap).length) {
      return [...free, ...reserved];
    }

    // Stabilní náhodné pořadí v rámci návštěvy:
    // zvlášť pro volné a zvlášť pro rezervované, pak je slepíme
    const byKey = (a, b) => {
      const ka = orderMap[a.id] ?? 0;
      const kb = orderMap[b.id] ?? 0;
      return ka - kb;
    };

    const sortedFree = [...free].sort(byKey);
    const sortedReserved = [...reserved].sort(byKey);

    return [...sortedFree, ...sortedReserved];
  }, [items, query, orderMap]);


  async function handleReserve() {
    const em = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) {
      setReserveNotice("Zadejte platný e-mail.");
      return;
    }

    setReserveSending(true);
    setReserveNotice("");

    try {
      const token = genToken();
      const gift = await store.createPendingReservation(reserveModal.giftId, em, token);

      // Nezavíráme modal — informujeme přímo uvnitř
      setReserveNotice("Rezervace vytvořena. Zkontrolujte e-mail (i složku SPAM!) a potvrďte odkazem.");

      try {
        const origin = location.origin + location.pathname;
        const r = await fetch("/.netlify/functions/send-confirmation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: em,
            giftTitle: gift.title,
            giftLink: gift.link || "",
            token,
            origin,
          }),
        });
        if (!r.ok) throw new Error(await r.text());
        setReserveNotice(
          "Rezervace vytvořena. Zkontrolujte e-mail (i složku SPAM!) a potvrďte odkazem. E-mail byl odeslán."
        );
      } catch {
        setReserveNotice(
          "Rezervace vytvořena. Zkontrolujte e-mail (i složku SPAM!) a potvrďte odkazem. ⚠️ E-mail se nepodařilo odeslat."
        );
      }
    } catch (e) {
      setReserveNotice(e.message || "Rezervace selhala");
    } finally {
      setReserveSending(false);
      setItems(await store.listGifts()); // karta se přepne do "pending", pořadí zůstává stejné
    }
  }

  async function handleUnreserve(id) {
    try {
      await store.unreserveGift(id);
      setItems(await store.listGifts());
    } catch (e) {
      alert(e.message || e);
    }
  }
  async function handleAddOrEdit(g) {
    try {
      await store.upsertGift(g);
      setItems(await store.listGifts());
      setInfo("Dárek uložen.");
      setTimeout(() => setInfo(""), 2000);
    } catch (e) {
      alert(`Uložení selhalo: ${e?.message || e}`);
    }
  }
  async function handleDelete(id) {
    if (!confirm("Opravdu smazat tento dárek?")) return;
    try {
      await store.removeGift(id);
      setItems(await store.listGifts());
    } catch (e) {
      alert(`Smazání selhalo: ${e?.message || e}`);
    }
  }

  return (
    <>
      {/* Sticky tmavý header */}
      <header
        className="header"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 60,
          backdropFilter: "saturate(180%) blur(8px)",
          background: "rgba(15,23,42,.8)", // tmavé polopropustné
          color: "#fff",
          borderBottom: "1px solid rgba(255,255,255,.08)",
        }}
      >
        <div className="container header-bar header-compact" style={{ position: "relative" }}>
          <h1 className="header-title" style={{ color: "#fff" }}>
            🎁 Vánoční dárky pro Nikoska 🎄
          </h1>
<div id="countdown-wrapper">
  <div class="countdown">
    <div class="countdown-label">⏳ Do štědrovečerní večeře zbývá:</div>
    <div class="countdown-grid">
      <div class="countdown-item">
        <span id="cd-days">0</span>
        <small>dnů</small>
      </div>
      <div class="countdown-item">
        <span id="cd-hours">00</span>
        <small>hodin</small>
      </div>
      <div class="countdown-item">
        <span id="cd-minutes">00</span>
        <small>minut</small>
      </div>
      <div class="countdown-item">
        <span id="cd-seconds">00</span>
        <small>sekund</small>
      </div>
    </div>
  </div>

  <div id="countdown-finished-msg" style="display:none;">
    <h2 class="finished-text">
      🎄 Je čas rozbalovat dárky! <br>
      Nikosek má radost a děkuje 🎁✨
    </h2>
  </div>
</div>
          <div className="admin-button-wrapper" ref={adminWrapRef}>
            {!admin ? (
              <button
                className="admin-button"
                onClick={() => setAdminMenuOpen((v) => !v)}
                aria-expanded={adminMenuOpen}
                title="Admin přihlášení"
                style={{
                  background: "rgba(255,255,255,.06)",
                  border: "1px solid rgba(255,255,255,.18)",
                  color: "#fff",
                }}
              >
                ⚙️
              </button>
            ) : (
              <button
                className="admin-button admin-active"
                onClick={() => setAdmin(false)}
                title="Odhlásit admin"
                style={{
                  background: "rgba(255,255,255,.12)",
                  border: "1px solid rgba(255,255,255,.22)",
                  color: "#fff",
                }}
              >
                ✖
              </button>
            )}

            {adminMenuOpen && !admin && (
              <div
                className="admin-popup"
                style={{
                  background: "rgba(15,23,42,.95)",
                  border: "1px solid rgba(255,255,255,.12)",
                  color: "#fff",
                }}
              >
                <label htmlFor="pin" className="block text-xs mb-1" style={{ color: "rgba(255,255,255,.75)" }}>
                  Zadejte PIN
                </label>
                <input
                  id="pin"
                  type="password"
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 mb-2 text-sm"
                  style={{
                    border: "1px solid rgba(255,255,255,.2)",
                    background: "rgba(2,6,23,.6)",
                    color: "#fff",
                  }}
                />
                <button
                  onClick={() => {
                    if (pinInput === ADMIN_PIN) {
                      setAdmin(true);
                      setAdminMenuOpen(false);
                    }
                  }}
                  className="w-full rounded-lg text-white py-1.5 text-sm"
                  style={{ background: "rgb(5,150,105)" }}
                >
                  Přihlásit
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="container">
        <div className="toolbar">
          <input
            className="input"
            type="search"
            placeholder="Hledat v dárcích…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          {admin && (
            <div className="row" style={{ marginLeft: "auto" }}>
              <button className="btn ghost" onClick={() => setAdmin(false)}>
                Odhlásit admin
              </button>
              <GiftEditor onSubmit={handleAddOrEdit} />
            </div>
          )}
        </div>

        {info && (
          <div
            className="pill"
            style={{
              display: "inline-block",
              marginBottom: 12,
              background: "rgba(124,58,237,.15)",
              borderColor: "rgba(124,58,237,.35)",
              color: "#e9d5ff",
            }}
          >
            {info}
          </div>
        )}

        {loading ? (
          <div style={{ padding: "48px 0", textAlign: "center", color: "var(--muted)" }}>
            Načítám dárky…
          </div>
        ) : (
          <div className="grid">
            {filtered.map((g) => (
              <GiftCard
                key={g.id}
                gift={g}
                admin={admin}
                onReserve={() => setReserveModal({ open: true, giftId: g.id })}
                onUnreserve={() => handleUnreserve(g.id)}
                onDelete={() => handleDelete(g.id)}
                onEdit={(gift) => handleAddOrEdit(gift)}
              />
            ))}
          </div>
        )}
      </main>

      {/* Modal rezervace – v portálu */}
      {reserveModal.open && (
        <ModalPortal>
          <div
            className="modal"
            onClick={(e) => {
              if (e.target === e.currentTarget) setReserveModal({ open: false, giftId: "" });
            }}
            style={{ zIndex: 1000 }}
          >
            <div className="modal-card">
              {!reserveNotice ? (
                <>
                  <h3>Potvrdit rezervaci</h3>
                  <p style={{ color: "var(--muted)" }}>
                    Zadejte prosím svůj e-mail. Pošleme potvrzovací odkaz; po jeho otevření bude dárek uzamčen.
                  </p>
                  <input
                    className="input"
                    type="email"
                    placeholder="vas@email.cz"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={reserveSending}
                  />
                  <div className="row" style={{ justifyContent: "flex-end", marginTop: 10 }}>
                    <button
                      className="btn secondary"
                      onClick={() => setReserveModal({ open: false, giftId: "" })}
                      disabled={reserveSending}
                    >
                      Zrušit
                    </button>
                    <button className="btn" onClick={handleReserve} disabled={reserveSending}>
                      {reserveSending ? "Odesílám…" : "Poslat potvrzení"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h3>Hotovo ✅</h3>
                  <p style={{ color: "var(--muted)" }}>{reserveNotice}</p>
                  <div className="row" style={{ justifyContent: "flex-end", marginTop: 10 }}>
                    <button
                      className="btn"
                      onClick={() => {
                        setReserveModal({ open: false, giftId: "" });
                        setEmail("");
                        setReserveNotice("");
                      }}
                    >
                      Zavřít
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </ModalPortal>
      )}

      <footer className="footer">
        <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 8 }}>
          {SITE_HAS_SUPABASE
            ? "Online sdílená verze (Supabase připojeno)"
            : "Lokální verze (nastavte Supabase)"}
        </div>
        {new Date().getFullYear()} • Nikoskův vánoční seznam
      </footer>
    </>
  );
}

function GiftCard({ gift, admin, onReserve, onUnreserve, onDelete, onEdit }) {
  const status = gift.reservation?.status || null;
  const confirmed = status === "confirmed";
  const pending = status === "pending";
  return (
    <div className="card" style={{ opacity: confirmed ? 0.25 : 1 }}>
      {gift.image && (
        <div className="media">
          <img src={gift.image} alt="" />
        </div>
      )}
      <div className="body">
        <div className="row" style={{ alignItems: "flex-start" }}>
          <h3 style={{ margin: "0 0 2px 0" }}>{gift.title}</h3>
          {confirmed && <span className="badge ok">Zarezervováno</span>}
          {pending && <span className="badge pending">Čeká na potvrzení</span>}
        </div>
        {typeof gift.priceCZK === "number" && (
          <div className="price">{currency(gift.priceCZK)}</div>
        )}
        {gift.note && <div className="note">{gift.note}</div>}
<div className="row hr">
  {!confirmed ? (
    <>
      <button
        className={"btn ok"}
        onClick={onReserve}
        disabled={pending}
        style={{
          fontWeight: 600,
          paddingInline: 18,
          opacity: pending ? 0.9 : 1,
          cursor: pending ? "not-allowed" : "pointer",
        }}
      >
        {pending ? "Odeslán e-mail…" : "Zarezervovat"}
      </button>

      {gift.link && (
        <a
          className="btn ghost"
          href={gift.link}
          target="_blank"
          style={{ marginLeft: "auto" }}
        >
          Náhled dárku
        </a>
      )}
    </>
  ) : (
    <>
      {gift.link && (
        <a
          className="btn ghost"
          href={gift.link}
          target="_blank"
          style={{ marginLeft: "auto" }}
        >
          Náhled dárku
        </a>
      )}
      <div style={{ marginLeft: "12px", fontSize: 12, color: "var(--muted)" }}>
        {gift.reservation?.email && <>pro {maskEmail(gift.reservation.email)}</>}
      </div>
    </>
  )}
</div>


        {admin && (
          <div className="row hr">
            {(pending || confirmed) && (
              <button className="btn ghost" onClick={onUnreserve}>
                Zrušit rezervaci
              </button>
            )}
            <GiftEditor initial={gift} onSubmit={onEdit} small />
            <button className="btn danger" onClick={onDelete} style={{ marginLeft: "auto" }}>
              Smazat
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function GiftEditor({ initial, onSubmit, small }) {
  const [form, setForm] = useState(
    initial || { id: "", title: "", link: "", image: "", priceCZK: "", note: "" }
  );
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setForm(
      initial || { id: "", title: "", link: "", image: "", priceCZK: "", note: "" }
    );
  }, [initial]);

  async function save() {
    if (!form.id || !form.title) {
      alert("Vyplňte minimálně ID a Název");
      return;
    }
    const gift = {
      ...form,
      priceCZK: form.priceCZK === "" ? undefined : Number(form.priceCZK),
    };
    await onSubmit(gift);
    setOpen(false);
  }

  return (
    <>
      <button
        className={`btn ${small ? "ghost" : "secondary"}`}
        onClick={() => setOpen(true)}
      >
        {initial ? "Upravit" : "Přidat dárek"}
      </button>
      {open && (
        <ModalPortal>
          <div
            className="modal"
            onClick={(e) => {
              if (e.target === e.currentTarget) setOpen(false);
            }}
            style={{ zIndex: 1000 }}
          >
            <div className="modal-card" style={{ maxWidth: 700 }}>
              <h3>{initial ? "Upravit dárek" : "Přidat nový dárek"}</h3>
              <div
                className="grid"
                style={{ gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}
              >
                <Field label="ID (unikátní, bez mezer)">
                  <input
                    className="input"
                    value={form.id}
                    onChange={(e) => setForm({ ...form, id: e.target.value })}
                    placeholder="např. duplo-zviratka"
                  />
                </Field>
                <Field label="Název">
                  <input
                    className="input"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="Název dárku"
                  />
                </Field>
                <Field label="Odkaz na produkt (URL)">
                  <input
                    className="input"
                    value={form.link}
                    onChange={(e) => setForm({ ...form, link: e.target.value })}
                    placeholder="https://…"
                  />
                </Field>
                <Field label="Obrázek (URL)">
                  <input
                    className="input"
                    value={form.image}
                    onChange={(e) => setForm({ ...form, image: e.target.value })}
                    placeholder="https://…"
                  />
                </Field>
                <Field label="Orientační cena (Kč)">
                  <input
                    className="input"
                    type="number"
                    value={form.priceCZK}
                    onChange={(e) => setForm({ ...form, priceCZK: e.target.value })}
                    placeholder="např. 999"
                  />
                </Field>
                <Field label="Poznámka">
                  <input
                    className="input"
                    value={form.note}
                    onChange={(e) => setForm({ ...form, note: e.target.value })}
                    placeholder="Velikost, barva, tipy…"
                  />
                </Field>
              </div>
              <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
                <button className="btn secondary" onClick={() => setOpen(false)}>
                  Zavřít
                </button>
                <button className="btn" onClick={save}>
                  Uložit
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </>
  );
}

<script>
(function () {

  // 24. prosinec 2025 17:00
  const target = new Date(2025, 11, 24, 17, 0, 0);

  const elDays = document.getElementById('cd-days');
  const elHours = document.getElementById('cd-hours');
  const elMinutes = document.getElementById('cd-minutes');
  const elSeconds = document.getElementById('cd-seconds');

  const countdownBox = document.querySelector('.countdown');
  const finishedBox  = document.getElementById('countdown-finished-msg');

  function updateCountdown() {
    const now = new Date();
    const diff = target - now;

    if (diff <= 0) {
      // zastavit odpočet + zobrazit zprávu
      countdownBox.style.display = 'none';
      finishedBox.style.display = 'block';
      return;
    }

    const totalSeconds = Math.floor(diff / 1000);
    const days = Math.floor(totalSeconds / (60 * 60 * 24));
    const hours = Math.floor((totalSeconds % (60 * 60 * 24)) / (60 * 60));
    const minutes = Math.floor((totalSeconds % (60 * 60)) / 60);
    const seconds = totalSeconds % 60;

    elDays.textContent = days;
    elHours.textContent = String(hours).padStart(2, '0');
    elMinutes.textContent = String(minutes).padStart(2, '0');
    elSeconds.textContent = String(seconds).padStart(2, '0');
  }

  updateCountdown();
  setInterval(updateCountdown, 1000);

})();
</script>


function Field({ label, children }) {
  return (
    <label style={{ display: "block", fontSize: 14 }}>
      <div style={{ color: "var(--muted)", marginBottom: 6 }}>{label}</div>
      {children}
    </label>
  );
}
