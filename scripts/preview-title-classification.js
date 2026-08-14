import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Regole basate su terminologia di reparto ESPLICITA nel titolo (IT/EN),
// non su supposizioni. Ordine = priorità (prima regola che matcha vince).
// Se nessuna regola matcha con sicurezza -> NULL (niente invenzioni).
const rules = [
  // Override di priorità: titolo che INIZIA esplicitamente con "IT" come ruolo
  // (non "Site", "Italia" ecc.) vince su qualunque altra parola chiave presente
  // altrove nel titolo (es. "IT ... Manufacturing Systems", "IT ... Finance Tools").
  { code: 'it', patterns: [/^it\s/i, /^it[-\/]/i] },
  { code: 'drug_safety', patterns: [/pharmacovigilance/i, /farmacovigilanza/i, /drug safety/i] },
  { code: 'medical_affairs', patterns: [/medical science liaison/i, /\bmsl\b/i, /medical affairs/i, /medical advisor/i] },
  { code: 'regulatory_affairs', patterns: [/regulatory affairs/i, /affari regolatori/i, /regulatory specialist/i, /regulatory manager/i] },
  { code: 'clinical_operations', patterns: [/clinical operations/i, /clinical trial/i, /clinical research associate/i, /\bcra\b/i, /clinical quality/i, /clinical study/i] },
  { code: 'quality', patterns: [/quality assurance/i, /\bqa\b/i, /quality control/i, /\bqc\b/i, /qualità/i, /quality manager/i, /quality specialist/i] },
  { code: 'manufacturing', patterns: [/produzione/i, /manufacturing/i, /process engineer/i, /manutentore/i, /plant manager/i, /production manager/i, /operatore di produzione/i, /packaging operator/i, /addetto.*produzione/i] },
  { code: 'supply_chain', patterns: [/supply chain/i, /logistics/i, /logistica/i, /procurement/i, /warehouse/i, /magazzino/i] },
  { code: 'rd', patterns: [/\br&d\b/i, /research and development/i, /research scientist/i, /analytical scientist/i, /formulation scientist/i, /ricerca e sviluppo/i, /r&d engineer/i] },
  { code: 'market_access', patterns: [/market access/i, /pricing and reimbursement/i, /health economics/i, /\bheor\b/i] },
  { code: 'marketing', patterns: [/marketing/i, /brand manager/i] },
  { code: 'commercial', patterns: [/informatore scientifico/i, /informatore medico scientifico/i, /\bisf\b/i, /\bdetailer\b/i, /sales rep/i, /sales specialist/i, /sales technician/i, /account manager/i, /key account/i, /product specialist/i, /\bvendite\b/i, /addetto.*vendita/i, /territory manager/i, /medical representative/i] },
  { code: 'business_development', patterns: [/business development/i, /\bbd manager\b/i] },
  { code: 'finance', patterns: [/\bfinance\b/i, /controller/i, /treasury/i, /accounting/i, /contabilità/i, /amministrazione.*finanza/i] },
  { code: 'hr', patterns: [/\bhr\b/i, /human resources/i, /risorse umane/i, /recruiter/i, /talent acquisition/i] },
  { code: 'it', patterns: [/software developer/i, /cybersecurity/i, /\bit\b.*(engineer|specialist|manager|analyst)/i, /data engineer/i, /sistemista/i, /^it /i] },
  { code: 'general_management', patterns: [/general manager/i, /country manager/i, /managing director/i, /direttore generale/i] }
];

function classify(title) {
  if (!title) return null;
  for (const rule of rules) {
    if (rule.patterns.some(p => p.test(title))) return rule.code;
  }
  return null;
}

async function preview() {
  const { data: jobs } = await supabase
    .from('job_listings')
    .select('id, job_title, company_name')
    .is('classification_source', null);

  console.log(`Totale record da classificare: ${jobs.length}\n`);

  const results = jobs.map(j => ({ ...j, newCode: classify(j.job_title) }));

  const dist = new Map();
  results.forEach(r => {
    const v = r.newCode || 'NULL';
    dist.set(v, (dist.get(v) || 0) + 1);
  });

  console.log('📊 DISTRIBUZIONE RISULTATO (anteprima, nulla scritto su Supabase):\n');
  Array.from(dist.entries()).sort((a,b)=>b[1]-a[1]).forEach(([v,c]) => {
    const pct = ((c/results.length)*100).toFixed(1);
    console.log(`   ${v.padEnd(22)} ${c} (${pct}%)`);
  });

  console.log('\n📋 CAMPIONE PER CATEGORIA (5 esempi ciascuna)...\n');
  const byCode = new Map();
  results.forEach(r => {
    const key = r.newCode || 'NULL';
    if (!byCode.has(key)) byCode.set(key, []);
    byCode.get(key).push(r);
  });

  byCode.forEach((items, code) => {
    console.log(`\n--- ${code} (${items.length} totali) ---`);
    items.slice(0, 5).forEach(i => console.log(`   "${i.job_title}" — ${i.company_name}`));
  });
}

preview();
