import React, { useEffect, useMemo, useState } from "react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
const ADMIN_PIN = (import.meta.env && import.meta.env.VITE_ADMIN_PIN) || "nikos2025";

const useSupabase = !!(SUPABASE_URL && SUPABASE_ANON_KEY);
const TABLE = "gifts_registry";

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

function currency(n){ return typeof n === "number" ? n.toLocaleString("cs-CZ",{style:"currency",currency:"CZK"}) : "" }
const maskEmail = (email="") => { const [u,d]=email.split("@"); if(!u||!d) return "(neznámý e-mail)"; const m=u.length<=2?"**":u[0]+"***"+u.slice(-1); return `${m}@${d}`; };

function useDataStore(){
  async function listGifts(){
    if(useSupabase){
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

  async function saveGifts(gifts){
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?on_conflict=id`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation"
      },
      body: JSON.stringify(gifts)
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Supabase saveGifts selhal: ${txt}`);
    }
    return await res.json();
  }

  async function upsertGift(gift){
    const baseHeaders = {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation"
    };
    const check = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(gift.id)}&select=id`, { headers: baseHeaders });
    if (!check.ok) {
      const txt = await check.text().catch(() => "");
      throw new Error(`Supabase select selhal: ${txt}`);
    }
    const rows = await check.json();
    if (rows.length > 0) {
      const { id, ...rest } = gift;
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", headers: baseHeaders, body: JSON.stringify(rest) });
      if (!(res.ok || res.status === 204)) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Supabase PATCH selhal: ${txt}`);
      }
      return gift;
    } else {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}`, { method: "POST", headers: baseHeaders, body: JSON.stringify([gift]) });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Supabase POST selhal: ${txt}`);
      }
      return gift;
    }
  }

  async function removeGift(id){
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Supabase DELETE selhal: ${txt}`);
    }
  }

  return { listGifts, saveGifts, upsertGift, removeGift };
}

export default function App(){
  const store = useDataStore();
  const [loading,setLoading]=useState(true);
  const [items,setItems]=useState([]);
  const [query,setQuery]=useState("");
  const [admin,setAdmin]=useState(false);
  const [pin,setPin]=useState("");
  const [info,setInfo]=useState("");

  useEffect(()=>{(async()=>{const data=await store.listGifts();setItems(data);setLoading(false);})();},[]);

  const filtered = useMemo(()=>{const q=query.trim().toLowerCase();if(!q)return items;return items.filter(g=>[g.title,g.note,g.link].filter(Boolean).some(v=>v.toLowerCase().includes(q)));},[items,query]);

  async function handleAddOrEdit(g){try{await store.upsertGift(g);setItems(await store.listGifts());setInfo("Dárek uložen.");setTimeout(()=>setInfo(""),2000);}catch(e){alert(`Uložení selhalo: ${e?.message||e}`);}}
  async function handleDelete(id){try{await store.removeGift(id);setItems(await store.listGifts());}catch(e){alert(`Smazání selhalo: ${e?.message||e}`);}}

  return (<div className="min-h-screen bg-slate-50 text-slate-800">
    <header className="sticky top-0 z-10 backdrop-blur bg-white/70 border-b border-slate-200">
      <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-3">
        <div className="text-2xl font-bold">🎁 Seznam dárků pro Nikoska</div>
        <span className="ml-auto hidden md:inline text-sm text-slate-500">
          {useSupabase ? "Online sdílená verze (Supabase připojeno)" : "Lokální verze (pro sdílení nastavte Supabase)"}
        </span>
      </div>
    </header>

    <main className="max-w-5xl mx-auto px-4 py-6">
      <div className="flex flex-col md:flex-row gap-3 md:items-center mb-4">
        <input type="search" placeholder="Hledat v dárcích…" value={query} onChange={(e)=>setQuery(e.target.value)} className="w-full md:w-80 rounded-xl border border-slate-300 px-4 py-2"/>
        <div className="flex items-center gap-2 ml-auto">
          {!admin ? (<details><summary className="cursor-pointer rounded-xl border border-slate-300 px-4 py-2">Admin</summary>
          <div className="absolute bg-white border border-slate-200 rounded-xl p-3 shadow-xl w-64"><input type="password" value={pin} onChange={(e)=>setPin(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2"/><button onClick={()=>setAdmin(pin===ADMIN_PIN)} className="mt-2 w-full rounded-lg bg-emerald-600 text-white py-2">Přihlásit</button></div></details>)
          : (<div className="flex items-center gap-2"><button onClick={()=>setAdmin(false)} className="rounded-xl border border-slate-300 px-4 py-2">Odhlásit admin</button><GiftEditor onSubmit={handleAddOrEdit}/></div>)}
        </div>
      </div>
      {info && <div className="mb-4 rounded-xl border border-slate-200 bg-white p-3 text-sm">{info}</div>}
      {loading?(<div className="py-12 text-center text-slate-500">Načítám dárky…</div>):
      (<div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{filtered.map(g=>(<GiftCard key={g.id} gift={g} admin={admin} onDelete={()=>handleDelete(g.id)} onEdit={(gift)=>handleAddOrEdit(gift)}/>))}</div>)}
    </main>
  </div>);
}

function GiftCard({gift,admin,onDelete,onEdit}){return(<div className="rounded-2xl border bg-white p-4 shadow-sm flex flex-col"><div className="flex items-start gap-2"><h3 className="text-lg font-semibold flex-1">{gift.title}</h3></div>{gift.priceCZK?<div className="mt-1 text-slate-600">{currency(gift.priceCZK)}</div>:null}{gift.note&&<p className="mt-2 text-sm text-slate-600">{gift.note}</p>}{admin&&(<div className="mt-3 flex items-center gap-2 border-t pt-3"><GiftEditor initial={gift} onSubmit={onEdit} small/><button onClick={onDelete} className="ml-auto rounded-xl border border-red-200 bg-red-50 text-red-700 px-3 py-2 text-sm">Smazat</button></div>)}</div>);}

function GiftEditor({initial,onSubmit,small}){const[form,setForm]=useState(initial||{id:"",title:"",link:"",image:"",priceCZK:"",note:""});const[open,setOpen]=useState(false);useEffect(()=>{setForm(initial||{id:"",title:"",link:"",image:"",priceCZK:"",note:""});},[initial]);async function save(){if(!form.id||!form.title){alert("Vyplňte minimálně ID a Název");return;}const gift={...form,priceCZK:form.priceCZK===""?undefined:Number(form.priceCZK)};try{await onSubmit(gift);setOpen(false);}catch(e){alert(`Uložení selhalo: ${e?.message||e}`);}}const Trigger=(<button onClick={()=>setOpen(true)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm">{initial?"Upravit":"Přidat dárek"}</button>);return(<>{Trigger}{open&&(<div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4"><div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-2xl"><div className="text-lg font-semibold mb-1">{initial?"Upravit dárek":"Přidat nový dárek"}</div><div className="grid sm:grid-cols-2 gap-3 mt-3"><Field label="ID (unikátní, bez mezer)"><input value={form.id} onChange={(e)=>setForm({...form,id:e.target.value})} className="w-full rounded-xl border border-slate-300 px-3 py-2"/></Field><Field label="Název"><input value={form.title} onChange={(e)=>setForm({...form,title:e.target.value})} className="w-full rounded-xl border border-slate-300 px-3 py-2"/></Field><Field label="Odkaz na produkt (URL)"><input value={form.link} onChange={(e)=>setForm({...form,link:e.target.value})} className="w-full rounded-xl border border-slate-300 px-3 py-2"/></Field><Field label="Obrázek (URL)"><input value={form.image} onChange={(e)=>setForm({...form,image:e.target.value})} className="w-full rounded-xl border border-slate-300 px-3 py-2"/></Field><Field label="Orientační cena (Kč)"><input type="number" value={form.priceCZK} onChange={(e)=>setForm({...form,priceCZK:e.target.value})} className="w-full rounded-xl border border-slate-300 px-3 py-2"/></Field><Field label="Poznámka"><input value={form.note} onChange={(e)=>setForm({...form,note:e.target.value})} className="w-full rounded-xl border border-slate-300 px-3 py-2"/></Field></div><div className="flex gap-2 justify-end mt-4"><button onClick={()=>setOpen(false)} className="rounded-xl border border-slate-300 px-4 py-2">Zavřít</button><button onClick={save} className="rounded-xl bg-slate-900 text-white px-4 py-2">Uložit</button></div></div></div>)}</>);}function Field({label,children}){return(<label className="block text-sm"><div className="text-slate-600 mb-1">{label}</div>{children}</label>);}