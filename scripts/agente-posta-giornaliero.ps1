# AGENTE POSTA - giro giornaliero (richiesto Mauro 16/10/2026, ore 20:00)
# =============================================================================
# 1) scansiona da Outlook le mail commerciali e le risposte dei clienti degli
#    ultimi -Giorni (default 14) di TUTTE le cartelle;
# 2) estrae le info chiave via CORE e ARCHIVIA in LS Job Intelligence
#    (company_visite, fonte='email_auto', una voce per thread, aggiornata).
#
# Finestra di 14 giorni: abbastanza ampia da riprendere un thread che si evolve
# in piu' giorni (l'upsert per thread aggiorna la voce invece di duplicarla).
#
# Uso:  powershell -File scripts\agente-posta-giornaliero.ps1
# Pianificato come attivita' di Windows alle 20:00.

param([int]$Giorni = 14)

$radice = Split-Path -Parent $MyInvocation.MyCommand.Path | Split-Path -Parent
$logDir = Join-Path $radice "logs-avvio"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log    = Join-Path $logDir ("agente-posta-" + (Get-Date -Format "yyyy-MM-dd") + ".log")

function Scrivi($t) { $r = (Get-Date -Format "HH:mm:ss") + "  " + $t; Add-Content -Path $log -Value $r -Encoding UTF8; Write-Host $r }

$inizio = (Get-Date).AddDays(-$Giorni).ToString("yyyy-MM-dd")
Scrivi "=== agente posta giornaliero (ultimi $Giorni giorni, dal $inizio) ==="

# 1) scansione Outlook
$scanner = Join-Path $radice "scripts\scansione-posta-thread.ps1"
& powershell -ExecutionPolicy Bypass -File $scanner -DataInizio $inizio 2>&1 | ForEach-Object { Scrivi $_ }

# 2) estrazione + archiviazione automatica
Push-Location $radice
try {
    $out = & node "scripts\agente-posta-applica.mjs" --account=Mauro --auto 2>&1
    $out | ForEach-Object { Scrivi $_ }
} finally { Pop-Location }

Scrivi "=== fine agente posta giornaliero ==="
