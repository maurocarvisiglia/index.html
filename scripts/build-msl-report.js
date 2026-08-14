import fs from 'fs';

const logo = fs.readFileSync('C:\\Users\\Utente\\Downloads\\INDEX\\LS Intelligence\\scripts\\logo-base64.txt', 'utf-8').trim();
const stats = JSON.parse(fs.readFileSync('C:\\Users\\Utente\\Downloads\\INDEX\\LS Intelligence\\scripts\\msl-stats.json', 'utf-8'));

const GOLD='#b8965a', TAN='#c8b89a', DARK='#1c1c1c', CREAM='#faf9f6', BORDER='#e8e0d5', BORDER2='#f0ebe3';
const fmtRal = v => '€' + Math.round(v/1000) + 'k';
const fmtRalFull = v => '€' + v.toLocaleString('it-IT');
const donutColors = ['#b8965a','#1c1c1c','#8a9bb0','#c8b89a','#e8c96a','#5c6b7d'];

const senLabels = {senior_specialist:'Senior Specialist', specialist:'Specialist', lead:'Lead', entry_level:'Entry Level', manager:'Manager', associate:'Associate'};
const taLabels = {oncology:'Oncologia', multiple:'Multi-TA', neurology:'Neurologia', cardiovascular:'Cardiovascolare', diabetes:'Diabete', gastroenterology:'Gastroenterologia', 'non specificata':'Non specificata'};

function barRows(entries, total, colorFn) {
  const max = Math.max(...entries.map(([,c])=>c));
  return entries.map(([label,count], i) => {
    const pct = Math.round((count/max)*100);
    const color = colorFn ? colorFn(i) : GOLD;
    return `<div class="bar-row">
      <div class="bar-label">${label}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${color};"></div></div>
      <div class="bar-count">${count}</div>
    </div>`;
  }).join('');
}

const seniorityRows = stats.seniorityStats.map(s => `
  <tr><td>${senLabels[s.seniority]||s.seniority}</td><td class="num">${s.count}</td><td class="num">${fmtRalFull(s.median)}</td></tr>
`).join('');

const geoEntries = Object.entries(stats.byGeo).sort((a,b)=>b[1]-a[1]);
const taEntries = Object.entries(stats.byTA).map(([k,v]) => [taLabels[k]||k, v]).sort((a,b)=>b[1]-a[1]);
const contractEntries = Object.entries(stats.byContract).map(([k,v]) => [k==='TI'?'Tempo Indeterminato':k==='TD'?'Tempo Determinato':k, v]);
const topEmployerEntries = stats.topEmployers.map(([name, c]) => [name.length > 38 ? name.substring(0,36)+'…' : name, c]);

