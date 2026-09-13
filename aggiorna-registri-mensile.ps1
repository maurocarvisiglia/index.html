# Aggiornamento mensile dei registri pubblici gia' importati (AIFA farmaci,
# Repertorio Dispositivi Medici, Registro Integratori Alimentari, Banca Dati
# Farmaci Veterinari, Certificati EDQM principi attivi) — richiesto da Mauro
# l'8/09/2026 dopo l'import iniziale degli integratori. Ogni script e'
# idempotente (scriviLotti/chiaveProdotto dedup su company_id+brand_name): un
# rilancio mensile aggiunge solo i prodotti NUOVI comparsi nel frattempo nei
# registri, non duplica nulla.
#
# principi-attivi-edqm.mjs aggiunto il 13/09/2026: la diagnostica generale
# degli strumenti di arricchimento ("il sistema fa una chiamata giornaliera a
# tutti gli strumenti?") ha trovato che questo script, pur essendo un registro
# pubblico allo stesso titolo degli altri quattro, non era mai stato incluso
# in questa pianificazione — restava scritto solo per lancio manuale.
#
# Registrato come attivita' pianificata di Windows "LS Intelligence -
# Aggiornamento mensile registri" (mensile, giorno 3 alle 04:00 — dopo la
# mezzanotte per lasciare margine ai registri di pubblicare l'aggiornamento
# del mese, prima dell'orario di lavoro).

$ErrorActionPreference = 'Continue'
Set-Location "C:\Users\Utente\Downloads\INDEX\LS Intelligence"

$logDir = "C:\Users\Utente\Downloads\INDEX\LS Intelligence\logs-avvio"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
$logFile = Join-Path $logDir ("registri-mensile-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".log")

function Run-Script($nome, $script) {
    Add-Content -Path $logFile -Value "`n===== $nome — $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ====="
    node $script --apply *>> $logFile
    Add-Content -Path $logFile -Value "===== $nome completato (exit code $LASTEXITCODE) ====="
}

Add-Content -Path $logFile -Value "Aggiornamento mensile registri — avviato $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"

Run-Script "AIFA farmaci"                "scripts\aifa-registro-prodotti.mjs"
Run-Script "Repertorio Dispositivi Medici" "scripts\dispositivi-medici-registro.mjs"
Run-Script "Registro Integratori Alimentari" "scripts\integratori-registro.mjs"
Run-Script "Banca Dati Farmaci Veterinari" "scripts\farmaci-veterinari-registro.mjs"
Run-Script "Certificati EDQM principi attivi" "scripts\principi-attivi-edqm.mjs"

Add-Content -Path $logFile -Value "`nAggiornamento mensile registri — completato $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
