// Replica ESATTA di updateSalaryBenchmarks() in index.html, eseguita con
// service_role: la tabella salary_benchmarks ha RLS che blocca la scrittura
// per l'utente anon del browser (confermato 02/09/2026 — 401 "new row violates
// row-level security policy"), quindi il tasto "Aggiorna benchmark" dell'app
// fallisce sempre in silenzio (il codice ingoia l'errore). Finche' non si
// decide come sbloccarlo lato client (RPC SECURITY DEFINER, o accettare che
// resti un'operazione da backend), questo script e' il modo per farlo girare.
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main(){
  const { data: withRal } = await supabase.from('job_listings')
    .select('canonical_role,role_family,functional_area_v2,ral_min,ral_max,company_name,published_date')
    .not('canonical_role','is',null)
    .or('ral_min.not.is.null,ral_max.not.is.null');
  console.log('Annunci con RAL e canonical_role:', withRal.length);

  const { data: allListings } = await supabase.from('job_listings')
    .select('canonical_role,published_date').not('canonical_role','is',null);

  const now = Date.now();
  const d30cut = new Date(now-30*864e5).toISOString().split('T')[0];
  const d90cut = new Date(now-90*864e5).toISOString().split('T')[0];
  const countByRole = {};
  for(const l of allListings){
    const k=l.canonical_role;
    if(!countByRole[k]) countByRole[k]={total:0,d30:0,d90:0};
    countByRole[k].total++;
    if(l.published_date>=d30cut) countByRole[k].d30++;
    if(l.published_date>=d90cut) countByRole[k].d90++;
  }
  const byRole = {};
  withRal.forEach(l=>{
    const key=l.canonical_role;
    if(!byRole[key]) byRole[key]={listings:[],role_family:l.role_family,functional_area_v2:l.functional_area_v2};
    byRole[key].listings.push(l);
  });

  let written=0;
  for(const [role,data] of Object.entries(byRole)){
    const vals=data.listings.map(l=>l.ral_min&&l.ral_max?(l.ral_min+l.ral_max)/2:(l.ral_min||l.ral_max)).filter(Boolean).sort((a,b)=>a-b);
    if(!vals.length) continue;
    const p=n=>vals[Math.max(0,Math.floor(vals.length*n/100)-1)];
    const avg=Math.round(vals.reduce((a,b)=>a+b)/vals.length);
    const counts=countByRole[role]||{total:vals.length,d30:0,d90:0};
    const companies=new Set(data.listings.map(l=>l.company_name).filter(Boolean)).size;
    const benchmarkData={canonical_role:role,role_family:data.role_family||null,functional_area_v2:data.functional_area_v2||null,therapeutic_area:'not_applicable',region:'N/D',company_type:'N/D',sector_v2:'N/D',sample_size:vals.length,sample_with_ral:vals.length,total_listings:counts.total,p25:p(25)||null,median:p(50)||null,p75:p(75)||null,p90:p(90)||null,avg_ral:avg,min_ral:vals[0]||null,max_ral:vals[vals.length-1]||null,listings_30d:counts.d30,listings_90d:counts.d90,listings_365d:counts.total,companies_count:companies,updated_at:new Date().toISOString()};

    // Vincolo UNIQUE reale e' su canonical_role da solo (scoperto qui il
    // 02/09/2026), non sulla combinazione con therapeutic_area/region/... come
    // assumeva il WHERE del codice originale in index.html — quel filtro non
    // trovava mai la riga esistente e andava sempre in insert, fallendo sul
    // vincolo. upsert con onConflict sul solo canonical_role e' corretto.
    const { error: upErr } = await supabase.from('salary_benchmarks')
      .upsert(benchmarkData, { onConflict: 'canonical_role' });
    if(upErr){ console.error(role, 'errore upsert:', upErr.message); continue; }
    written++;
  }
  console.log('Righe salary_benchmarks scritte/aggiornate:', written);
}
main();
