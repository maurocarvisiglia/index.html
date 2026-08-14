import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { count: total } = await supabase.from('job_listings').select('*', { count: 'exact', head: true });
const { count: nullCount } = await supabase.from('job_listings').select('*', { count: 'exact', head: true }).is('contract_type', null);
console.log(`NULL: ${nullCount} / ${total} (${((nullCount/total)*100).toFixed(1)}%)`);
