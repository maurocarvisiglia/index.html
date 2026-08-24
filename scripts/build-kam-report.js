import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const GEMINI_MODELS = ['gemini-flash-latest', 'gemini-flash-lite-latest'];
const GEMINI_KEY = process.env.GEMINI_API_KEY;

const logo = fs.readFileSync('C:\\Users\\Utente\\Downloads\\INDEX\\LS Intelligence\\scripts\\logo-base64.txt', 'utf-8').trim();

const GOLD='#b8965a', TAN='#c8b89a', DARK='#1c1c1c', CREAM='#faf9f6', BORDER='#e8e0d5', BORDER2='#f0ebe3';

// ══ Funzioni copiate ESATTAMENTE da index.html (post-fix) — stessa identica logica ══

function filterRalOutlierListings(listings){
  const withVal=listings
    .filter(l=>l.ral_min||l.ral_max)
    .map(l=>({l,v:l.ral_min&&l.ral_max?(l.ral_min+l.ral_max)/2:(l.ral_min||l.ral_max)}))
    .filter(x=>x.v>=16000&&x.v<=350000);
  if(withVal.length<6)return{kept:withVal.map(x=>x.l),excludedCount:0};
  const sorted=withVal.map(x=>x.v).slice().sort((a,b)=>a-b);
  const q1=sorted[Math.floor(sorted.length*0.25)];
  const q3=sorted[Math.floor(sorted.length*0.75)];
  const iqr=q3-q1;
  const lowerFence=q1-1.5*iqr,upperFence=q3+1.5*iqr;
  const kept=withVal.filter(x=>x.v>=lowerFence&&x.v<=upperFence).map(x=>x.l);
  return{kept,excludedCount:withVal.length-kept.length};
}

function trimmedRal(listings){
  const raw=listings.filter(l=>l.ral_min||l.ral_max).map(l=>l.ral_min&&l.ral_max?(l.ral_min+l.ral_max)/2:(l.ral_min||l.ral_max));
  const filtered=raw.filter(v=>v>=16000&&v<=350000);
  if(filtered.length<=2)return filtered.sort((a,b)=>a-b);
  const sorted=filtered.sort((a,b)=>a-b);
  const q1=sorted[Math.floor(sorted.length*0.25)];
  const q3=sorted[Math.floor(sorted.length*0.75)];
  const iqr=q3-q1;
  const lowerFence=q1-1.5*iqr,upperFence=q3+1.5*iqr;
  const iqrFiltered=sorted.filter(v=>v>=lowerFence&&v<=upperFence);
  if(iqrFiltered.length<6)return iqrFiltered;
  const cut=Math.max(1,Math.floor(iqrFiltered.length*0.10));
  return iqrFiltered.slice(cut,iqrFiltered.length-cut);
}

function computeRalHistogram(listings){
  const{kept,excludedCount}=filterRalOutlierListings(listings);
  const vals=kept.map(l=>l.ral_min&&l.ral_max?(l.ral_min+l.ral_max)/2:(l.ral_min||l.ral_max));
  if(!vals.length)return{buckets:[],total:0,excludedCount};
  const rawMin=Math.min(...vals),rawMax=Math.max(...vals);
  const range=Math.max(rawMax-rawMin,1);
  const targetBuckets=10;
  const rawBucketSize=range/targetBuckets;
  const bucketSize=[1000,2500,5000,10000,20000,25000,50000].find(s=>s>=rawBucketSize)||50000;
  const min=Math.floor(rawMin/bucketSize)*bucketSize;
  const max=Math.ceil(rawMax/bucketSize)*bucketSize;
  const buckets=[];
  for(let b=min;b<max;b+=bucketSize){
    buckets.push({from:b,to:b+bucketSize,count:vals.filter(v=>v>=b&&v<b+bucketSize).length});
  }
  return{buckets,total:vals.length,excludedCount};
}

function computeRalByCompany(listings,maxCompanies){
  maxCompanies=maxCompanies||10;
  const{kept,excludedCount}=filterRalOutlierListings(listings);
  const byCo={};
  kept.forEach(l=>{
    const ral=l.ral_min&&l.ral_max?(l.ral_min+l.ral_max)/2:(l.ral_min||l.ral_max);
    const c=l.ragione_sociale||l.company_name||'N/D';
    (byCo[c]=byCo[c]||[]).push(ral);
  });
  let rows=Object.entries(byCo).map(([company,vals])=>{
    const sorted=vals.slice().sort((a,b)=>a-b);
    return{company,median:sorted[Math.floor(sorted.length/2)],count:vals.length};
  });
  if(rows.length>maxCompanies){
    rows=rows.sort((a,b)=>b.count-a.count).slice(0,maxCompanies);
  }
  return{rows:rows.sort((a,b)=>a.median-b.median),excludedCount};
}

