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

// Náhodné promíchání pole (Fisher–Yates)
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

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
    const baseHeaders = {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    };
    const check = await fetch(
      `${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(
        gift.id
      )}&select=id`,
      { headers: baseHeaders }
    );
    const rows = await check.json();
    if (rows.length) {
      const { id, ...rest } = gift;
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(id)}`,
        { method: "PATCH", headers: baseHeaders, body: JSON.stringify(rest) }
      );
      if (!(res.ok || res.status === 204)) throw new Error(await res.text());
      return gift;
    } else {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}`, {
        method: "POST",
        headers: baseHeaders,
        body: JSON.stringify([gift]),
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

  useEffect(() => {
    (async () => {
      const data = await store.listGifts();
      setItems(data);
      setLoading(false);
    })();
  }, []);

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
    return shuffle(base);
  }, [items, query]);

  async function handleReserve() {
    const em = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) {
      setInfo("Zadejte platný e-mail");
      return;
    }
    try {
      const token = crypto.getRandomValues(new Uint32Array(4)).join("");
      const gift = await store.createPendingReservation(reserveModal.giftId, em, token);
      setItems(await store.listGifts());
      setReserveModal({ open: false, giftId: "" });
      setEmail("");
      setInfo("Rezervace vytvořena. Zkontrolujte e-mail a potvrďte odkazem.");
      try {
        const origin = location.origin + location.pathname;
        const r = await fetch("/.netlify/functions/send-confirmation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to: em, giftTitle: gift.title, giftLink: gift.link || "", token, origin }),
        });
        if (!r.ok) throw new Error(await r.text());
      } catch {
        setInfo("Odeslání e-mailu se nepodařilo (zkontrolujte Resend konfiguraci).");
      }
      setTimeout(() => setInfo("")
