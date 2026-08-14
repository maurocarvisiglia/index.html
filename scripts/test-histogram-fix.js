import fs from 'fs';
const listings = JSON.parse(fs.readFileSync('C:\\Users\\Utente\\Downloads\\INDEX\\LS Intelligence\\scripts\\msl-data-correct.json', 'utf-8'));

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
  return{kept,excludedCount:withVal.length-kept.length,lowerFence,upperFence};
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

const result = computeRalHistogram(listings);
console.log('PRIMA (bucket fisso 5000): avrebbe prodotto ~' + Math.ceil((219000-29000)/5000) + ' bucket\n');
console.log('DOPO:');
console.log(`Bucket totali: ${result.buckets.length}`);
console.log(`Annunci nel grafico: ${result.total} | Esclusi come outlier: ${result.excludedCount}`);
console.log('\nBucket:');
result.buckets.forEach(b => console.log(`  €${b.from/1000}k-${b.to/1000}k: ${b.count}`));

const outliers = filterRalOutlierListings(listings);
console.log(`\nSoglia IQR: escludere sotto €${Math.round(outliers.lowerFence)} o sopra €${Math.round(outliers.upperFence)}`);
console.log('Record esclusi:');
listings.filter(l => (l.ral_min && l.ral_max) && !outliers.kept.includes(l)).forEach(l => {
  const mid = (l.ral_min+l.ral_max)/2;
  console.log(`  "${l.job_title}" — ${l.company_name} — RAL midpoint €${mid}`);
});
