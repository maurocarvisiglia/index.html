import fs from 'fs';

const raw = JSON.parse(fs.readFileSync('C:\\Users\\Utente\\Downloads\\INDEX\\LS Intelligence\\scripts\\msl-data.json', 'utf-8'));

// Escludo 2 annunci anomali: location non italiana / RAL implausibile (già segnalati in diagnosi precedente)
const excluded = raw.filter(j => j.location === 'America' || (j.ral_max && j.ral_max > 150000));
const jobs = raw.filter(j => !(j.location === 'America' || (j.ral_max && j.ral_max > 150000)));

console.log(`Totale grezzo: ${raw.length} | Esclusi (anomalie): ${excluded.length} | Analizzati: ${jobs.length}`);
excluded.forEach(j => console.log(`   ESCLUSO: "${j.job_title}" — ${j.company_name} — RAL ${j.ral_min}-${j.ral_max} — loc: ${j.location}`));

const nListings = jobs.length;
const companies = new Set(jobs.map(j => j.company_id));
const nCompanies = companies.size;

// RAL stats (media di min/max per annuncio)
const ralMids = jobs.filter(j => j.ral_min && j.ral_max).map(j => (j.ral_min + j.ral_max) / 2).sort((a,b) => a-b);
const ralAllMin = Math.min(...jobs.filter(j=>j.ral_min).map(j=>j.ral_min));
const ralAllMax = Math.max(...jobs.filter(j=>j.ral_max).map(j=>j.ral_max));
const avg = Math.round(ralMids.reduce((a,b)=>a+b,0) / ralMids.length);
const median = ralMids[Math.floor(ralMids.length/2)];

// RAL per seniority
const bySeniority = {};
jobs.forEach(j => {
  if (!j.seniority_v2 || !j.ral_min || !j.ral_max) return;
  if (!bySeniority[j.seniority_v2]) bySeniority[j.seniority_v2] = [];
  bySeniority[j.seniority_v2].push((j.ral_min + j.ral_max) / 2);
});
const seniorityStats = Object.entries(bySeniority).map(([sen, vals]) => ({
  seniority: sen,
  count: vals.length,
  median: Math.round(vals.sort((a,b)=>a-b)[Math.floor(vals.length/2)])
})).sort((a,b) => b.count - a.count);

// Top employers / scarsità — raggruppo per company_id (affidabile), non per
// nome testuale (es. "Msd" e "MSD ITALIA S.R.L." sono la stessa azienda)
const byCompanyId = {};
jobs.forEach(j => {
  if (!byCompanyId[j.company_id]) byCompanyId[j.company_id] = { name: j.ragione_sociale || j.company_name, count: 0 };
  byCompanyId[j.company_id].count++;
  // preferisci il nome più "pulito" (ragione_sociale se disponibile)
  if (j.ragione_sociale) byCompanyId[j.company_id].name = j.ragione_sociale;
});
const topEmployers = Object.values(byCompanyId).sort((a,b) => b.count-a.count).map(c => [c.name, c.count]);
const top3Count = topEmployers.slice(0,3).reduce((s,[,c])=>s+c,0);
const top3Share = Math.round((top3Count / nListings) * 100);

// Area terapeutica
const byTA = {};
jobs.forEach(j => {
  const ta = j.therapeutic_area || 'non specificata';
  byTA[ta] = (byTA[ta] || 0) + 1;
});

// Geografia — estratta da location + titolo (territori espliciti)
const geoTerms = {
  'Lombardia / Nord Ovest': [/lombardia/i, /milano/i, /piemonte/i, /north west/i, /basiglio/i],
  'Triveneto / Nord Est': [/veneto/i, /triveneto/i, /trentino/i, /friuli/i, /northeast/i, /north italy/i],
  'Emilia-Romagna / Centro-Nord': [/emilia-romagna/i, /centro-nord/i, /bologna/i, /modena/i, /parma/i],
  'Lazio / Centro': [/lazio/i, /roma/i],
  'Liguria': [/liguria/i],
  'Multiregione / Nazionale': [/lombardia.*veneto|piemonte.*liguria/i]
};
const byGeo = {};
jobs.forEach(j => {
  const text = `${j.location || ''} ${j.job_title}`;
  let matched = false;
  for (const [label, patterns] of Object.entries(geoTerms)) {
    if (patterns.some(p => p.test(text))) {
      byGeo[label] = (byGeo[label] || 0) + 1;
      matched = true;
      break;
    }
  }
  if (!matched) byGeo['Non specificata / Field generico'] = (byGeo['Non specificata / Field generico'] || 0) + 1;
});

// Contratto
const byContract = {};
jobs.forEach(j => { const c = j.contract_type || 'N/D'; byContract[c] = (byContract[c]||0)+1; });

const stats = {
  nListings, nCompanies, ralMin: ralAllMin, ralMax: ralAllMax, avg, median,
  top3Share, topEmployers, seniorityStats, byTA, byGeo, byContract,
  excludedCount: excluded.length,
  dateRange: '26 Giu 2026 – 5 Ago 2026'
};

fs.writeFileSync('C:\\Users\\Utente\\Downloads\\INDEX\\LS Intelligence\\scripts\\msl-stats.json', JSON.stringify(stats, null, 2));
console.log('\n📊 STATISTICHE MSL:');
console.log(JSON.stringify(stats, null, 2));
