# Arricchimento giornaliero a costo zero di LS Intelligence (11/10/2026).
#
# Perche' esiste: i cron di Vercel hanno un tetto di 60 secondi e fanno 3-8 aziende a notte; con
# ~1.800 aree terapeutiche e ~1.350 prodotti da recuperare non finirebbero mai. Qui gli stessi
# script girano dal PC con un tempo molto piu' lungo (40 minuti ciascuno).
#
#   1. Aree terapeutiche (Gemini tramite /api/gemini-proxy: usa la chiave di Vercel)
#   2. Prodotti dal sito ufficiale (CORE, policy gratuita)
#   3. Ricerca persone Apollo, SOLO la parte gratuita (niente crediti)
#
# L'arricchimento a pagamento via CORE ha la sua attivita' (alle 16:04) e non e' toccato qui.
# Il file deve restare in puro ASCII: PowerShell 5.1 legge male l'UTF-8 senza BOM.

$ErrorActionPreference = 'Continue'
Set-Location "C:\Users\Utente\Downloads\INDEX\LS Intelligence"

$logDir = "C:\Users\Utente\Downloads\INDEX\LS Intelligence\logs-avvio"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
$logFile = Join-Path $logDir ("arricchimento-gratuito-" + (Get-Date -Format "yyyyMMdd") + ".log")

function Esegui($nome, $argomenti) {
    Add-Content -Path $logFile -Value ("`n===== " + $nome + " - " + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + " =====")
    & node @argomenti *>> $logFile
    Add-Content -Path $logFile -Value ("===== " + $nome + " finito (exit " + $LASTEXITCODE + ") =====")
}

$env:GEMINI_PROXY_URL = "https://ls-job-intelligence.vercel.app/api/gemini-proxy"
$env:TA_DAILY_LIMIT = "300"
$env:TA_TIME_BUDGET_MS = "2400000"
Esegui "Aree terapeutiche" @("extract-ta-agent.js")

$env:PRODOTTI_TIME_BUDGET_MS = "2400000"
Esegui "Prodotti dal sito" @("scripts/core-prodotti-giornaliero.mjs", "--n=120", "--apply")

$env:APOLLO_TIME_BUDGET_MS = "1500000"
Esegui "Apollo persone (gratis)" @("scripts/apollo-unificato-giornaliero.mjs", "--apply", "--solo-gratis", "--n=100")
