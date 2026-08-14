import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const rules = [
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
  { code: 'it', patterns: [/software developer/i, /cybersecurity/i, /\bit\b.*(engineer|specialist|manager|analyst)/i, /data engineer/i, /sistemista/i] },
  { code: 'general_management', patterns: [/general manager/i, /country manager/i, /managing director/i, /direttore generale/i] }
];

function classify(title) {
  if (!title) return null;
  for (const rule of rules) {
    if (rule.patterns.some(p => p.test(title))) return rule.code;
  }
  return null;
}

async function apply() {
  console.log('🔧 SCRITTURA functional_area_v2 SUI 587 NON ANALIZZATI (da job_title)\n');

  const { data: jobs } = await supabase
    .from('job_listings')
    .select('id, job_title')
    .is('classification_source', null);

  console.log(`Record da processare: ${jobs.length}`);

  let classified = 0, left = 0;
  for (const job of jobs) {
    const code = classify(job.job_title);
    if (code) {
      await supabase.from('job_listings').update({ functional_area_v2: code }).eq('id', job.id);
      classified++;
    } else {
      left++;
    }
  }

  console.log(`✅ Classificati: ${classified}`);
  console.log(`⚪ Restano NULL (nessuna terminologia di reparto riconoscibile): ${left}`);

  console.log('\n📊 STATO GLOBALE FINALE job_listings.functional_area_v2...');
  const { count: totalJobs } = await supabase.from('job_listings').select('*', { count: 'exact', head: true });
  const { count: withFA } = await supabase.from('job_listings').select('*', { count: 'exact', head: true }).not('functional_area_v2', 'is', null);
  console.log(`   Totale: ${totalJobs}`);
  console.log(`   Con functional_area_v2: ${withFA} (${((withFA/totalJobs)*100).toFixed(1)}%)`);
  console.log(`   NULL: ${totalJobs - withFA}`);
}

apply();
