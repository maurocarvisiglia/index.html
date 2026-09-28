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
# ESCLUSE le risposte automatiche (fuori sede/auto-reply): trovato un caso
# reale il 28/09/2026 - un "Automatic reply" di Ecolab e una "Risposta
# automatica" di Flamma erano stati contati come vere risposte del cliente,
# rimettendo per errore due aziende gia' seguite tra le "da fare". Un
# autoresponder non e' un cliente che ha risposto, va scartato prima di
# scrivere il dump.
#
# Include anche il testo della risposta (solo la parte nuova, non la
# cronologia citata sotto) e il nome del mittente: scripts/associa-posta-
# giornaliera.mjs cerca li' un numero di telefono/cellulare (richiesto da
# Mauro il 28/09/2026 - "se nelle risposte ci sono i numeri li dobbiamo
# importare") e lo scrive su company_contacts.telefono.
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

# Prefissi oggetto noti degli autoresponder (fuori sede/risposta automatica),
# piu' lingue perche' i contatti sono aziende internazionali. Confronto
# case-insensitive, solo sull'inizio dell'oggetto.
$prefissiAutoReply = @(
    "automatic reply:", "auto reply:", "auto-reply:", "out of office",
    "risposta automatica:", "fuori sede",
    "abwesenheitsnotiz", "automatische antwort",
    "reponse automatique", "absence du bureau",
    "respuesta automatica", "fuera de la oficina"
)
$ignorateAutoReply = 0

# Righe che segnano l'inizio della cronologia citata: dove tagliare il corpo
# per tenere solo il testo NUOVO scritto dal mittente (la firma con eventuale
# telefono sta li', non nella cronologia sotto). Piu' lingue, stesso motivo
# dei prefissi auto-reply sopra.
$marcatoriCitazione = @(
    '^Da:\s', '^From:\s', '^-{3,}\s*Original Message', '^-{3,}\s*Messaggio originale',
    '^Il .* ha scritto:', '^On .* wrote:', '^Le .* a ecrit', '^El .* escribio'
)

function TestoNuovo($corpo) {
    if (-not $corpo) { return '' }
    $righe = $corpo -split "`r?`n"
    $limite = [Math]::Min($righe.Count, 40)
    $fine = $limite
    for ($i = 0; $i -lt $limite; $i++) {
        foreach ($marcatore in $marcatoriCitazione) {
            if ($righe[$i] -match $marcatore) { $fine = $i; break }
        }
        if ($fine -ne $limite) { break }
    }
    if ($fine -le 0) { return '' }  # 0..-1 in PowerShell non e' un range vuoto: va gestito a parte
    $testo = $righe[0..($fine - 1)] -join "`n"
    return $testo.Substring(0, [Math]::Min(2000, $testo.Length))
}

foreach ($item in $items) {
    if ($item.ReceivedTime -lt $cutoff) { break }  # ordinati decrescente: da qui in poi solo piu' vecchi
    if ($item.Class -ne 43) { continue }  # 43 = olMail, salta appuntamenti/altro finito in Inbox per errore

    $oggetto = [string]$item.Subject
    $eAutoReply = $false
    foreach ($prefisso in $prefissiAutoReply) {
        if ($oggetto.ToLower().StartsWith($prefisso)) { $eAutoReply = $true; break }
    }
    if (-not $eAutoReply -and $item.MessageClass -like "*OofTemplate*") { $eAutoReply = $true }
    if (-not $eAutoReply) {
        # Segnale standard RFC 3834, indipendente dalla lingua dell'oggetto:
        # gli autoresponder Exchange/Outlook impostano questa intestazione.
        try {
            $headers = $item.PropertyAccessor.GetProperty("http://schemas.microsoft.com/mapi/proptag/0x007D001F")
            if ($headers -match "(?im)^Auto-Submitted:\s*auto-(replied|generated)") { $eAutoReply = $true }
        } catch {}
    }
    if ($eAutoReply) { $ignorateAutoReply++; continue }

    $mittente = $null
    try {
        if ($item.SenderEmailType -eq "EX") {
            $mittente = $item.Sender.GetExchangeUser().PrimarySmtpAddress
        }
    } catch {}
    if (-not $mittente) { try { $mittente = $item.SenderEmailAddress } catch {} }
    if (-not $mittente -or $mittente -notlike "*@*") { continue }

    $nomeMittente = $null
    try { $nomeMittente = $item.SenderName } catch {}

    $risultati.Add([PSCustomObject]@{
        oggetto      = $oggetto
        dataInvio    = $item.ReceivedTime.ToString("o")
        contatti     = @($mittente.ToLower())
        nomeMittente = $nomeMittente
        testo        = TestoNuovo $item.Body
    })
}
Scrivi "risposte automatiche (fuori sede/auto-reply) escluse: $ignorateAutoReply"

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
