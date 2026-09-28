# Scansione giornaliera della Posta Inviata (Outlook) - richiesta da Mauro il
# 28/09/2026: sapere quando un'azienda e' stata contattata l'ultima volta, per
# non riproporla nel Piano di Contatto trimestrale se e' gia' stata scritta di
# recente ("ultimo contatto che il sistema pesca giornalmente dalla mia posta
# inviata").
#
# Scarica dalla cartella Posta Inviata di Outlook (via COM, stesso meccanismo
# gia' usato in questa sessione per gli scan precedenti) le email degli ultimi
# $Giorni giorni - 3 di default, non 1: se il PC resta spento un giorno o il
# task scheduler salta un'esecuzione, la finestra di sovrapposizione evita
# buchi. E' sicuro ri-scansionare gli stessi giorni piu' volte: l'inserimento
# lato Supabase e' idempotente (vincolo unique su azienda+destinatario+data).
#
# Scrive un JSON TEMPORANEO fuori dal repository ($env:TEMP), MAI dentro il
# progetto - contiene indirizzi email reali, stessa disciplina gia' seguita
# per gli altri dump Outlook di questa sessione. Il file viene poi letto e
# CANCELLATO da scripts/associa-posta-giornaliera.mjs, che fa l'abbinamento
# dominio->azienda e la scrittura su Supabase (direzione "inviata" - la
# risposta del cliente e' scripts/scansione-posta-ricevuta.ps1, dominio
# "ricevuta", stesso script Node).
#
# Uso:
#   powershell -File scripts\scansione-posta-inviata.ps1            misura (chiama il node script senza --apply)
#   powershell -File scripts\scansione-posta-inviata.ps1 -Apply     scrive davvero
#   powershell -File scripts\scansione-posta-inviata.ps1 -Giorni 7  finestra piu' ampia (es. primo avvio)

param(
    [int]$Giorni = 3,
    [switch]$Apply
)

$radice  = Split-Path -Parent $MyInvocation.MyCommand.Path | Split-Path -Parent
$logDir  = Join-Path $radice "logs-avvio"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log     = Join-Path $logDir ("posta-inviata-" + (Get-Date -Format "yyyy-MM-dd") + ".log")
$dumpPath = Join-Path $env:TEMP "ls-intelligence-posta-inviata.json"

function Scrivi($testo) {
    $riga = (Get-Date -Format "HH:mm:ss") + "  " + $testo
    Add-Content -Path $log -Value $riga -Encoding UTF8
    Write-Host $riga
}

Scrivi "=== scansione Posta Inviata (ultimi $Giorni giorni) ==="

try {
    $outlook = New-Object -ComObject Outlook.Application
    $namespace = $outlook.GetNamespace("MAPI")
    $postaInviata = $namespace.GetDefaultFolder(5)  # olFolderSentMail
    $items = $postaInviata.Items
    $items.Sort("[SentOn]", $true)  # decrescente: piu' recenti prima
} catch {
    Scrivi "ERRORE: impossibile aprire Outlook via COM - $($_.Exception.Message)"
    exit 1
}

$cutoff = (Get-Date).AddDays(-$Giorni)
$risultati = New-Object System.Collections.Generic.List[object]

foreach ($item in $items) {
    if ($item.SentOn -lt $cutoff) { break }  # ordinati decrescente: da qui in poi solo piu' vecchi
    if ($item.Class -ne 43) { continue }  # 43 = olMail, salta appuntamenti/altro finito in Sent per errore

    $destinatari = New-Object System.Collections.Generic.List[string]
    foreach ($recip in $item.Recipients) {
        if ($recip.Type -ne 1 -and $recip.Type -ne 2) { continue }  # solo To (1) e CC (2)
        $smtp = $null
        try {
            if ($recip.AddressEntry.AddressEntryUserType -eq 0) {
                $smtp = $recip.AddressEntry.GetExchangeUser().PrimarySmtpAddress
            }
        } catch {}
        if (-not $smtp) { try { $smtp = $recip.AddressEntry.Address } catch {} }
        if ($smtp -and $smtp -like "*@*") { $destinatari.Add($smtp.ToLower()) }
    }
    if ($destinatari.Count -eq 0) { continue }

    $risultati.Add([PSCustomObject]@{
        oggetto   = $item.Subject
        dataInvio = $item.SentOn.ToString("o")
        contatti  = $destinatari
    })
}

Scrivi "email trovate negli ultimi $Giorni giorni: $($risultati.Count)"

$risultati | ConvertTo-Json -Depth 4 | Out-File -FilePath $dumpPath -Encoding utf8
Scrivi "dump scritto: $dumpPath"

$argomenti = @("scripts\associa-posta-giornaliera.mjs", "--direzione=inviata")
if ($Apply) { $argomenti += "--apply" }

Push-Location $radice
try {
    $output = & node @argomenti 2>&1
    $output | ForEach-Object { Scrivi $_ }
} finally {
    Pop-Location
}

Scrivi "=== fine scansione ==="