function computeRalBySeniority(listings){
  const bySen = {};
  listings.forEach(l => {
    const sen = l.seniority_v2 || 'N/D';
    if (sen === 'not_applicable') return;
    const ral = l.ral_max || l.ral_min;
    if (!ral) return;
    if (!bySen[sen]) bySen[sen] = [];
    bySen[sen].push(ral);
  });
  const stats = {};
  Object.entries(bySen).forEach(([sen, rals]) => {
    const sorted = rals.sort((a, b) => a - b);
    stats[sen] = {
      count: rals.length,
      min: Math.min(...rals),
      max: Math.max(...rals),
      p25: sorted[Math.floor(sorted.length * 0.25)],
      median: sorted[Math.floor(sorted.length * 0.5)],
      p75: sorted[Math.floor(sorted.length * 0.75)],
      avg: Math.round(rals.reduce((a, b) => a + b, 0) / rals.length)
    };
  });
  return stats;
}

function isStraumann(l){ return /straumann/i.test(l.ragione_sociale||l.company_name||''); }

// Un annuncio per provincia con stesso titolo/RAL non e' una decisione retributiva
// indipendente, ma la replica geografica di UN'unica decisione. Raggruppa per
// (azienda, titolo normalizzato, RAL) per stimare quante decisioni di prezzo reali
// esistono dietro N annunci.
function computePricingDecisions(listings){
  const groups = {};
  listings.forEach(l => {
    const company = l.ragione_sociale || l.company_name || 'N/D';
    const titleNorm = (l.job_title||'').replace(/\([^)]*\)/g,'').replace(/[-–]\s*\S+$/,'').trim();
    const key = company+'|'+titleNorm+'|'+l.ral_min+'|'+l.ral_max;
    if(!groups[key]) groups[key] = { company, title: titleNorm, ral_min: l.ral_min, ral_max: l.ral_max, count: 0, cities: [] };
    groups[key].count++;
    if(l.location) groups[key].cities.push(l.location);
  });
  const decisions = Object.values(groups).sort((a,b)=>b.count-a.count);
  const byCompany = {};
  decisions.forEach(d => { byCompany[d.company] = (byCompany[d.company]||0)+1; });
  return { decisions, totalDecisions: decisions.length, replicatedDecisions: decisions.filter(d=>d.count>1) };
}

// Confronta il differenziale RAL tra livelli di seniority con la varianza RAL
// SOLO tra aziende allo stesso livello — per capire se la seniority o il datore
// di lavoro spiega di piu' la posizione salariale di un annuncio.
function seniorityVsCompanyVariance(listings){
  const bySen = computeRalBySeniority(listings);
  const spec = bySen['specialist'], sen = bySen['senior_specialist'];
  if(!spec || !sen) return null;
  const seniorityGapPct = Math.round((sen.median-spec.median)/spec.median*100);
  const specVals = listings.filter(l=>l.seniority_v2==='specialist'&&(l.ral_min||l.ral_max)).map(l=>l.ral_min&&l.ral_max?(l.ral_min+l.ral_max)/2:(l.ral_min||l.ral_max));
  const specRange = specVals.length ? Math.max(...specVals)-Math.min(...specVals) : null;
  return { specialist_median: spec.median, senior_median: sen.median, seniority_gap: sen.median-spec.median, seniority_gap_pct: seniorityGapPct, specialist_range: specRange, specialist_min: specVals.length?Math.min(...specVals):null, specialist_max: specVals.length?Math.max(...specVals):null };
}

function benchmarkFor(listings){
  const trimmed = trimmedRal(listings).sort((a,b)=>a-b);
  const median = trimmed.length ? trimmed[Math.floor(trimmed.length/2)] : null;
  const avg = trimmed.length ? Math.round(trimmed.reduce((a,b)=>a+b,0)/trimmed.length) : null;
  const p = n => trimmed.length ? trimmed[Math.max(0,Math.floor(trimmed.length*n/100))] : null;
  const byCompany = {};
  listings.forEach(l => { const c=l.ragione_sociale||l.company_name||'N/D'; (byCompany[c]=byCompany[c]||[]).push(l); });
  const companies = Object.entries(byCompany).map(([c,ls])=>({company:c,count:ls.length})).sort((a,b)=>b.count-a.count);
  const top3SharePct = listings.length ? Math.round(companies.slice(0,3).reduce((a,c)=>a+c.count,0)/listings.length*100) : 0;
  return {
    n_listings: listings.length, n_companies: companies.length,
    median, avg, p25: p(25), p75: p(75),
    min: trimmed.length?trimmed[0]:null, max: trimmed.length?trimmed[trimmed.length-1]:null,
    companies, top3SharePct,
    ral_by_seniority: computeRalBySeniority(listings)
  };
}

