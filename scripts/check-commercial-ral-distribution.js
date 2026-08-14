import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: jobs } = await supabase
    .from('job_listings')
    .select('id, job_title, ral_min, ral_max, salary_text')
    .eq('functional_area_v2', 'commercial')
    .is('seniority_v2', null)
    .not('ral_max', 'is', null);

  console.log(`Con RAL disponibile: ${jobs.length}\n`);

  const vals = jobs.map(j => (j.ral_min + j.ral_max) / 2).sort((a,b) => a-b);
  console.log(`Min: €${vals[0]}`);
  console.log(`P25: €${vals[Math.floor(vals.length*0.25)]}`);
  console.log(`Mediana: €${vals[Math.floor(vals.length*0.5)]}`);
  console.log(`P75: €${vals[Math.floor(vals.length*0.75)]}`);
  console.log(`P90: €${vals[Math.floor(vals.length*0.90)]}`);
  console.log(`Max: €${vals[vals.length-1]}`);

  console.log('\nDistribuzione a fasce:');
  const bands = [[0,25000],[25000,30000],[30000,35000],[35000,40000],[40000,45000],[45000,50000],[50000,60000],[60000,999999]];
  bands.forEach(([lo,hi]) => {
    const count = vals.filter(v => v>=lo && v<hi).length;
    console.log(`   €${lo/1000}k-${hi/1000===999.999?'+':hi/1000}k: ${count}`);
  });

  console.log('\nEsempi con RAL più alta (top 15)...');
  jobs.sort((a,b) => ((b.ral_min+b.ral_max)/2) - ((a.ral_min+a.ral_max)/2)).slice(0,15).forEach(j => {
    console.log(`   €${j.ral_min}-${j.ral_max} "${j.job_title}"`);
  });
}
run();
