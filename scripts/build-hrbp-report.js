import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const logo = fs.readFileSync('C:\\Users\\Utente\\Downloads\\INDEX\\LS Intelligence\\scripts\\logo-base64.txt', 'utf-8').trim();
const GOLD='#b8965a', TAN='#c8b89a', DARK='#1c1c1c', CREAM='#faf9f6', BORDER='#e8e0d5';

// ══ Famiglie di ruolo — canonical_role letto direttamente dal database ══
const FAMILY_OF_ROLE = {
  'HR Business Partner': 'HR Business Partner',
  'HR Manager': 'HR Manager',
  'HR Specialist': 'HR Specialist',
  'Learning & Development Specialist': 'Training, L&D & Talent',
  'Training Manager': 'Training, L&D & Talent',
  'Data Analyst': 'HR Analytics'
};

function mid(l){ return l.ral_min&&l.ral_max?(l.ral_min+l.ral_max)/2:(l.ral_min||l.ral_max); }
function fmt(v){ return v!=null ? '€'+Math.round(v/1000)+'k' : 'n.d.'; }

function stats(listings){
  const vals = listings.map(mid).filter(Boolean).sort((a,b)=>a-b);
  if(!vals.length) return {n:listings.length,n_ral:0,median:null,avg:null,p25:null,p75:null,min:null,max:null};
  const p = n => vals[Math.max(0,Math.min(vals.length-1,Math.floor(vals.length*n/100)))];
  return {
    n: listings.length, n_ral: vals.length,
    median: vals[Math.floor(vals.length/2)],
    avg: Math.round(vals.reduce((a,b)=>a+b,0)/vals.length),
    p25: p(25), p75: p(75), min: vals[0], max: vals[vals.length-1]
  };
}

function bySeniorityStats(listings){
  const groups={};
  listings.forEach(l=>{ const s=l.seniority_v2||'N/D'; (groups[s]=groups[s]||[]).push(l); });
  const out={};
  Object.entries(groups).forEach(([s,ls])=>{ out[s]=stats(ls); });
  return out;
}

function computePricingDecisions(listings){
  const groups={};
  listings.forEach(l=>{
    const company=l.ragione_sociale||l.company_name||'N/D';
    const titleNorm=(l.job_title||'').replace(/\([^)]*\)/g,'').replace(/[-–]\s*\S+$/,'').trim();
    const key=company+'|'+titleNorm+'|'+l.ral_min+'|'+l.ral_max;
    if(!groups[key]) groups[key]={company,title:titleNorm,ral_min:l.ral_min,ral_max:l.ral_max,count:0,locations:[]};
    groups[key].count++;
    if(l.location) groups[key].locations.push(l.location);
  });
  return Object.values(groups).sort((a,b)=>b.count-a.count);
}