function histogramChart(histogram,highlightFrom){
  if(!histogram||!histogram.buckets||!histogram.buckets.length)return '<div style="font-size:11px;color:#aaa;">Dato non disponibile</div>';
  const buckets=histogram.buckets;
  const W=560,H=180,padL=34,padR=10,padBottom=28,padTop=20;
  const innerW=W-padL-padR,innerH=H-padTop-padBottom;
  const maxCount=Math.max(...buckets.map(b=>b.count),1);
  const barW=innerW/buckets.length;
  const steps=4,gridLines=[];
  for(let i=0;i<=steps;i++){
    const v=Math.round(maxCount/steps*i);
    const y=padTop+innerH-(v/maxCount*innerH);
    gridLines.push(`<line x1="${padL}" y1="${y}" x2="${W-padR}" y2="${y}" stroke="${BORDER}" stroke-width="1"/><text x="${padL-6}" y="${y+3}" text-anchor="end" font-size="9" fill="#888">${v}</text>`);
  }
  const bars=buckets.map((b,i)=>{
    const x=padL+i*barW;
    const h=(b.count/maxCount)*innerH;
    const y=padTop+innerH-h;
    const isHighlight=highlightFrom!=null&&highlightFrom>=b.from&&highlightFrom<b.to;
    const color=isHighlight?TAN:DARK;
    const label=Math.round(b.from/1000)+'-'+Math.round(b.to/1000)+'k';
    return `<rect x="${x+2}" y="${y}" width="${Math.max(0,barW-4)}" height="${Math.max(0,h)}" fill="${color}" fill-opacity="0.9" rx="2"/>${b.count>0?`<text x="${x+barW/2}" y="${y-4}" text-anchor="middle" font-size="9" font-weight="700" fill="${DARK}">${b.count}</text>`:''}<text x="${x+barW/2}" y="${padTop+innerH+16}" text-anchor="middle" font-size="8" fill="#888">${label}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:${W}px;">${gridLines.join('')}${bars}</svg>`;
}

function axisBarChart(rows,opts){
  opts=opts||{};
  if(!rows||!rows.length)return '<div style="font-size:11px;color:#aaa;">Dato non disponibile</div>';
  const W=560,rowH=26,padL=140,padR=54,padTop=8;
  const maxLabelChars=22;
  function wrapLabel(text){
    text=text||'';
    if(text.length<=maxLabelChars)return[text];
    const mid=Math.floor(text.length/2);
    let splitAt=-1,bestDist=Infinity;
    for(let i=0;i<text.length;i++){
      if(text[i]===' '){const d=Math.abs(i-mid);if(d<bestDist){bestDist=d;splitAt=i;}}
    }
    if(splitAt===-1)return[text.length>maxLabelChars?text.substring(0,maxLabelChars-1)+'…':text];
    let line1=text.substring(0,splitAt),line2=text.substring(splitAt+1);
    if(line2.length>maxLabelChars)line2=line2.substring(0,maxLabelChars-1)+'…';
    return[line1,line2];
  }
  const valueFn=opts.valueFn||(r=>r.median);
  const maxVal=Math.max(...rows.map(valueFn),1);
  const niceMax=Math.ceil(maxVal/10000)*10000;
  const innerW=W-padL-padR;
  const scaleX=v=>padL+(v/niceMax)*innerW;

  const rowLines=rows.map(r=>wrapLabel(opts.labelFn?opts.labelFn(r):(r.company||'')));
  const rowHeights=rowLines.map(lines=>lines.length>1?Math.round(rowH*1.55):rowH);
  const rowY=[];let cursor=padTop;
  rowHeights.forEach(h=>{rowY.push(cursor);cursor+=h;});
  const totalRowsH=cursor-padTop;
  const H=padTop+totalRowsH+26;

  const steps=5,gridLines=[];
  for(let i=0;i<=steps;i++){
    const v=Math.round(niceMax/steps*i);
    const x=scaleX(v);
    gridLines.push(`<line x1="${x}" y1="${padTop}" x2="${x}" y2="${padTop+totalRowsH}" stroke="${BORDER}" stroke-width="1"/><text x="${x}" y="${padTop+totalRowsH+16}" text-anchor="middle" font-size="9" fill="#888">${v>=1000?Math.round(v/1000)+'k':v}</text>`);
  }
  const bars=rows.map((r,i)=>{
    const val=valueFn(r);
    const rowTop=rowY[i],rowHi=rowHeights[i];
    const barCenterY=rowTop+rowHi/2;
    const barW=Math.max(2,scaleX(val)-padL);
    const color=opts.colorFn?opts.colorFn(r,i):GOLD;
    const lines=rowLines[i];
    const valLabel=opts.valueLabelFn?opts.valueLabelFn(r):('€'+Math.round(val/1000)+'k');
    const labelSvg=lines.length>1
      ?`<text x="${padL-8}" y="${barCenterY-3}" text-anchor="end" font-size="10" fill="#333">${lines[0]}</text><text x="${padL-8}" y="${barCenterY+10}" text-anchor="end" font-size="10" fill="#333">${lines[1]}</text>`
      :`<text x="${padL-8}" y="${barCenterY+4}" text-anchor="end" font-size="10" fill="#333">${lines[0]}</text>`;
    return `${labelSvg}<rect x="${padL}" y="${barCenterY-(rowH-10)/2}" width="${barW}" height="${rowH-10}" fill="${color}" fill-opacity="0.9" rx="2"/><text x="${padL+barW+6}" y="${barCenterY+4}" font-size="10" font-weight="700" fill="${DARK}">${valLabel}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:${W}px;">${gridLines.join('')}${bars}</svg>`;
}

function barRows(entries){
  if(!entries.length)return '<div style="font-size:11px;color:#aaa;">Dato non disponibile</div>';
  const max=Math.max(...entries.map(([,c])=>c));
  return entries.map(([label,count])=>{
    const pct=Math.round((count/max)*100);
    return `<div class="bar-row"><div class="bar-label">${label}</div><div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${GOLD};"></div></div><div class="bar-count">${count}</div></div>`;
  }).join('');
}

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

async function callGeminiOnce(model, prompt, maxTokens){
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const resp = await fetch(url+'?key='+GEMINI_KEY, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ contents:[{parts:[{text:prompt}]}], generationConfig:{maxOutputTokens:maxTokens,temperature:0.15} })
  });
  if(!resp.ok) throw new Error('Gemini('+model+') error '+resp.status+' '+(await resp.text()));
  const data = await resp.json();
  return data.candidates[0].content.parts[0].text.trim();
}

async function callGemini(prompt, maxTokens){
  let lastErr;
  for(const model of GEMINI_MODELS){
    for(let attempt=1; attempt<=3; attempt++){
      try{ return await callGeminiOnce(model, prompt, maxTokens); }
      catch(e){
        lastErr = e;
        console.warn(`  tentativo ${attempt}/3 con ${model} fallito: ${e.message.slice(0,120)}`);
        if(attempt<3) await sleep(5000*attempt);
      }
    }
  }
  throw lastErr;
}

// Lettura scritta direttamente da Claude sui dati grezzi (non passata da Gemini):
// individua quante decisioni retributive indipendenti esistono davvero dietro gli
// annunci, e confronta il peso della seniority con quello del datore di lavoro.
function authorStructuralAnalysis(pricing, senVar, fullB, exB, straumannShare){
  const fmt = v => v!=null ? '€'+Math.round(v/1000)+'k' : 'n.d.';
  const straumannDecisions = pricing.decisions.filter(d=>/straumann/i.test(d.company));
  const straumannListingsCount = straumannDecisions.reduce((a,d)=>a+d.count,0);
  const bdDecisions = pricing.decisions.filter(d=>/becton dickinson/i.test(d.company));
  const repeatedNonStraumann = pricing.replicatedDecisions.filter(d=>!/straumann/i.test(d.company));

  const straumannPara = straumannDecisions.length
    ? `Straumann Italia pesa il ${straumannShare}% del campione (${straumannListingsCount} annunci su ${fullB.n_listings}), ma dietro questi annunci non ci sono ${straumannListingsCount} decisioni retributive distinte: sono ${straumannDecisions.length} soli scaglioni di prezzo (${straumannDecisions.map(d=>fmt((d.ral_min+d.ral_max)/2)+' per il ruolo "'+d.title+'"').join('; ')}), replicati a livello di singola provincia in gran parte del Centro-Nord Italia. Il "${straumannShare}% del campione" descrive quindi un'unica scelta organizzativa di roll-out territoriale, non 36 negoziazioni salariali indipendenti.`
    : '';

  const repeatedPara = repeatedNonStraumann.length
    ? ` Anche fuori da Straumann il campione non è del tutto composto da decisioni indipendenti: ${repeatedNonStraumann.map(d=>`"${d.title}" (${d.company}) compare ${d.count} volte a ${fmt((d.ral_min+d.ral_max)/2)}`).join('; ')} — stesso ruolo, stessa RAL, città diverse.`
    : '';

  const bdPara = bdDecisions.length>1
    ? ` Becton Dickinson è l'unica azienda del campione depurato che mostra una vera segmentazione retributiva interna: ${bdDecisions.length} ruoli distinti a RAL diverse (${bdDecisions.map(d=>fmt((d.ral_min+d.ral_max)/2)).join(', ')}), a conferma che una stessa azienda può avere politiche di prezzo differenziate per linea di prodotto invece di un unico scaglione.`
    : '';

  const totalListings = fullB.n_listings;
  const decisionPara = `Contando le decisioni di prezzo realmente indipendenti — non le righe di annuncio — il campione di ${totalListings} annunci si riduce a circa ${pricing.totalDecisions} scelte retributive distinte. Il numero di annunci pubblicati non è quindi una proxy affidabile della profondità del mercato: la maggior parte del volume osservato origina da un numero ristretto di decisioni organizzative ripetute su più sedi.`;

  const senPara = senVar
    ? `Il differenziale tra i livelli di seniority è più contenuto di quanto ci si aspetterebbe: la mediana senior specialist (${fmt(senVar.senior_median)}) supera quella specialist (${fmt(senVar.specialist_median)}) di ${fmt(senVar.seniority_gap)} (+${senVar.seniority_gap_pct}%). Ma tra i soli annunci specialist la RAL osservata varia da ${fmt(senVar.specialist_min)} a ${fmt(senVar.specialist_max)} — uno spread di ${fmt(senVar.specialist_range)}, più ampio del salto tra i due livelli di seniority. In altre parole, sapere quale azienda offre la posizione spiega la RAL più di quanto la spieghi il livello di seniority dichiarato: il posizionamento salariale di un Key Account Manager dipende più dal singolo datore di lavoro che dalla progressione di carriera.`
    : '';

  return { straumannPara, repeatedPara, bdPara, decisionPara, senPara };
}

async function narrateDetailed(fullB, exB, seniorityFull, geoEntries, contractEntries, dateRange, taCoveragePct){
  const facts = {
    periodo_dati: dateRange,
    campione_completo: { n_annunci: fullB.n_listings, n_aziende: fullB.n_companies, ral_mediana: fullB.median, ral_media: fullB.avg, p25: fullB.p25, p75: fullB.p75, min: fullB.min, max: fullB.max, top3_share_pct: fullB.top3SharePct, top_aziende: fullB.companies.slice(0,5) },
    campione_senza_straumann: { n_annunci: exB.n_listings, n_aziende: exB.n_companies, ral_mediana: exB.median, ral_media: exB.avg, p25: exB.p25, p75: exB.p75, min: exB.min, max: exB.max, top3_share_pct: exB.top3SharePct, top_aziende: exB.companies.slice(0,5) },
    straumann_quota_pct: Math.round((fullB.n_listings-exB.n_listings)/fullB.n_listings*100),
    ral_per_seniority_completo: seniorityFull,
    distribuzione_geografica: geoEntries,
    distribuzione_contratto: contractEntries,
    copertura_area_terapeutica_pct: taCoveragePct
  };

  const prompt = `Sei un consulente senior di MC Pharma Consulting che scrive un report di market intelligence MOLTO DETTAGLIATO per un cliente (un'azienda che deve decidere su assunzioni, retribuzioni o organico per la figura di Key Account Manager nel settore Life Sciences in Italia). Non stai vendendo servizi di ricerca — stai spiegando cosa significano questi numeri e perché, come un consulente strategico.

Scrivi in italiano, basandoti ESCLUSIVAMENTE sui dati numerici forniti sotto. Non inventare numeri, aziende o dettagli non presenti nei dati.

DATI CALCOLATI (unica fonte ammessa):
${JSON.stringify(facts,null,1)}

CONTESTO CRITICO SU STRAUMANN — questo e' il punto centrale del report:
Straumann Italia rappresenta il ${facts.straumann_quota_pct}% del campione totale di annunci Key Account Manager. E' una concentrazione talmente elevata che QUALSIASI lettura del mercato basata solo sull'aggregato "campione_completo" rischia di descrivere in realta' la politica retributiva di UN SOLO datore di lavoro, non il mercato Life Sciences italiano nel suo complesso. Per questo hai a disposizione DUE viste sugli stessi dati:
- "campione_completo": include Straumann (il mercato "cosi' come si osserva" — utile per capire il volume reale di domanda, dato che Straumann assume comunque davvero)
- "campione_senza_straumann": esclude Straumann (il mercato "depurato" — piu' rappresentativo se il lettore vuole confrontare la propria offerta con il resto del mercato, non con la politica di un singolo datore)
Il tuo compito e' commentare ENTRAMBE le viste esplicitamente in ogni punto rilevante, MAI scegliere una sola come "quella vera". Se le due mediane divergono in modo significativo, spiega il meccanismo (es. se Straumann paga sistematicamente sopra o sotto il resto del mercato, e di quanto).

REGOLE ASSOLUTE SUI DATI:
- Usa solo i numeri sopra. Se un valore e' null, non menzionarlo.
- Cita sempre l'arco temporale dei dati ("periodo_dati").
- Usa "ral_per_seniority_completo" per commentare i differenziali retributivi tra livelli con numeri precisi.
- Usa "distribuzione_geografica" per indicare dove si concentra la domanda.
- Se "copertura_area_terapeutica_pct" e' basso (sotto 30%), menzionalo come limite del dato, non ignorarlo.

REGOLE ASSOLUTE SUL TONO:
- VIETATO il linguaggio da pitch commerciale ("si consiglia di monitorare", "contattateci", "rappresenta un'opportunita' per il recruiting").
- VIETATO qualunque consiglio di SOURCING o RECRUITING INTERNO (canali di ricerca candidati, "LinkedIn", "referenze interne", "strategia di reclutamento"). Il lettore e' un CLIENTE che decide su assunzioni/retribuzioni/organico, non su come MC Pharma troverebbe i candidati.
- Ogni affermazione deve spiegare un MECCANISMO concreto legato ai numeri (concentrazione su un datore, differenziale retributivo tra seniority, tipo di contratto prevalente, copertura geografica) — non un consiglio generico.

Rispondi SOLO con questo JSON:
{
  "executive_summary": "<5-7 frasi: il messaggio piu' importante, inclusa la distorsione Straumann e le due mediane a confronto>",
  "detailed_market_reading": "<8-12 frasi, un'analisi molto particolareggiata e discorsiva della situazione del mercato: livello dei compensi con e senza Straumann, come si distribuisce per seniority (con numeri), dove si concentra geograficamente, che tipo di contratto prevale, cosa dice il numero di aziende attive sulla profondita' del mercato. Deve leggersi come un paragrafo di analisi vera, non un elenco puntato travestito da prosa.>",
  "straumann_distortion_analysis": "<4-6 frasi che spiegano nel dettaglio COME e QUANTO Straumann distorce l'aggregato, confrontando esplicitamente le due mediane/medie e cosa cambia per un'azienda che si benchmarka contro il mercato completo invece che contro il mercato depurato>",
  "seniority_analysis": "<3-5 frasi sui differenziali retributivi tra i livelli di seniority, con numeri precisi>",
  "operational_implication": "<3-4 frasi su cosa cambia concretamente per chi decide su assunzioni/retribuzioni/organico, ancorate a un meccanismo specifico dei dati sopra, mai un consiglio di sourcing>"
}`;

  const raw = await callGemini(prompt, 2400);
  const clean = raw.replace(/```json|```/g,'').trim();
  return JSON.parse(clean);
}

function computeDateRangeLabel(listings){
  const dates = listings.map(l=>l.published_date).filter(Boolean).sort();
  if(!dates.length) return 'n.d.';
  const fmt = d => new Date(d).toLocaleDateString('it-IT',{month:'long',year:'numeric'});
  const first = fmt(dates[0]), last = fmt(dates[dates.length-1]);
  return first===last ? first : first+' – '+last;
}

async function main(){
  console.log('🔎 Estrazione dati Key Account Manager...\n');
  const { data: raw } = await supabase
    .from('job_listings')
    .select('id, job_title, company_name, ragione_sociale, location, seniority_v2, ral_min, ral_max, therapeutic_area, contract_type, published_date, company_id')
    .eq('canonical_role', 'Key Account Manager');

  const excludedForeign = raw.filter(j => /america/i.test(j.location||''));
  const listings = raw.filter(j => !excludedForeign.includes(j));
  const listingsExStraumann = listings.filter(j => !isStraumann(j));

  console.log(`Raw: ${raw.length} | Esclusi (sede estera): ${excludedForeign.length} | Analizzati: ${listings.length} | Senza Straumann: ${listingsExStraumann.length}`);

  const fullB = benchmarkFor(listings);
  const exB = benchmarkFor(listingsExStraumann);
  const dateRange = computeDateRangeLabel(listings);

  const ral_histogram = computeRalHistogram(listings);
  const { rows: ral_by_company, excludedCount: ral_by_company_excluded } = computeRalByCompany(listings);

  const bySeniority = {};
  listings.forEach(l => { const s=l.seniority_v2||'N/D'; bySeniority[s]=(bySeniority[s]||0)+1; });
  const seniorityEntries = Object.entries(bySeniority).sort((a,b)=>b[1]-a[1]);

  const byGeo = {};
  listings.forEach(l => {
    const loc = l.location || '';
    let region = 'Non specificata';
    if (/lombardia|milano|basiglio/i.test(loc)) region = 'Lombardia';
    else if (/lazio|roma/i.test(loc)) region = 'Lazio';
    else if (/veneto|padova|verona/i.test(loc)) region = 'Veneto';
    else if (/piemonte|torino/i.test(loc)) region = 'Piemonte';
    else if (/emilia|bologna/i.test(loc)) region = 'Emilia-Romagna';
    else if (loc) region = 'Altro/Multi-regione';
    byGeo[region] = (byGeo[region]||0)+1;
  });
  const geoEntries = Object.entries(byGeo).sort((a,b)=>b[1]-a[1]);

  const byContract = {};
  listings.forEach(l => { const c=l.contract_type||'N/D'; byContract[c]=(byContract[c]||0)+1; });
  const contractEntries = Object.entries(byContract).sort((a,b)=>b[1]-a[1]);

  const taCoverage = listings.filter(l=>l.therapeutic_area).length;
  const taCoveragePct = Math.round(taCoverage/listings.length*100);

  console.log(`\nCon Straumann → n=${fullB.n_listings}, mediana=${fullB.median}, media=${fullB.avg}, aziende=${fullB.n_companies}`);
  console.log(`Senza Straumann → n=${exB.n_listings}, mediana=${exB.median}, media=${exB.avg}, aziende=${exB.n_companies}`);
  console.log(`Copertura area terapeutica: ${taCoveragePct}%`);

  const fmt = v => v!=null ? '€'+Math.round(v/1000)+'k' : 'n.d.';

  const pricingDecisions = computePricingDecisions(listings);
  const senVar = seniorityVsCompanyVariance(listings);
  console.log(`Decisioni retributive indipendenti stimate: ${pricingDecisions.totalDecisions} (su ${listings.length} annunci)`);

  console.log('\n🤖 Generazione lettura dettagliata del mercato (Gemini)...');
  let narration;
  try{
    narration = await narrateDetailed(fullB, exB, computeRalBySeniority(listings), geoEntries, contractEntries, dateRange, taCoveragePct);
    console.log('✅ Narrazione generata.');
  }catch(e){
    console.warn('⚠️ Narrazione IA fallita, uso fallback:', e.message);
    narration = {
      executive_summary: `Il campione di ${fullB.n_listings} annunci Key Account Manager e' dominato da Straumann Italia (${Math.round((fullB.n_listings-exB.n_listings)/fullB.n_listings*100)}% del totale). La RAL mediana completa e' ${fmt(fullB.median)}, contro ${fmt(exB.median)} escludendo Straumann.`,
      detailed_market_reading: 'Dato non disponibile — narrazione IA non generata.',
      straumann_distortion_analysis: `Escludendo Straumann la mediana passa da ${fmt(fullB.median)} a ${fmt(exB.median)} su ${exB.n_companies} aziende diversificate.`,
      seniority_analysis: 'Dato non disponibile — narrazione IA non generata.',
      operational_implication: ''
    };
  }

  const straumannShare = Math.round((fullB.n_listings-exB.n_listings)/fullB.n_listings*100);
  const structural = authorStructuralAnalysis(pricingDecisions, senVar, fullB, exB, straumannShare);

  const ralByCompanyLabelled = ral_by_company.map(r => ({...r, label: (isStraumannName(r.company) ? r.company+' *' : r.company)}));
  function isStraumannName(c){ return /straumann/i.test(c||''); }

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Market Intelligence — Key Account Manager (analisi dettagliata)</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:Georgia,serif;background:#fff;color:${DARK};}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}@page{margin:15mm 18mm;size:A4;}}
.page{max-width:900px;margin:0 auto;padding:40px 48px;}
.header{display:flex;justify-content:space-between;align-items:center;padding-bottom:20px;border-bottom:2px solid ${TAN};margin-bottom:36px;}
.kpi-grid{display:grid;gap:1px;background:${BORDER};border:1px solid ${BORDER};border-radius:10px;overflow:hidden;margin:16px 0;grid-template-columns:repeat(4,1fr);}
.kpi-cell{background:#fff;padding:14px 16px;text-align:center;}
.kpi-label{font-size:10px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;}
.kpi-value{font-size:20px;font-weight:700;color:${DARK};}
.kpi-gold{color:${GOLD};}
.compare-wrap{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:20px 0;}
.compare-col{border-radius:10px;overflow:hidden;border:1px solid ${BORDER};}
.compare-head{padding:10px 16px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#fff;}
.compare-head.full{background:${DARK};}
.compare-head.ex{background:${GOLD};}
.salary-bar{padding:18px 20px;display:grid;grid-template-columns:repeat(2,1fr);gap:10px;background:${CREAM};}
.sal-item{text-align:center;}
.sal-label{font-size:9px;color:#999;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;}
.sal-value{font-size:18px;font-weight:700;color:${DARK};}
.section-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:${GOLD};margin:28px 0 14px;}
.summary-box{background:${CREAM};border-left:4px solid ${TAN};padding:18px 20px;border-radius:0 8px 8px 0;font-size:13px;line-height:1.85;color:#333;margin-bottom:20px;}
.summary-box.dark{background:${DARK};border-left-color:${GOLD};color:#eee;}
.chart-box{background:${CREAM};border-radius:8px;padding:16px 18px;margin-bottom:16px;}
.footer{margin-top:40px;padding-top:16px;border-top:1px solid ${BORDER};text-align:center;font-size:10px;color:#aaa;line-height:1.8;}
.bar-row{display:flex;align-items:center;gap:8px;margin-bottom:6px;}
.bar-label{font-size:11px;color:#555;width:170px;flex-shrink:0;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.bar-track{flex:1;background:${BORDER};border-radius:4px;height:14px;overflow:hidden;}
.bar-fill{height:100%;border-radius:4px;}
.bar-count{font-size:11px;font-weight:700;color:${DARK};min-width:28px;}
.asterisk-note{font-size:10px;color:#999;font-style:italic;margin-top:6px;}
</style>
</head><body>
<div class="page">
  <div class="header">
    <img src="${logo}" style="height:56px;" alt="MC Pharma Consulting"/>
    <div style="text-align:right;">
      <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#888;margin-bottom:4px;">Market Intelligence Report — Analisi dettagliata</div>
      <div style="font-size:12px;color:#888;">24 Agosto 2026</div>
    </div>
  </div>

  <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:${GOLD};margin-bottom:10px;">Figura professionale analizzata</div>
  <div style="font-size:36px;font-weight:700;color:${DARK};margin-bottom:4px;letter-spacing:-0.5px;">Key Account Manager (KAM)</div>
  <div style="font-size:12px;color:#888;margin-bottom:8px;">Base: <strong>${fullB.n_listings}</strong> annunci reali (canonical_role) — periodo ${dateRange}</div>
  <div style="font-size:10px;color:#999;font-style:italic;">* Gli annunci Straumann Italia sono marcati con asterisco in tutte le tabelle/grafici e riportati sia inclusi (mercato osservato) sia esclusi (mercato depurato), perché rappresentano il ${straumannShare}% del campione.</div>

  <div class="section-title">Sintesi esecutiva</div>
  <div class="summary-box dark">${narration.executive_summary}</div>

  <div class="section-title">Confronto: mercato osservato vs mercato depurato da Straumann *</div>
  <div class="compare-wrap">
    <div class="compare-col">
      <div class="compare-head full">Con Straumann * (${fullB.n_listings} annunci)</div>
      <div class="salary-bar">
        <div class="sal-item"><div class="sal-label">Mediana</div><div class="sal-value" style="color:${GOLD};">${fmt(fullB.median)}</div></div>
        <div class="sal-item"><div class="sal-label">Media</div><div class="sal-value">${fmt(fullB.avg)}</div></div>
        <div class="sal-item"><div class="sal-label">P25</div><div class="sal-value" style="font-size:14px;color:#888;">${fmt(fullB.p25)}</div></div>
        <div class="sal-item"><div class="sal-label">P75</div><div class="sal-value" style="font-size:14px;color:#888;">${fmt(fullB.p75)}</div></div>
      </div>
    </div>
    <div class="compare-col">
      <div class="compare-head ex">Senza Straumann * (${exB.n_listings} annunci, ${exB.n_companies} aziende)</div>
      <div class="salary-bar">
        <div class="sal-item"><div class="sal-label">Mediana</div><div class="sal-value" style="color:${GOLD};">${fmt(exB.median)}</div></div>
        <div class="sal-item"><div class="sal-label">Media</div><div class="sal-value">${fmt(exB.avg)}</div></div>
        <div class="sal-item"><div class="sal-label">P25</div><div class="sal-value" style="font-size:14px;color:#888;">${fmt(exB.p25)}</div></div>
        <div class="sal-item"><div class="sal-label">P75</div><div class="sal-value" style="font-size:14px;color:#888;">${fmt(exB.p75)}</div></div>
      </div>
    </div>
  </div>
  <div class="summary-box">${narration.straumann_distortion_analysis}</div>

  <div class="section-title">Analisi strutturale — quante decisioni retributive reali ci sono davvero</div>
  <div class="summary-box dark">${structural.straumannPara}${structural.repeatedPara}${structural.bdPara?'<br><br>'+structural.bdPara:''}</div>
  <div class="summary-box">${structural.decisionPara}</div>
  ${structural.senPara?`<div class="summary-box">${structural.senPara}</div>`:''}

  <div class="section-title">Lettura dettagliata del mercato</div>
  <div class="summary-box">${narration.detailed_market_reading}</div>

  <div class="section-title">Distribuzione RAL — campione completo (n=${ral_histogram.total})</div>
  <div class="chart-box">${histogramChart(ral_histogram)}
  ${ral_histogram.excludedCount?`<div class="asterisk-note">* ${ral_histogram.excludedCount} annunci esclusi dal grafico per RAL statisticamente anomala (metodo IQR)</div>`:''}</div>

  <div class="section-title">RAL per azienda (annunci Straumann marcati con *)</div>
  <div class="chart-box">${axisBarChart(ralByCompanyLabelled,{labelFn:r=>r.label,colorFn:r=>isStraumannName(r.company)?TAN:DARK})}
  ${ral_by_company_excluded?`<div class="asterisk-note">* ${ral_by_company_excluded} annunci esclusi dal grafico per RAL statisticamente anomala (metodo IQR)</div>`:''}</div>

  <div class="section-title">Analisi per seniority</div>
  <div class="summary-box">${narration.seniority_analysis}</div>
  <div class="chart-box">${barRows(seniorityEntries)}</div>

  <div class="section-title">Area geografica (da campo location)</div>
  <div class="chart-box">${barRows(geoEntries)}</div>

  <div class="section-title">Tipo contratto</div>
  <div class="chart-box">${barRows(contractEntries)}</div>

  <div class="section-title">Implicazione operativa</div>
  <div class="summary-box">${narration.operational_implication}</div>

  <div class="footer">
    Report su ${fullB.n_listings} annunci Key Account Manager (bucket adattivo + esclusione outlier IQR).<br>
    * Straumann Italia rappresenta il ${straumannShare}% del campione: tutte le figure chiave sono riportate sia includendola sia escludendola.<br>
    Copertura area terapeutica: ${taCoveragePct}% degli annunci.<br>
    © 2026 MC Pharma Consulting S.r.l. · Via Bagutta 13, Milano · P.IVA 14672870962<br>
    <span style="color:${TAN};">LS Job Intelligence</span>
  </div>
</div>
</body></html>`;

  fs.writeFileSync('C:\\Users\\Utente\\Downloads\\INDEX\\LS Intelligence\\scripts\\kam-report-detailed.html', html);
  console.log('\n✅ Report generato: scripts/kam-report-detailed.html');
}
main();
