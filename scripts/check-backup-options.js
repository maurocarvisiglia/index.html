import dotenv from 'dotenv';
dotenv.config();

// Extract project ref from SUPABASE_URL
const url = process.env.SUPABASE_URL;
const projectRef = url.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];

console.log('🔍 SUPABASE PROJECT INFO\n');
console.log('═'.repeat(70));
console.log(`\nProject URL: ${url}`);
console.log(`Project Ref: ${projectRef}`);
console.log('\n📋 PER VERIFICARE I BACKUP DISPONIBILI:');
console.log(`\n1. Vai su: https://supabase.com/dashboard/project/${projectRef}/database/backups`);
console.log('2. Controlla se vedi backup giornalieri o Point-in-Time Recovery (PITR)');
console.log('\nNOTA IMPORTANTE:');
console.log('- Il piano FREE di Supabase NON include backup automatici');
console.log('- Il piano PRO include 7 giorni di backup giornalieri');
console.log('- PITR (Point-in-Time Recovery) è un add-on a pagamento separato');
console.log('\nSe vedi backup disponibili con data PRIMA di oggi, possiamo');
console.log('usarli per verificare/recuperare i valori originali.\n');
