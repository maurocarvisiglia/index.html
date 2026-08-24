import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

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

async function main(){
  console.log('🔎 Estrazione dati Key Account Manager...\n');
  const { data: raw } = await supabase
    .from('job_listings')
    .select('id, job_title, company_name, ragione_sociale, location, seniority_v2, ral_min, ral_max, therapeutic_area, contract_type, company_id')
    .eq('canonical_role', 'Key Account Manager');

  const excludedForeign = raw.filter(j => j.location === 'America' || /america/i.test(j.location||''));
  const listings = raw.filter(j => !excludedForeign.includes(j));

  console.log(`Raw: ${raw.length} | Esclusi (sede estera): ${excludedForeign.length} | Analizzati: ${listings.length}`);

  // Benchmark (trimmedRal, come computeRalBenchmarkSection)
  const trimmed = trimmedRal(listings).sort((a,b)=>a-b);
  const median = trimmed.length ? trimmed[Math.floor(trimmed.length/2)] : null;
  const avg = trimmed.length ? Math.round(trimmed.reduce((a,b)=>a+b,0)/trimmed.length) : null;
  const p = n => trimmed.length ? trimmed[Math.max(0,Math.floor(trimmed.length*n/100))] : null;

  const byCompany = {};
  listings.forEach(l => { const c=l.ragione_sociale||l.company_name||'N/D'; (byCompany[c]=byCompany[c]||[]).push(l); });
  const companies = Object.entries(byCompany).map(([c,ls])=>({company:c,count:ls.length})).sort((a,b)=>b.count-a.count);
  const top3SharePct = Math.round(companies.slice(0,3).reduce((a,c)=>a+c.count,0)/listings.length*100);

  const ral_histogram = computeRalHistogram(listings);
  const { rows: ral_by_company, excludedCount: ral_by_company_excluded } = computeRalByCompany(listings);

  // Seniority mix
  const bySeniority = {};
  listings.forEach(l => { const s=l.seniority_v2||'N/D'; bySeniority[s]=(bySeniority[s]||0)+1; });
  const seniorityEntries = Object.entries(bySeniority).sort((a,b)=>b[1]-a[1]);

  // Geo (da location)
  const byGeo = {};
  listings.forEach(l => {
    const loc = l.location || '';
    let region = 'Non specificata';
    if (/lombardia|milano|basiglio/i.test(loc)) region = 'Lombardia';
    else if (/lazio|roma/i.test(loc)) region = 'Lazio';
    else if (/veneto|padova|verona/i.test(loc)) region = 'Veneto';
    else if (loc) region = 'Altro/Multi-regione';
    byGeo[region] = (byGeo[region]||0)+1;
  });
  const geoEntries = Object.entries(byGeo).sort((a,b)=>b[1]-a[1]);

  console.log(`\nCoperture: seniority=${listings.length}, RAL istogramma esclusi=${ral_histogram.excludedCount}, RAL per azienda esclusi=${ral_by_company_excluded}`);
  console.log(`Aziende nel grafico "RAL per azienda": ${ral_by_company.length}`);
  console.log(`Bucket istogramma: ${ral_histogram.buckets.length}`);

  const fmt = v => v!=null ? '€'+Math.round(v/1000)+'k' : 'n.d.';

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Market Intelligence — Key Account Manager</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:Georgia,serif;background:#fff;color:${DARK};}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}@page{margin:15mm 18mm;size:A4;}}
.page{max-width:900px;margin:0 auto;padding:40px 48px;}
.header{display:flex;justify-content:space-between;align-items:center;padding-bottom:20px;border-bottom:2px solid ${TAN};margin-bottom:36px;}
.kpi-grid{display:grid;gap:1px;background:${BORDER};border:1px solid ${BORDER};border-radius:10px;overflow:hidden;margin:28px 0;grid-template-columns:repeat(4,1fr);}
.kpi-cell{background:#fff;padding:16px 18px;text-align:center;}
.kpi-label{font-size:10px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;}
.kpi-value{font-size:22px;font-weight:700;color:${DARK};}
.kpi-gold{color:${GOLD};}
.salary-bar{background:${DARK};border-radius:12px;padding:22px 28px;margin:20px 0;display:grid;grid-template-columns:repeat(4,1fr);}
.sal-item{text-align:center;border-right:1px solid rgba(255,255,255,0.1);}
.sal-item:last-child{border-right:none;}
.sal-label{font-size:10px;color:#aaa;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;}
.sal-value{font-size:22px;font-weight:700;color:#fff;}
.section-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:${GOLD};margin:28px 0 14px;}
.summary-box{background:${CREAM};border-left:4px solid ${TAN};padding:18px 20px;border-radius:0 8px 8px 0;font-size:13px;line-height:1.8;color:#333;margin-bottom:24px;}
.chart-box{background:${CREAM};border-radius:8px;padding:16px 18px;margin-bottom:16px;}
.footer{margin-top:40px;padding-top:16px;border-top:1px solid ${BORDER};text-align:center;font-size:10px;color:#aaa;line-height:1.8;}
.bar-row{display:flex;align-items:center;gap:8px;margin-bottom:6px;}
.bar-label{font-size:11px;color:#555;width:170px;flex-shrink:0;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.bar-track{flex:1;background:${BORDER};border-radius:4px;height:14px;overflow:hidden;}
.bar-fill{height:100%;border-radius:4px;}
.bar-count{font-size:11px;font-weight:700;color:${DARK};min-width:28px;}
</style>
</head><body>
<div class="page">
  <div class="header">
    <img src="${logo}" style="height:56px;" alt="MC Pharma Consulting"/>
    <div style="text-align:right;">
      <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#888;margin-bottom:4px;">Market Intelligence Report</div>
      <div style="font-size:12px;color:#888;">24 Agosto 2026</div>
    </div>
  </div>

  <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:${GOLD};margin-bottom:10px;">Figura professionale analizzata</div>
  <div style="font-size:36px;font-weight:700;color:${DARK};margin-bottom:4px;letter-spacing:-0.5px;">Key Account Manager (KAM)</div>
  <div style="font-size:12px;color:#888;margin-bottom:8px;">Base: <strong>${listings.length}</strong> annunci reali (canonical_role)</div>
  <div style="font-size:10px;color:#999;font-style:italic;">* ${excludedForeign.length} annunci esclusi per sede estera</div>

  <div class="kpi-grid">
    <div class="kpi-cell"><div class="kpi-label">Annunci totali</div><div class="kpi-value">${listings.length}</div></div>
    <div class="kpi-cell"><div class="kpi-label">Aziende attive</div><div class="kpi-value">${companies.length}</div></div>
    <div class="kpi-cell"><div class="kpi-label">RAL mediana</div><div class="kpi-value kpi-gold">${fmt(median)}</div></div>
    <div class="kpi-cell"><div class="kpi-label">Top 3 datori</div><div class="kpi-value kpi-gold">${top3SharePct}%</div></div>
  </div>

  <div class="salary-bar">
    <div class="sal-item"><div class="sal-label">Min RAL</div><div class="sal-value" style="color:#ccc;">${fmt(trimmed[0])}</div></div>
    <div class="sal-item"><div class="sal-label">Media</div><div class="sal-value" style="color:#e8c96a;">${fmt(avg)}</div></div>
    <div class="sal-item"><div class="sal-label">Mediana</div><div class="sal-value" style="color:${TAN};">${fmt(median)}</div></div>
    <div class="sal-item"><div class="sal-label">Max RAL</div><div class="sal-value" style="color:#ccc;">${fmt(trimmed[trimmed.length-1])}</div></div>
  </div>

  <div class="section-title">Distribuzione RAL (n=${ral_histogram.total})</div>
  <div class="chart-box">${histogramChart(ral_histogram)}
  ${ral_histogram.excludedCount?`<div style="font-size:10px;color:#999;font-style:italic;margin-top:6px;">* ${ral_histogram.excludedCount} annunci esclusi dal grafico per RAL statisticamente anomala (metodo IQR)</div>`:''}</div>

  <div class="section-title">RAL per azienda</div>
  <div class="chart-box">${axisBarChart(ral_by_company)}
  ${ral_by_company_excluded?`<div style="font-size:10px;color:#999;font-style:italic;margin-top:6px;">* ${ral_by_company_excluded} annunci esclusi dal grafico per RAL statisticamente anomala (metodo IQR)</div>`:''}</div>

  <div class="section-title">Talent Scarcity — Top Datori (${companies.length} aziende, top 3 = ${top3SharePct}%)</div>
  <div class="chart-box">${barRows(companies.slice(0,10).map(c=>[c.company.length>40?c.company.substring(0,38)+'…':c.company,c.count]))}</div>

  <div class="section-title">Seniority Mix</div>
  <div class="chart-box">${barRows(seniorityEntries)}</div>

  <div class="section-title">Area Geografica (da campo location)</div>
  <div class="chart-box">${barRows(geoEntries)}</div>

  <div class="footer">
    Report su ${listings.length} annunci Key Account Manager (bucket adattivo + esclusione outlier IQR).<br>
    © 2026 MC Pharma Consulting S.r.l. · Via Bagutta 13, Milano · P.IVA 14672870962<br>
    <span style="color:${TAN};">LS Job Intelligence</span>
  </div>
</div>
</body></html>`;

  fs.writeFileSync('C:\\Users\\Utente\\Downloads\\INDEX\\LS Intelligence\\scripts\\kam-report.html', html);
  console.log('\n✅ Report generato: scripts/kam-report.html');
}
main();
