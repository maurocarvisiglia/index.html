import fs from 'fs';

const raw = JSON.parse(fs.readFileSync('C:\\Users\\Utente\\Downloads\\INDEX\\LS Intelligence\\scripts\\msl-data-correct.json', 'utf-8'));

const excluded = raw.filter(j => j.location === 'America');
const jobs = raw.filter(j => j.location !== 'America');

console.log(`Raw: ${raw.length} | Esclusi (sede estera): ${excluded.length} | Analizzati: ${jobs.length}`);

const nListings = jobs.length;
const companies = new Set(jobs.map(j => j.company_id));
console.log(`Aziende distinte (company_id): ${companies.size}`);

const byCompanyName = {};
jobs.forEach(j => { byCompanyName[j.company_name] = (byCompanyName[j.company_name]||0)+1; });
console.log('\nPer nome azienda (grezzo, non raggruppato per company_id):');
Object.entries(byCompanyName).sort((a,b)=>b[1]-a[1]).forEach(([n,c]) => console.log(`   ${n}: ${c}`));

const byCompanyId = {};
jobs.forEach(j => {
  if (!byCompanyId[j.company_id]) byCompanyId[j.company_id] = {name: j.ragione_sociale||j.company_name, count:0};
  byCompanyId[j.company_id].count++;
});
console.log('\nPer company_id (corretto):');
Object.values(byCompanyId).sort((a,b)=>b.count-a.count).forEach(c => console.log(`   ${c.name}: ${c.count}`));

const ralMids = jobs.filter(j=>j.ral_min&&j.ral_max).map(j=>(j.ral_min+j.ral_max)/2).sort((a,b)=>a-b);
const avg = Math.round(ralMids.reduce((a,b)=>a+b,0)/ralMids.length);
const median = ralMids[Math.floor(ralMids.length/2)];
const rawMin = Math.min(...jobs.filter(j=>j.ral_min).map(j=>j.ral_min));
const rawMax = Math.max(...jobs.filter(j=>j.ral_max).map(j=>j.ral_max));

console.log(`\nRAL: min=${rawMin} media=${avg} mediana=${median} max=${rawMax}`);

const top3 = Object.values(byCompanyId).sort((a,b)=>b.count-a.count).slice(0,3).reduce((s,c)=>s+c.count,0);
console.log(`Top3 share: ${Math.round((top3/nListings)*100)}%`);
