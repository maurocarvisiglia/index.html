# Scansione giornaliera della Posta in Arrivo (Outlook) - richiesta da Mauro
# il 28/09/2026: sapere anche QUANDO un cliente ha risposto, non solo quando
# gli abbiamo scritto ("implementiamo anche se il cliente ci risponde").
#
# Stesso meccanismo di scripts/scansione-posta-inviata.ps1 (vedi i commenti
# li' per la logica di finestra/idempotenza/pulizia del dump), speculare sul
# MITTENTE invece che sui destinatari: qui interessa chi ci ha scritto, non a
# chi abbiamo scritto.
#
# Scrive in company_email_log con direzione='ricevuta' tramite lo stesso
# script Node scripts/associa-posta-giornaliera.mjs usato per la Posta
# Inviata (--direzione=ricevuta).
#
# Uso:
#   powershell -File scripts\scansione-posta-ricevuta.ps1            misura
#   powershell -File scripts\scansione-posta-ricevuta.ps1 -Apply     scrive davvero
#   powershell -File scripts\scansione-posta-ricevuta.ps1 -Giorni 7  finestra piu' ampia

param(
    [int]$Giorni = 3,
    [switch]$Apply
)

$radice  = Split-Path -Parent $MyInvocation.MyCommand.Path | Split-Path -Parent
$logDir  = Join-Path $radice "logs-avvio"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log     = Join-Path $logDir ("posta-ricevuta-" + (Get-Date -Format "yyyy-MM-dd") + ".log")
$dumpPath = Join-Path $env:TEMP "ls-intelligence-posta-ricevuta.json"

function Scrivi($testo) {
    $riga = (Get-Date -Format "HH:mm:ss") + "  " + $testo
    Add-Content -Path $log -Value $riga -Encoding UTF8
    Write-Host $riga
}

Scrivi "=== scansione Posta in Arrivo (ultimi $Giorni giorni) ==="

try {
    $outlook = New-Object -ComObject Outlook.Application
    $namespace = $outlook.GetNamespace("MAPI")
    $postaArrivo = $namespace.GetDefaultFolder(6)  # olFolderInbox
    $items = $postaArrivo.Items
    $items.Sort("[ReceivedTime]", $true)  # decrescente: piu' recenti prima
} catch {
    Scrivi "ERRORE: impossibile aprire Outlook via COM - $($_.Exception.Message)"
    exit 1
}

$cutoff = (Get-Date).AddDays(-$Giorni)
$risultati = New-Object System.Collections.Generic.List[object]

foreach ($item in $items) {
    if ($item.ReceivedTime -lt $cutoff) { break }  # ordinati decrescente: da qui in poi solo piu' vecchi
    if ($item.Class -ne 43) { continue }  # 43 = olMail, salta appuntamenti/altro finito in Inbox per errore

    $mittente = $null
    try {
        if ($item.SenderEmailType -eq "EX") {
            $mittente = $item.Sender.GetExchangeUser().PrimarySmtpAddress
        }
    } catch {}
    if (-not $mittente) { try { $mittente = $item.SenderEmailAddress } catch {} }
    if (-not $mittente -or $mittente -notlike "*@*") { continue }

    $risultati.Add([PSCustomObject]@{
        oggetto   = $item.Subject
        dataInvio = $item.ReceivedTime.ToString("o")
        contatti  = @($mittente.ToLower())
    })
}

Scrivi "email trovate negli ultimi $Giorni giorni: $($risultati.Count)"

$risultati | ConvertTo-Json -Depth 4 | Out-File -FilePath $dumpPath -Encoding utf8
Scrivi "dump scritto: $dumpPath"

$argomenti = @("scripts\associa-posta-giornaliera.mjs", "--direzione=ricevuta")
if ($Apply) { $argomenti += "--apply" }

Push-Location $radice
try {
    $output = & node @argomenti 2>&1
    $output | ForEach-Object { Scrivi $_ }
} finally {
    Pop-Location
}

Scrivi "=== fine scansione ==="
