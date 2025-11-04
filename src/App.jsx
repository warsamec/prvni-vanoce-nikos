import React, { useEffect, useMemo, useState } from "react";

/** Env (Vite replaces at build-time) */
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
const ADMIN_PIN = (import.meta.env && import.meta.env.VITE_ADMIN_PIN) || "nikos2025";
const SITE_HAS_SUPABASE = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

const TABLE = "gifts_registry";

/** Demo gifts (fallback when no Supabase) */
const DEFAULT_GIFTS = [
  { id: "duplo-zviratka", title: "LEGO® DUPLO Zvířátka", link: "https://www.lego.com/",
    image: "https://images.unsplash.com/photo-1601758064138-4c3d2a9d6d3e?q=80&w=1200", priceCZK: 899,
    note: "Ideálně se zvířátky na farmě. Vhodné od 18 měsíců." },
  { id: "knizka-kontrasty", title: "Kontrastní leporelo (černá–bílá)", link: "https://www.knihydobrovsky.cz/",
    image: "https://images.unsplash.com/photo-1481627834876-b7833e8f5570?q=80&w=1200", priceCZK: 249,
    note: "Tvrdé stránky, odolné vůči dětským ručičkám." },
  { id: "zimni-overal", title: "Zimní overal (vel. 86)", link: "https://www.zoot.cz/",
    image: "https://images.unsplash.com/photo-1543466835-00a7907e9de1?q=80&w=1200", priceCZK: 1190,
    note: "Neutrální barva, snadné oblékání." },
];

const currency = (n) => typeof n === "number" ? n.toLocaleString("cs-CZ",{style:"currency",currency:"CZK"}) : "";
const maskEmail = (email="") => { const [u,d]=String(email).split("@"); if(!u||!d) return "(neznámý e-mail)"; const m = u.length<=2 ? "**" : (u[0]+"***"+u.slice(-1)); return `${m}@${d}`; };
const genToken = () => crypto.getRandomValues(new Uint32Array(4)).join("");