const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Market Intelligence — Medical Science Liaison</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:Georgia,serif;background:#fff;color:${DARK};}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}@page{margin:15mm 18mm;size:A4;}.page-break{page-break-before:always;}}
.kpi-grid,.salary-bar,.summary-box,.chart-box,table,.header{break-inside:avoid;page-break-inside:avoid;}
tr{break-inside:avoid;page-break-inside:avoid;}
.section-title{break-after:avoid;page-break-after:avoid;}
.page{max-width:900px;margin:0 auto;padding:40px 48px;}
.header{display:flex;justify-content:space-between;align-items:center;padding-bottom:20px;border-bottom:2px solid ${TAN};margin-bottom:36px;}
.kpi-grid{display:grid;gap:1px;background:${BORDER};border:1px solid ${BORDER};border-radius:10px;overflow:hidden;margin:28px 0;}
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
.chart-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#888;margin-bottom:12px;}
.footer{margin-top:40px;padding-top:16px;border-top:1px solid ${BORDER};text-align:center;font-size:10px;color:#aaa;line-height:1.8;}
.bar-row{display:flex;align-items:center;gap:8px;margin-bottom:6px;}
.bar-label{font-size:11px;color:#555;width:170px;flex-shrink:0;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.bar-track{flex:1;background:${BORDER};border-radius:4px;height:14px;overflow:hidden;}
.bar-fill{height:100%;border-radius:4px;}
.bar-count{font-size:11px;font-weight:700;color:${DARK};min-width:28px;}
table{width:100%;border-collapse:collapse;font-size:12px;margin:8px 0 20px;}
th{text-align:left;padding:8px 10px;font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#888;border-bottom:2px solid ${BORDER};}
td{padding:8px 10px;border-bottom:1px solid ${BORDER2};color:#333;}
td.num{text-align:right;font-weight:700;}
.badge-anomaly{display:inline-block;font-size:10px;color:#999;font-style:italic;margin-top:4px;}
.two-col{display:grid;grid-template-columns:1fr 1fr;gap:20px;}
</style>
</head><body>
<div class="page">

  <div class="header">
    <img src="${logo}" style="height:56px;" alt="MC Pharma Consulting"/>
    <div style="text-align:right;">
      <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#888;margin-bottom:4px;">Market Intelligence Report</div>
      <div style="font-size:12px;color:#888;">11 Agosto 2026</div>
    </div>
  </div>

  <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:${GOLD};margin-bottom:10px;">Figura professionale analizzata</div>
  <div style="font-size:36px;font-weight:700;color:${DARK};margin-bottom:4px;letter-spacing:-0.5px;">Medical Science Liaison (MSL)</div>
  <div style="font-size:12px;color:#888;margin-bottom:8px;">Base: <strong>${stats.nListings}</strong> annunci reali · Mercato Italia · Periodo: ${stats.dateRange}</div>
  <div class="badge-anomaly">* ${stats.excludedCount} annunci esclusi dall'analisi per RAL implausibile o mercato non italiano (verifica dati sorgente in corso)</div>

  <div class="section-title">Sintesi esecutiva</div>
  <div class="summary-box">
    Il ruolo di Medical Science Liaison in Italia mostra una domanda concentrata: <strong>${stats.nCompanies} aziende</strong> hanno pubblicato ${stats.nListings} posizioni nel periodo analizzato, con i primi 3 datori di lavoro (AstraZeneca, MSD, Merck) che rappresentano il <strong>${stats.top3Share}%</strong> degli annunci — un segnale di concentrazione della domanda su un numero ristretto di grandi aziende farmaceutiche, tipico dei ruoli specialistici Field-Based ad alta seniority.
    La RAL mediana si attesta a <strong>${fmtRalFull(stats.median)}</strong>, con un range che va da ${fmtRalFull(stats.ralMin)} (profili Specialist junior) a ${fmtRalFull(stats.ralMax)} (Rare Disease / Senior Specialist). Il <strong>${stats.seniorityStats[0].count}</strong> annunci su ${stats.nListings} richiedono livello Senior Specialist, indicando un mercato che assume prevalentemente profili già esperti piuttosto che junior — coerente con la scarsità di talenti qualificati per questo ruolo.
    Geograficamente la domanda è fortemente sbilanciata su <strong>Lombardia</strong> (hub farmaceutico Milano), che raccoglie la maggioranza degli annunci.
  </div>

  <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);">
    <div class="kpi-cell"><div class="kpi-label">Annunci totali</div><div class="kpi-value">${stats.nListings}</div></div>
    <div class="kpi-cell"><div class="kpi-label">Aziende attive</div><div class="kpi-value">${stats.nCompanies}</div></div>
    <div class="kpi-cell"><div class="kpi-label">RAL mediana</div><div class="kpi-value kpi-gold">${fmtRal(stats.median)}</div></div>
    <div class="kpi-cell"><div class="kpi-label">Top 3 datori</div><div class="kpi-value kpi-gold">${stats.top3Share}%</div></div>
  </div>

  <div class="salary-bar">
    <div class="sal-item"><div class="sal-label">Min RAL</div><div class="sal-value" style="color:#ccc;">${fmtRal(stats.ralMin)}</div></div>
    <div class="sal-item"><div class="sal-label">Media</div><div class="sal-value" style="color:#e8c96a;">${fmtRal(stats.avg)}</div></div>
    <div class="sal-item"><div class="sal-label">Mediana</div><div class="sal-value" style="color:${TAN};">${fmtRal(stats.median)}</div></div>
    <div class="sal-item"><div class="sal-label">Max RAL</div><div class="sal-value" style="color:#ccc;">${fmtRal(stats.ralMax)}</div></div>
  </div>

  <div class="section-title">RAL per Seniority Level</div>
  <table>
    <thead><tr><th>Livello</th><th style="text-align:right;">Annunci</th><th style="text-align:right;">RAL Mediana</th></tr></thead>
    <tbody>${seniorityRows}</tbody>
  </table>

  <div class="section-title">Talent Scarcity — Concentrazione Datori di Lavoro</div>
  <div class="chart-box">
    <div class="chart-title">Top datori (${stats.nCompanies} aziende attive, top 3 = ${stats.top3Share}% degli annunci)</div>
    ${barRows(topEmployerEntries)}
  </div>
  <div class="summary-box" style="font-size:12px;">
    <strong>Indice di scarsità: ALTO.</strong> Con solo ${stats.nCompanies} aziende attive su ${stats.nListings} annunci e una concentrazione del ${stats.top3Share}% su 3 datori, il pool di potenziali datori di lavoro è ristretto. Combinato con la prevalenza di richieste Senior Specialist (${stats.seniorityStats[0].count}/${stats.nListings}), questo indica un mercato competitivo per l'acquisizione di talenti MSL esperti — tempi di ricerca e retention più critici rispetto a ruoli commerciali generalisti.
  </div>

  <div class="section-title">Area Geografica</div>
  <div class="chart-box">
    ${barRows(geoEntries)}
  </div>

  <div class="two-col">
    <div>
      <div class="section-title">Area Terapeutica</div>
      <div class="chart-box">
        ${barRows(taEntries, null, (i)=>donutColors[i%donutColors.length])}
      </div>
    </div>
    <div>
      <div class="section-title">Tipo Contratto</div>
      <div class="chart-box">
        ${barRows(contractEntries, null, (i)=>donutColors[i%donutColors.length])}
      </div>
    </div>
  </div>

  <div class="section-title">Implicazione Operativa</div>
  <div class="summary-box">
    Per una ricerca MSL efficace in Italia, il posizionamento RAL competitivo si colloca tra ${fmtRal(stats.seniorityStats.find(s=>s.seniority==='specialist')?.median||stats.ralMin)} (Specialist) e ${fmtRal(stats.seniorityStats.find(s=>s.seniority==='senior_specialist')?.median||stats.median)} (Senior Specialist). Data l'alta concentrazione su poche aziende e la scarsità di profili senior disponibili, si raccomanda una strategia di sourcing proattiva (non solo reattiva agli annunci) e tempi di selezione più lunghi rispetto alla media Life Sciences, specialmente per aree terapeutiche di nicchia (Rare Disease, Oncologia) dove il pool di candidati qualificati è ulteriormente ridotto.
  </div>

  <div class="footer">
    Questo report è generato sull'analisi di <strong>${stats.nListings}</strong> annunci reali presenti online per il settore Life Sciences (ruolo: Medical Science Liaison, mercato Italia).<br>
    © 2026 MC Pharma Consulting S.r.l. · Via Bagutta 13, Milano · P.IVA 14672870962<br>
    <span style="color:${TAN};">LS Job Intelligence</span>
  </div>
</div>
</body></html>`;

fs.writeFileSync('C:\\Users\\Utente\\Downloads\\INDEX\\LS Intelligence\\scripts\\msl-benchmark-report.html', html);
console.log('✅ Report generato: scripts/msl-benchmark-report.html');
console.log(`Dimensione: ${(html.length/1024).toFixed(0)} KB`);