function histogramChart(vals){
  if(!vals.length) return '<div style="font-size:11px;color:#aaa;">Dato non disponibile</div>';
  const W=560,H=180,padL=34,padR=10,padBottom=28,padTop=20;
  const innerW=W-padL-padR,innerH=H-padTop-padBottom;
  const rawMin=Math.min(...vals),rawMax=Math.max(...vals);
  const range=Math.max(rawMax-rawMin,1);
  const bucketSize=[2500,5000,10000,15000,20000,25000].find(s=>s>=range/8)||25000;
  const min=Math.floor(rawMin/bucketSize)*bucketSize, max=Math.ceil(rawMax/bucketSize)*bucketSize;
  const buckets=[];
  for(let b=min;b<max;b+=bucketSize) buckets.push({from:b,to:b+bucketSize,count:vals.filter(v=>v>=b&&v<b+bucketSize).length});
  const maxCount=Math.max(...buckets.map(b=>b.count),1);
  const barW=innerW/buckets.length;
  const steps=4,gridLines=[];
  for(let i=0;i<=steps;i++){
    const v=Math.round(maxCount/steps*i);
    const y=padTop+innerH-(v/maxCount*innerH);
    gridLines.push(`<line x1="${padL}" y1="${y}" x2="${W-padR}" y2="${y}" stroke="${BORDER}" stroke-width="1"/><text x="${padL-6}" y="${y+3}" text-anchor="end" font-size="9" fill="#888">${v}</text>`);
  }
  const bars=buckets.map((b,i)=>{
    const x=padL+i*barW,h=(b.count/maxCount)*innerH,y=padTop+innerH-h;
    const label=Math.round(b.from/1000)+'-'+Math.round(b.to/1000)+'k';
    return `<rect x="${x+2}" y="${y}" width="${Math.max(0,barW-4)}" height="${Math.max(0,h)}" fill="${DARK}" fill-opacity="0.9" rx="2"/>${b.count>0?`<text x="${x+barW/2}" y="${y-4}" text-anchor="middle" font-size="9" font-weight="700" fill="${DARK}">${b.count}</text>`:''}<text x="${x+barW/2}" y="${padTop+innerH+16}" text-anchor="middle" font-size="8" fill="#888">${label}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:${W}px;">${gridLines.join('')}${bars}</svg>`;
}

function axisBarChart(rows,opts){
  opts=opts||{};
  if(!rows||!rows.length) return '<div style="font-size:11px;color:#aaa;">Dato non disponibile</div>';
  const W=560,rowH=26,padL=190,padR=54,padTop=8;
  const maxLabelChars=26;
  function wrapLabel(text){
    text=text||'';
    if(text.length<=maxLabelChars) return[text];
    const mid=Math.floor(text.length/2);
    let splitAt=-1,bestDist=Infinity;
    for(let i=0;i<text.length;i++){ if(text[i]===' '){const d=Math.abs(i-mid);if(d<bestDist){bestDist=d;splitAt=i;}} }
    if(splitAt===-1) return[text.length>maxLabelChars?text.substring(0,maxLabelChars-1)+'…':text];
    let line1=text.substring(0,splitAt),line2=text.substring(splitAt+1);
    if(line2.length>maxLabelChars) line2=line2.substring(0,maxLabelChars-1)+'…';
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
    const v=Math.round(niceMax/steps*i),x=scaleX(v);
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
  if(!entries.length) return '<div style="font-size:11px;color:#aaa;">Dato non disponibile</div>';
  const max=Math.max(...entries.map(([,c])=>c));
  return entries.map(([label,count])=>{
    const pct=Math.round((count/max)*100);
    return `<div class="bar-row"><div class="bar-label">${label}</div><div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${GOLD};"></div></div><div class="bar-count">${count}</div></div>`;
  }).join('');
}

function seniorityTable(senStats,order){
  const rows = order.filter(s=>senStats[s]).map(s=>{
    const st=senStats[s];
    return `<tr><td>${s}</td><td>${st.n_ral?fmt(st.median):'n.d.'}</td><td>${st.n}</td><td>${st.n_ral?fmt(st.p25)+' – '+fmt(st.p75):'n.d.'}</td></tr>`;
  }).join('');
  return `<table class="sen-table"><thead><tr><th>Seniority</th><th>Mediana</th><th>Annunci</th><th>P25–P75</th></tr></thead><tbody>${rows}</tbody></table>`;
}

async function main(){
  console.log('🔎 Estrazione annunci HR (functional_area_v2=hr)...\n');
  const { data: raw } = await supabase
    .from('job_listings')
    .select('id, job_title, company_name, ragione_sociale, location, province, region, seniority_v2, ral_min, ral_max, contract_type, created_at, canonical_role')
    .eq('functional_area_v2', 'hr');

  const genuine = raw;
  console.log(`Totale perimetro HR: ${genuine.length}`);

  const hrbp = genuine.filter(l=>l.canonical_role==='HR Business Partner');
  const hrManager = genuine.filter(l=>l.canonical_role==='HR Manager');
  const hrSpecialist = genuine.filter(l=>l.canonical_role==='HR Specialist');
  const talentLd = genuine.filter(l=>l.canonical_role==='Learning & Development Specialist'||l.canonical_role==='Training Manager');

  const overall = stats(genuine);
  const sHrbp = stats(hrbp);
  const sHrManager = stats(hrManager);
  const sHrSpecialist = stats(hrSpecialist);
  const sTalent = stats(talentLd);

  const senOverall = bySeniorityStats(genuine);
  const senOrder = ['entry_level','associate','specialist','senior_specialist','manager','senior_manager','lead','director'];

  const decisions = computePricingDecisions(genuine);
  const replicated = decisions.filter(d=>d.count>1);

  const byProvince={};
  genuine.forEach(l=>{ const p=l.province||'N/D'; byProvince[p]=(byProvince[p]||0)+1; });
  const geoEntries=Object.entries(byProvince).sort((a,b)=>b[1]-a[1]);

  const byContract={};
  genuine.forEach(l=>{ const c=l.contract_type||'N/D'; byContract[c]=(byContract[c]||0)+1; });
  const contractEntries=Object.entries(byContract).sort((a,b)=>b[1]-a[1]);

  const familyRows = [
    {label:'HR Business Partner', ...sHrbp, median: sHrbp.median},
    {label:'HR Manager', ...sHrManager, median: sHrManager.median},
    {label:'HR Specialist', ...sHrSpecialist, median: sHrSpecialist.median},
    {label:'Training, L&D & Talent', ...sTalent, median: sTalent.median}
  ].filter(r=>r.median!=null);

  const dateRange = (()=>{ const ds=genuine.map(l=>l.created_at).sort(); const f=d=>new Date(d).toLocaleDateString('it-IT',{month:'long',year:'numeric'}); return f(ds[0])===f(ds[ds.length-1])?f(ds[0]):f(ds[0])+' – '+f(ds[ds.length-1]); })();

  console.log('\n=== RISULTATI ===');
  console.log('Overview HR:', overall);
  console.log('HRBP:', sHrbp);
  console.log('HR Manager:', sHrManager);
  console.log('HR Specialist:', sHrSpecialist);
  console.log('Training/L&D:', sTalent);
  console.log('Decisioni distinte:', decisions.length, 'di cui replicate:', replicated.length);
  console.log('\nHRBP dettaglio:');
  hrbp.forEach(l=>console.log(` - ${l.job_title} | ${l.ragione_sociale||l.company_name} | ${l.seniority_v2} | RAL ${l.ral_min}-${l.ral_max} | ${fmt(mid(l))}`));

  // ══ Narrazione — scritta direttamente da Claude sui dati calcolati sopra, nessuna IA esterna ══
  const senSS = senOverall['senior_specialist'], senMgr = senOverall['manager'];
  const executiveSummary = `Nel periodo ${dateRange}, il perimetro HR conta ${overall.n} annunci, con RAL mediana ${fmt(overall.median)} (media ${fmt(overall.avg)}, range ${fmt(overall.min)}–${fmt(overall.max)}) su ${new Set(genuine.map(l=>l.ragione_sociale||l.company_name)).size} aziende attive. Il segmento HR Business Partner (${sHrbp.n} annunci: Kerakoll, Kerry, Angelini Beauty, Sobi) mostra una mediana di ${fmt(sHrbp.median)}, sotto la mediana HR Manager (${fmt(sHrManager.median)} su ${sHrManager.n} annunci) e sotto le funzioni verticali di Training & Talent Development (mediana ${fmt(sTalent.median)} su ${sTalent.n} annunci) — coerente con un ruolo individuale di partnership verso il business, non di people management o leadership di funzione.`;

  const hrbpVsOverallDiffPct = Math.abs(sHrbp.median-overall.median)/overall.median;
  const hrbpVsOverallSentence = hrbpVsOverallDiffPct < 0.05
    ? `la mediana HRBP è ${fmt(sHrbp.median)}, sostanzialmente allineata alla mediana dell'intero perimetro HR (${fmt(overall.median)}) — la funzione HRBP non paga né un premio né uno sconto rispetto alla media di tutte le posizioni HR censite.`
    : `la mediana HRBP è ${fmt(sHrbp.median)} contro ${fmt(overall.median)} dell'intero perimetro HR — ${sHrbp.median>overall.median?'sopra':'sotto'} la mediana generale di ${fmt(Math.abs(sHrbp.median-overall.median))}.`;
  const hrbpVsGeneralPara = `Confrontando l'HR Business Partner (${sHrbp.n} annunci) con il resto del perimetro HR, ${hrbpVsOverallSentence} Rispetto all'HR Manager (mediana ${fmt(sHrManager.median)} su ${sHrManager.n} annunci, ruoli con mandato di people management o guida di sede/funzione), l'HRBP è sotto di ${fmt(sHrManager.median-sHrbp.median)} (${Math.round((sHrManager.median/sHrbp.median-1)*100)}%): il differenziale riflette il salto tra un ruolo individuale di partnership e uno con responsabilità gestionale dirette. Rispetto all'HR Specialist (mediana ${fmt(sHrSpecialist.median)} su ${sHrSpecialist.n} annunci, funzioni di processo/amministrazione), l'HRBP paga di più (+${Math.round((sHrbp.median/sHrSpecialist.median-1)*100)}%), coerente con il maggior peso decisionale del ruolo generalista rispetto a funzioni amministrative pure. Rispetto a Training/L&D/Talent Development (mediana ${fmt(sTalent.median)}), l'HRBP è sotto, ma il gap è in parte un effetto-seniority: il campione Talent/L&D include ruoli Director e Lead (es. "Director, Global Leadership, Talent Development & Learning" e "Global Talent development lead" di Alfasigma, entrambi sopra i 100k) che alzano la mediana della famiglia.`;

  const decisionsPara = `Sui ${genuine.length} annunci del perimetro HR, le decisioni retributive realmente indipendenti sono ${decisions.length}: ${replicated.length?replicated.map(d=>`"${d.title}" di ${d.company} compare ${d.count} volte a ${fmt(mid({ral_min:d.ral_min,ral_max:d.ral_max}))} (roll-out multi-sede, non ${d.count} negoziazioni distinte)`).join('; ')+'.':'nessuna decisione risulta replicata su più sedi.'} Il volume di annunci non è quindi una proxy diretta del numero di aziende che stanno effettivamente negoziando una nuova posizione HR: al netto delle repliche, il mercato osservato è sostenuto da un numero di datori più contenuto di quanto suggerisca il conteggio grezzo.`;

  const geoTop = geoEntries.slice(0,3).map(([p,c])=>`${p} (${c})`).join(', ');
  const geoPara = `La domanda geografica è concentrata in poche province: ${geoTop} coprono ${Math.round(geoEntries.slice(0,3).reduce((a,[,c])=>a+c,0)/genuine.length*100)}% del campione HR. Nel sotto-segmento HRBP, le aziende osservate (Kerakoll a Modena, Kerry a Bergamo, Angelini Beauty a Milano, Sobi a Milano) sono coerenti con questa distribuzione: nessuna concentrazione anomala su un singolo datore, a differenza di quanto osservato in altri benchmark di questo trimestre (es. Key Account Manager, dominato da un solo datore per oltre un terzo del campione).`;

  const operationalPara = `Per un'offerta HR Business Partner, il mercato osservato (n=${sHrbp.n} annunci) indica una fascia di riferimento ${fmt(sHrbp.min)}–${fmt(sHrbp.max)} con mediana ${fmt(sHrbp.median)}. Una RAL sotto ${fmt(sHrbp.p25||sHrbp.min)} rischia di posizionarsi sotto il quartile inferiore osservato per il ruolo; superare ${fmt(sHrManager.median)} (mediana HR Manager) ha senso solo se il mandato include effettivamente responsabilità di people management o guida di sede, non un ruolo HRBP di business unit singola. Il campione resta contenuto (${sHrbp.n} annunci su ${overall.n} nell'intero perimetro HR): va trattato come indicazione di fascia.`;

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Market Intelligence — HR Business Partner e overview posizioni HR</title>
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
.summary-box.warn{background:#fff8ec;border-left-color:${GOLD};color:#5a4a2f;}
.summary-box code{background:rgba(0,0,0,.06);padding:1px 5px;border-radius:4px;font-family:monospace;font-size:12px;}
.summary-box.dark code{background:rgba(255,255,255,.12);}
.chart-box{background:${CREAM};border-radius:8px;padding:16px 18px;margin-bottom:16px;}
.footer{margin-top:40px;padding-top:16px;border-top:1px solid ${BORDER};text-align:center;font-size:10px;color:#aaa;line-height:1.8;}
.bar-row{display:flex;align-items:center;gap:8px;margin-bottom:6px;}
.bar-label{font-size:11px;color:#555;width:170px;flex-shrink:0;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.bar-track{flex:1;background:${BORDER};border-radius:4px;height:14px;overflow:hidden;}
.bar-fill{height:100%;border-radius:4px;}
.bar-count{font-size:11px;font-weight:700;color:${DARK};min-width:28px;}
.sen-table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:8px;}
.sen-table th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#888;padding:6px 10px;border-bottom:2px solid ${BORDER};}
.sen-table td{padding:7px 10px;border-bottom:1px solid ${BORDER};}
.sen-table tr:last-child td{border-bottom:none;}
.hrbp-list{list-style:none;margin:0 0 8px;padding:0;}
.hrbp-list li{padding:10px 14px;border-bottom:1px solid ${BORDER};font-size:12px;display:flex;justify-content:space-between;gap:10px;}
.hrbp-list li:last-child{border-bottom:none;}
.hrbp-list .co{font-weight:700;color:${DARK};}
.hrbp-list .meta{color:#888;font-size:11px;}
.hrbp-list .ral{font-weight:700;color:${GOLD};white-space:nowrap;}
</style>
</head><body>
<div class="page">
  <div class="header">
    <img src="${logo}" style="height:56px;" alt="MC Pharma Consulting"/>
    <div style="text-align:right;">
      <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#888;margin-bottom:4px;">Market Intelligence Report — Analisi dettagliata</div>
      <div style="font-size:12px;color:#888;">31 Agosto 2026</div>
    </div>
  </div>

  <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:${GOLD};margin-bottom:10px;">Figura professionale analizzata</div>
  <div style="font-size:36px;font-weight:700;color:${DARK};margin-bottom:4px;letter-spacing:-0.5px;">HR Business Partner — con overview generale posizioni HR</div>
  <div style="font-size:12px;color:#888;margin-bottom:8px;">Base: <strong>${genuine.length}</strong> annunci HR — periodo ${dateRange}</div>

  <div class="section-title">Sintesi esecutiva</div>
  <div class="summary-box dark">${executiveSummary}</div>

  <div class="section-title">Overview generale posizioni HR (n=${overall.n})</div>
  <div class="kpi-grid">
    <div class="kpi-cell"><div class="kpi-label">Annunci</div><div class="kpi-value">${overall.n}</div></div>
    <div class="kpi-cell"><div class="kpi-label">Aziende attive</div><div class="kpi-value">${new Set(genuine.map(l=>l.ragione_sociale||l.company_name)).size}</div></div>
    <div class="kpi-cell"><div class="kpi-label">RAL Mediana</div><div class="kpi-value kpi-gold" style="color:${GOLD};">${fmt(overall.median)}</div></div>
    <div class="kpi-cell"><div class="kpi-label">Decisioni indip.</div><div class="kpi-value">${decisions.length}</div></div>
  </div>
  <div class="chart-box">${histogramChart(genuine.map(mid).filter(Boolean))}</div>

  <div class="section-title">RAL per famiglia di ruolo HR</div>
  <div class="chart-box">${axisBarChart(familyRows,{labelFn:r=>r.label,valueLabelFn:r=>fmt(r.median)+' ('+r.n+')',colorFn:(r)=>r.label.startsWith('HR Business Partner')?GOLD:DARK})}</div>

  <div class="section-title">RAL per seniority — intero perimetro HR</div>
  <div class="chart-box">${seniorityTable(senOverall,senOrder)}</div>

  <div class="section-title">Confronto: HR Business Partner vs resto del perimetro HR</div>
  <div class="compare-wrap">
    <div class="compare-col">
      <div class="compare-head full">HR Business Partner (n=${sHrbp.n})</div>
      <div class="salary-bar">
        <div class="sal-item"><div class="sal-label">Mediana</div><div class="sal-value" style="color:${GOLD};">${fmt(sHrbp.median)}</div></div>
        <div class="sal-item"><div class="sal-label">Media</div><div class="sal-value">${fmt(sHrbp.avg)}</div></div>
        <div class="sal-item"><div class="sal-label">Min</div><div class="sal-value" style="font-size:14px;color:#888;">${fmt(sHrbp.min)}</div></div>
        <div class="sal-item"><div class="sal-label">Max</div><div class="sal-value" style="font-size:14px;color:#888;">${fmt(sHrbp.max)}</div></div>
      </div>
    </div>
    <div class="compare-col">
      <div class="compare-head ex">Tutto il perimetro HR (n=${overall.n})</div>
      <div class="salary-bar">
        <div class="sal-item"><div class="sal-label">Mediana</div><div class="sal-value" style="color:${GOLD};">${fmt(overall.median)}</div></div>
        <div class="sal-item"><div class="sal-label">Media</div><div class="sal-value">${fmt(overall.avg)}</div></div>
        <div class="sal-item"><div class="sal-label">P25</div><div class="sal-value" style="font-size:14px;color:#888;">${fmt(overall.p25)}</div></div>
        <div class="sal-item"><div class="sal-label">P75</div><div class="sal-value" style="font-size:14px;color:#888;">${fmt(overall.p75)}</div></div>
      </div>
    </div>
  </div>
  <div class="summary-box">${hrbpVsGeneralPara}</div>

  <div class="section-title">HR Business Partner — dettaglio annunci</div>
  <ul class="hrbp-list">${hrbp.map(l=>`<li><div><div class="co">${l.ragione_sociale||l.company_name}</div><div class="meta">${l.job_title} · ${l.seniority_v2} · ${l.province||'n.d.'} · ${new Date(l.created_at).toLocaleDateString('it-IT')}</div></div><div class="ral">${fmt(mid(l))}</div></li>`).join('')}</ul>

  <div class="section-title">Decisioni retributive indipendenti</div>
  <div class="summary-box">${decisionsPara}</div>

  <div class="section-title">Distribuzione geografica</div>
  <div class="chart-box">${barRows(geoEntries.slice(0,10))}</div>
  <div class="summary-box">${geoPara}</div>

  <div class="section-title">Tipo contratto</div>
  <div class="chart-box">${barRows(contractEntries)}</div>

  <div class="section-title">Implicazione operativa</div>
  <div class="summary-box">${operationalPara}</div>

  <div class="footer">
    Report su ${genuine.length} annunci HR.<br>
    © 2026 MC Pharma Consulting S.r.l. · Via Bagutta 13, Milano · P.IVA 14672870962<br>
    <span style="color:${TAN};">LS Job Intelligence</span>
  </div>
</div>
</body></html>`;

  fs.writeFileSync('C:\\Users\\Utente\\Downloads\\INDEX\\LS Intelligence\\scripts\\hrbp-report.html', html);
  console.log('\n✅ Report generato: scripts/hrbp-report.html');
}
main();