function useDataStore(){
  /** Read list */
  async function listGifts(){
    if(SITE_HAS_SUPABASE){
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?select=*`, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
      });
      if(!res.ok) throw new Error("Supabase listGifts selhal");
      return await res.json();
    }
    const raw = localStorage.getItem("nikos-gifts");
    if(!raw){ localStorage.setItem("nikos-gifts", JSON.stringify(DEFAULT_GIFTS)); return DEFAULT_GIFTS; }
    return JSON.parse(raw);
  }

  /** Create or update one record (PATCH/POST) */
  async function upsertGift(gift){
    if(!SITE_HAS_SUPABASE){
      const gifts = await listGifts();
      const i = gifts.findIndex(g=>g.id===gift.id);
      if(i===-1) gifts.push(gift); else gifts[i]=gift;
      localStorage.setItem("nikos-gifts", JSON.stringify(gifts));
      return gift;
    }
    const baseHeaders = {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation"
    };
    const check = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(gift.id)}&select=id`, { headers: baseHeaders });
    if(!check.ok){ const txt = await check.text().catch(()=> ""); throw new Error(`Supabase select selhal: ${txt}`); }
    const rows = await check.json();
    if(rows.length){
      const { id, ...rest } = gift;
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(id)}`, { method:"PATCH", headers: baseHeaders, body: JSON.stringify(rest) });
      if(!(res.ok || res.status===204)){ const txt=await res.text().catch(()=> ""); throw new Error(`Supabase PATCH selhal: ${txt}`); }
      return gift;
    }else{
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}`, { method:"POST", headers: baseHeaders, body: JSON.stringify([gift]) });
      if(!res.ok){ const txt=await res.text().catch(()=> ""); throw new Error(`Supabase POST selhal: ${txt}`); }
      return gift;
    }
  }

  /** Remove one */
  async function removeGift(id){
    if(!SITE_HAS_SUPABASE){
      const gifts = await listGifts();
      localStorage.setItem("nikos-gifts", JSON.stringify(gifts.filter(g=>g.id!==id)));
      return;
    }
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(id)}`, {
      method:"DELETE", headers:{ apikey: SUPABASE_ANON_KEY, Authorization:`Bearer ${SUPABASE_ANON_KEY}` }
    });
    if(!res.ok){ const txt=await res.text().catch(()=> ""); throw new Error(`Supabase DELETE selhal: ${txt}`); }
  }

  /** Create PENDING reservation */
  async function createPendingReservation(id, email, token){
    const gifts = await listGifts();
    const i = gifts.findIndex(g=>g.id===id);
    if(i===-1) throw new Error("Dárek nenalezen");
    const g = gifts[i];
    if(g.reservation?.status === "confirmed") throw new Error("Dárek je již potvrzeně zarezervován");

    const updated = { ...g, reservation: { status:"pending", email, token, at:new Date().toISOString() } };
    return await upsertGift(updated);
  }

  /** Confirm reservation by token */
  async function confirmReservationByToken(token){
    const items = await listGifts();
    const g = items.find(x => x.reservation?.token === token && x.reservation?.status === "pending");
    if(!g) throw new Error("Neplatný nebo již použitý odkaz");
    const updated = { ...g, reservation: { ...g.reservation, status:"confirmed", at:new Date().toISOString() } };
    return await upsertGift(updated);
  }

  /** Unreserve */
  async function unreserveGift(id){
    const items = await listGifts();
    const g = items.find(x=>x.id===id);
    if(!g) throw new Error("Dárek nenalezen");
    const updated = { ...g, reservation: null };
    return await upsertGift(updated);
  }

  return { listGifts, upsertGift, removeGift, createPendingReservation, confirmReservationByToken, unreserveGift };
}

export default function App(){
  const store = useDataStore();
  const [loading,setLoading]=useState(true);
  const [items,setItems]=useState([]);
  const [query,setQuery]=useState("");
  const [admin,setAdmin]=useState(false);
  const [pin,setPin]=useState("");
  const [reserveModal,setReserveModal]=useState({open:false,giftId:""});
  const [email,setEmail]=useState("");
  const [info,setInfo]=useState("");

  // Handle #confirm=TOKEN
  useEffect(()=>{
    (async()=>{
      const hash = window.location.hash;
      if(hash.startsWith("#confirm=")){
        const token = decodeURIComponent(hash.replace("#confirm=",""));
        try{
          const g = await store.confirmReservationByToken(token);
          setInfo(`Rezervace potvrzena: ${g.title}`);
          setItems(await store.listGifts());
        }catch(e){ setInfo(e.message || "Potvrzení se nepodařilo"); }
        finally{ window.location.hash=""; setTimeout(()=>setInfo(""), 5000); }
      }
    })();
  },[]);

  useEffect(()=>{ (async()=>{ const data=await store.listGifts(); setItems(data); setLoading(false); })(); },[]);

  const filtered = useMemo(()=>{
    const q = query.trim().toLowerCase();
    if(!q) return items;
    return items.filter(g => [g.title,g.note,g.link].filter(Boolean).some(v => v.toLowerCase().includes(q)));
  },[items,query]);

  async function handleReserve(){
    const em = email.trim();
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)){ setInfo("Zadejte platný e-mail"); return; }
    try{
      const token = genToken();
      const gift = await store.createPendingReservation(reserveModal.giftId, em, token);
      setItems(await store.listGifts());
      setReserveModal({open:false,giftId:""});
      setEmail("");
      setInfo("Rezervace vytvořena. Zkontrolujte e-mail a potvrďte odkazem.");
      // Send email via Netlify Function
      try{
        const origin = window.location.origin + window.location.pathname;
        const res = await fetch("/.netlify/functions/send-confirmation", {
          method:"POST", headers:{ "Content-Type":"application/json" },
          body: JSON.stringify({ to: em, giftTitle: gift.title, giftLink: gift.link || "", token, origin })
        });
        if(!res.ok) throw new Error(await res.text());
      }catch(err){ console.error(err); setInfo("Odeslání e-mailu se nepodařilo (zkontrolujte Resend konfiguraci)."); }
      setTimeout(()=>setInfo(""), 7000);
    }catch(e){ setInfo(e.message || "Rezervace selhala"); setTimeout(()=>setInfo(""), 4000); }
  }

  async function handleUnreserve(id){ try{ await store.unreserveGift(id); setItems(await store.listGifts()); }catch(e){ alert(e.message||e); } }
  async function handleAddOrEdit(g){ try{ await store.upsertGift(g); setItems(await store.listGifts()); setInfo("Dárek uložen."); setTimeout(()=>setInfo(""), 2000);}catch(e){ alert(`Uložení selhalo: ${e?.message||e}`); } }
  async function handleDelete(id){ if(!confirm("Opravdu smazat tento dárek?")) return; try{ await store.removeGift(id); setItems(await store.listGifts()); }catch(e){ alert(`Smazání selhalo: ${e?.message||e}`); } }

  return (
    <div>
      <header style={{position:"sticky",top:0,zIndex:10,backdropFilter:"blur(6px)",background:"#ffffffb3",borderBottom:"1px solid #e2e8f0"}}>
        <div style={{maxWidth:960,margin:"0 auto",padding:"16px",display:"flex",gap:12,alignItems:"center"}}>
          <div style={{fontSize:24,fontWeight:700}}>🎁 Seznam dárků pro Nikoska</div>
          <span style={{marginLeft:"auto",fontSize:12,color:"#64748b"}}>
            {SITE_HAS_SUPABASE ? "Online sdílená verze (Supabase připojeno)" : "Lokální verze (pro sdílení nastavte Supabase)"}
          </span>
          <button onClick={()=>navigator.clipboard.writeText(window.location.href)} style={{marginLeft:8,fontSize:12,borderRadius:999,padding:"6px 10px",background:"#0f172a",color:"#fff"}}>Sdílet odkaz</button>
        </div>
      </header>

      <main style={{maxWidth:960,margin:"0 auto",padding:"24px 16px"}}>
        <div style={{display:"flex",gap:12,flexWrap:"wrap",alignItems:"center",marginBottom:16}}>
          <input type="search" placeholder="Hledat v dárcích…" value={query} onChange={(e)=>setQuery(e.target.value)}
            style={{flex:"1 1 280px",borderRadius:12,border:"1px solid #cbd5e1",padding:"8px 12px"}}/>
          <div style={{display:"flex",gap:8,marginLeft:"auto"}}>
            {!admin ? (
              <details style={{position:"relative"}}>
                <summary style={{cursor:"pointer",borderRadius:12,border:"1px solid #cbd5e1",padding:"8px 12px"}}>Admin</summary>
                <div style={{position:"absolute",right:0,marginTop:8,background:"#fff",border:"1px solid #e2e8f0",borderRadius:12,padding:12,width:256,boxShadow:"0 10px 25px rgba(0,0,0,0.1)"}}>
                  <label style={{fontSize:12,color:"#475569"}}>Zadejte PIN</label>
                  <input type="password" value={pin} onChange={(e)=>setPin(e.target.value)}
                    style={{width:"100%",marginTop:6,borderRadius:8,border:"1px solid #cbd5e1",padding:"8px 10px"}}/>
                  <button onClick={()=>setAdmin(pin===ADMIN_PIN)} style={{marginTop:8,width:"100%",borderRadius:10,background:"#059669",color:"#fff",padding:"8px 10px"}}>Přihlásit</button>
                </div>
              </details>
            ) : (
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>setAdmin(false)} style={{borderRadius:12,border:"1px solid #cbd5e1",padding:"8px 12px"}}>Odhlásit admin</button>
                <GiftEditor onSubmit={handleAddOrEdit} />
              </div>
            )}
          </div>
        </div>

        {info && <div style={{marginBottom:16,borderRadius:12,border:"1px solid #e2e8f0",background:"#fff",padding:12,fontSize:14,color:"#334155"}}>{info}</div>}

        {loading ? (
          <div style={{padding:"48px 0",textAlign:"center",color:"#64748b"}}>Načítám dárky…</div>
        ) : (
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:16}}>
            {filtered.map(g => (
              <GiftCard key={g.id} gift={g} admin={admin}
                onReserve={()=>setReserveModal({open:true,giftId:g.id})}
                onUnreserve={()=>handleUnreserve(g.id)}
                onDelete={()=>handleDelete(g.id)}
                onEdit={(gift)=>handleAddOrEdit(gift)} />
            ))}
          </div>
        )}
      </main>

      {reserveModal.open && (
        <div style={{position:"fixed",inset:0,zIndex:20,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.3)",padding:16}}>
          <div style={{width:"100%",maxWidth:420,borderRadius:16,background:"#fff",padding:20,boxShadow:"0 20px 50px rgba(0,0,0,0.2)"}}>
            <div style={{fontSize:18,fontWeight:600,marginBottom:6}}>Potvrdit rezervaci</div>
            <p style={{fontSize:14,color:"#475569",marginBottom:12}}>Zadejte prosím svůj e-mail. Pošleme potvrzovací odkaz; po jeho otevření bude dárek uzamčen.</p>
            <input type="email" placeholder="vas@email.cz" value={email} onChange={(e)=>setEmail(e.target.value)}
              style={{width:"100%",borderRadius:12,border:"1px solid #cbd5e1",padding:"8px 12px",marginBottom:12}}/>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
              <button onClick={()=>setReserveModal({open:false,giftId:""})} style={{borderRadius:12,border:"1px solid #cbd5e1",padding:"8px 12px"}}>Zrušit</button>
              <button onClick={handleReserve} style={{borderRadius:12,background:"#0f172a",color:"#fff",padding:"8px 12px"}}>Poslat potvrzení</button>
            </div>
          </div>
        </div>
      )}

      <footer style={{maxWidth:960,margin:"0 auto",padding:"40px 16px",textAlign:"center",fontSize:12,color:"#94a3b8"}}>
        {new Date().getFullYear()} • Nikoskův wishlist • React • potvrzení e‑mailem
      </footer>
    </div>
  );
}

function GiftCard({ gift, admin, onReserve, onUnreserve, onDelete, onEdit }){
  const status = gift.reservation?.status || null;
  const confirmed = status === "confirmed";
  const pending = status === "pending";
  return (
    <div style={{borderRadius:16,border:"1px solid #e2e8f0",overflow:"hidden",background:"#fff",display:"flex",flexDirection:"column",opacity: confirmed ? 0.6 : 1}}>
      {gift.image && <div style={{aspectRatio:"16/9",background:"#f1f5f9",overflow:"hidden"}}><img src={gift.image} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/></div>}
      <div style={{padding:16,display:"flex",flexDirection:"column",flex:1}}>
        <div style={{display:"flex",alignItems:"flex-start",gap:8}}>
          <h3 style={{fontSize:18,fontWeight:600,flex:1}}>{gift.title}</h3>
          {confirmed && <span style={{fontSize:12,borderRadius:999,background:"#0f172a",color:"#fff",padding:"4px 8px"}}>Zarezervováno</span>}
          {pending && <span style={{fontSize:12,borderRadius:999,background:"#b45309",color:"#fff",padding:"4px 8px"}}>Čeká na potvrzení</span>}
        </div>
        {typeof gift.priceCZK === "number" && <div style={{marginTop:4,color:"#475569"}}>{currency(gift.priceCZK)}</div>}
        {gift.note && <p style={{marginTop:8,fontSize:14,color:"#475569"}}>{gift.note}</p>}
        <div style={{marginTop:"auto",display:"flex",alignItems:"center",gap:8,paddingTop:12}}>
          {gift.link && <a href={gift.link} target="_blank" style={{borderRadius:12,border:"1px solid #cbd5e1",padding:"8px 12px",fontSize:14}}>Otevřít odkaz</a>}
          {!confirmed ? (
            <button onClick={onReserve} disabled={pending}
              style={{marginLeft:"auto",borderRadius:12,padding:"8px 12px",color:"#fff",background: pending ? "#cbd5e1" : "#059669",cursor: pending ? "not-allowed" : "pointer"}}>
              {pending ? "Odeslán e-mail…" : "Zarezervovat"}
            </button>
          ) : (
            <div style={{marginLeft:"auto",fontSize:12,color:"#64748b"}}>
              {gift.reservation?.email && <>pro {maskEmail(gift.reservation.email)}</>}
            </div>
          )}
        </div>

        {admin && (
          <div style={{marginTop:12,display:"flex",gap:8,borderTop:"1px solid #e2e8f0",paddingTop:12}}>
            {(pending || confirmed) && <button onClick={onUnreserve} style={{borderRadius:12,border:"1px solid #cbd5e1",padding:"8px 12px",fontSize:14}}>Zrušit rezervaci</button>}
            <GiftEditor initial={gift} onSubmit={onEdit} small />
            <button onClick={onDelete} style={{marginLeft:"auto",borderRadius:12,border:"1px solid #fecaca",background:"#fee2e2",color:"#991b1b",padding:"8px 12px",fontSize:14}}>Smazat</button>
          </div>
        )}
      </div>
    </div>
  );
}

function GiftEditor({ initial, onSubmit, small }){
  const [form,setForm]=useState(initial || { id:"", title:"", link:"", image:"", priceCZK:"", note:"" });
  const [open,setOpen]=useState(false);
  useEffect(()=>{ setForm(initial || { id:"", title:"", link:"", image:"", priceCZK:"", note:"" }); },[initial]);
  const Trigger=(<button onClick={()=>setOpen(true)} style={{borderRadius:12,border:"1px solid #cbd5e1",padding: small?"8px 12px":"10px 14px",fontSize: small?14:16}}>{initial?"Upravit":"Přidat dárek"}</button>);
  async function save(){
    if(!form.id || !form.title){ alert("Vyplňte minimálně ID a Název"); return; }
    const gift = { ...form, priceCZK: form.priceCZK==="" ? undefined : Number(form.priceCZK) };
    try{ await onSubmit(gift); setOpen(false); }catch(e){ alert(`Uložení selhalo: ${e?.message || e}`); }
  }
  return (<>
    {Trigger}
    {open && (
      <div style={{position:"fixed",inset:0,zIndex:30,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.3)",padding:16}}>
        <div style={{width:"100%",maxWidth:640,borderRadius:16,background:"#fff",padding:20,boxShadow:"0 20px 50px rgba(0,0,0,0.2)"}}>
          <div style={{fontSize:18,fontWeight:600,marginBottom:6}}>{initial ? "Upravit dárek" : "Přidat nový dárek"}</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:12,marginTop:12}}>
            <Field label="ID (unikátní, bez mezer)"><input value={form.id} onChange={(e)=>setForm({...form,id:e.target.value})} style={{width:"100%",borderRadius:12,border:"1px solid #cbd5e1",padding:"8px 12px"}} placeholder="např. duplo-zviratka"/></Field>
            <Field label="Název"><input value={form.title} onChange={(e)=>setForm({...form,title:e.target.value})} style={{width:"100%",borderRadius:12,border:"1px solid #cbd5e1",padding:"8px 12px"}} placeholder="Název dárku"/></Field>
            <Field label="Odkaz na produkt (URL)"><input value={form.link} onChange={(e)=>setForm({...form,link:e.target.value})} style={{width:"100%",borderRadius:12,border:"1px solid #cbd5e1",padding:"8px 12px"}} placeholder="https://…"/></Field>
            <Field label="Obrázek (URL)"><input value={form.image} onChange={(e)=>setForm({...form,image:e.target.value})} style={{width:"100%",borderRadius:12,border:"1px solid #cbd5e1",padding:"8px 12px"}} placeholder="https://…"/></Field>
            <Field label="Orientační cena (Kč)"><input type="number" value={form.priceCZK} onChange={(e)=>setForm({...form,priceCZK:e.target.value})} style={{width:"100%",borderRadius:12,border:"1px solid #cbd5e1",padding:"8px 12px"}} placeholder="např. 999"/></Field>
            <Field label="Poznámka"><input value={form.note} onChange={(e)=>setForm({...form,note:e.target.value})} style={{width:"100%",borderRadius:12,border:"1px solid #cbd5e1",padding:"8px 12px"}} placeholder="Velikost, barva, tipy…"/></Field>
          </div>
          <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:16}}>
            <button onClick={()=>setOpen(false)} style={{borderRadius:12,border:"1px solid #cbd5e1",padding:"8px 12px"}}>Zavřít</button>
            <button onClick={save} style={{borderRadius:12,background:"#0f172a",color:"#fff",padding:"8px 12px"}}>Uložit</button>
          </div>
        </div>
      </div>
    )}
  </>);
}

function Field({ label, children }){ return (<label style={{display:"block",fontSize:14}}><div style={{color:"#475569",marginBottom:6}}>{label}</div>{children}</label>); }
