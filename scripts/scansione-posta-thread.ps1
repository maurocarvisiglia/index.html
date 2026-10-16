# Scansione posta per l'AGENTE DI TRACCIAMENTO SCAMBI (richiesta Mauro 16/10/2026)
# =============================================================================
# Legge da Outlook TUTTE le cartelle di posta (ricorsivo) a partire da una data
# (default 1/09/2026), non solo Inbox/Inviata: le risposte dei clienti sono
# spesso archiviate in sottocartelle di progetto, e senza girarle tutte lo
# scambio risultava "senza risposta".
#
# Per ogni mail tiene il CORPO NUOVO (non la cronologia citata) e il topic di
# conversazione per raggruppare i thread. La DIREZIONE e' derivata dal mittente:
# se il dominio del mittente e' mcpharmaconsulting.it => 'inviata' (contatti =
# destinatari To+CC), altrimenti 'ricevuta' (contatti = mittente).
#
# Dump JSON temporaneo FUORI dal repository (%TEMP%, mai committato). E' di sola
# LETTURA su Outlook: non invia, non sposta, non cancella nulla.
#
# Uso:
#   powershell -File scripts\scansione-posta-thread.ps1
#   powershell -File scripts\scansione-posta-thread.ps1 -DataInizio 2026-09-01

param(
    [string]$DataInizio = "2026-09-01",
    [int]$MaxTesto = 4000,
    [string]$DominioInterno = "mcpharmaconsulting.it",
    [int]$MaxItemCartella = 8000   # salta cartelle-archivio enormi (log il nome)
)

$radice   = Split-Path -Parent $MyInvocation.MyCommand.Path | Split-Path -Parent
$logDir   = Join-Path $radice "logs-avvio"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log      = Join-Path $logDir ("posta-thread-" + (Get-Date -Format "yyyy-MM-dd") + ".log")
$dumpPath = Join-Path $env:TEMP "ls-intelligence-posta-thread.json"
$cutoff   = [datetime]::Parse($DataInizio)

function Scrivi($testo) {
    $riga = (Get-Date -Format "HH:mm:ss") + "  " + $testo
    Add-Content -Path $log -Value $riga -Encoding UTF8
    Write-Host $riga
}

$marcatoriCitazione = @(
    '^Da:\s', '^From:\s', '^-{3,}\s*Original Message', '^-{3,}\s*Messaggio originale',
    '^Il .* ha scritto:', '^On .* wrote:', '^Le .* a ecrit', '^El .* escribio'
)
function TestoNuovo($corpo, $max) {
    if (-not $corpo) { return '' }
    $righe = $corpo -split "`r?`n"
    $limite = [Math]::Min($righe.Count, 80)
    $fine = $limite
    for ($i = 0; $i -lt $limite; $i++) {
        foreach ($marcatore in $marcatoriCitazione) { if ($righe[$i] -match $marcatore) { $fine = $i; break } }
        if ($fine -ne $limite) { break }
    }
    if ($fine -le 0) { return '' }
    $testo = $righe[0..($fine - 1)] -join "`n"
    return $testo.Substring(0, [Math]::Min($max, $testo.Length))
}

# Cartelle di sistema da NON scandire (bozze/eliminata/indesiderata/uscita/sync).
$cartelleEscluse = @(
    'deleted items', 'posta eliminata', 'junk email', 'posta indesiderata',
    'drafts', 'bozze', 'outbox', 'posta in uscita', 'sync issues', 'problemi di sincronizzazione',
    'conversation history', 'cronologia conversazioni', 'rss feeds', 'rss subscriptions'
)

Scrivi "=== scansione posta thread (tutte le cartelle) dal $DataInizio ==="
try {
    $outlook = New-Object -ComObject Outlook.Application
    $ns = $outlook.GetNamespace("MAPI")
    $root = $ns.DefaultStore.GetRootFolder()
} catch {
    Scrivi "ERRORE: impossibile aprire Outlook via COM - $($_.Exception.Message)"
    exit 1
}

# Raccoglie ricorsivamente solo le cartelle di posta (DefaultItemType 0 = olMailItem).
$cartelle = New-Object System.Collections.Generic.List[object]
function RaccogliCartelle($folder) {
    foreach ($sub in $folder.Folders) {
        $nome = ([string]$sub.Name).ToLower()
        if ($cartelleEscluse -contains $nome) { continue }
        try { if ($sub.DefaultItemType -eq 0) { $cartelle.Add($sub) } } catch {}
        RaccogliCartelle $sub
    }
}
RaccogliCartelle $root
Scrivi "cartelle di posta trovate: $($cartelle.Count)"

$risultati = New-Object System.Collections.Generic.List[object]
$dominioInt = $DominioInterno.ToLower()

# SMTP robusto da un AddressEntry: prima la proprieta' MAPI PR_SMTP_ADDRESS
# (0x39FE001E), che restituisce l'indirizzo vero anche per gli utenti Exchange
# senza dover chiamare GetExchangeUser() — che sotto carico fallisce e ripiega
# sul DN "/O=.../CN=...". Poi i fallback.
$PR_SMTP = "http://schemas.microsoft.com/mapi/proptag/0x39FE001E"
function SmtpDaAddressEntry($ae) {
    if (-not $ae) { return $null }
    $smtp = $null
    try { $smtp = $ae.PropertyAccessor.GetProperty($PR_SMTP) } catch {}
    if (-not $smtp -or $smtp -notlike "*@*") { try { if ($ae.AddressEntryUserType -eq 0) { $smtp = $ae.GetExchangeUser().PrimarySmtpAddress } } catch {} }
    if (-not $smtp -or $smtp -notlike "*@*") { try { $smtp = $ae.Address } catch {} }
    return $smtp
}
function SmtpMittente($item) {
    $m = $null
    try { $m = SmtpDaAddressEntry $item.Sender } catch {}
    if (-not $m -or $m -notlike "*@*") { try { $m = $item.SenderEmailAddress } catch {} }
    return $m
}
function DestinatariDi($item) {
    $dest = New-Object System.Collections.Generic.List[string]
    foreach ($recip in $item.Recipients) {
        if ($recip.Type -ne 1 -and $recip.Type -ne 2) { continue }
        $smtp = SmtpDaAddressEntry $recip.AddressEntry
        if ($smtp -and $smtp -like "*@*") { $dest.Add($smtp.ToLower()) }
    }
    return $dest
}

# EntryID della cartella Posta Inviata: li' ogni item e' per definizione nostro
# in uscita, anche quando la risoluzione Exchange del mittente non da' un indirizzo
# con la @ (DN tipo /O=.../CN=...). Senza questo, i ~400 invii a freddo in Posta
# Inviata venivano scartati.
$sentEntryId = $null
try { $sentEntryId = [string]$ns.GetDefaultFolder(5).EntryID } catch {}

$visti = @{}   # EntryID -> $true, per non contare due volte lo stesso messaggio
foreach ($cartella in $cartelle) {
    $eSent = ($sentEntryId -and ([string]$cartella.EntryID -eq $sentEntryId))
    $items = $cartella.Items
    $conteggio = 0
    try { $conteggio = $items.Count } catch {}
    if ($conteggio -gt $MaxItemCartella) { Scrivi "  salto cartella grande '$($cartella.Name)' ($conteggio item)"; continue }
    foreach ($item in $items) {
        if ($item.Class -ne 43) { continue }   # 43 = olMail
        $data = $null
        try { $data = $item.ReceivedTime } catch {}
        if (-not $data) { try { $data = $item.SentOn } catch {} }
        if (-not $data -or $data -lt $cutoff) { continue }
        $eid = $null; try { $eid = [string]$item.EntryID } catch {}
        if ($eid -and $visti.ContainsKey($eid)) { continue }
        if ($eid) { $visti[$eid] = $true }

        if ($eSent) {
            # Posta Inviata: i nostri invii (destinatari risolti bene qui).
            $dest = DestinatariDi $item
            if ($dest.Count -eq 0) { continue }
            $risultati.Add([PSCustomObject]@{
                direzione = "inviata"; oggetto = [string]$item.Subject; dataInvio = $data.ToString("o")
                contatti = $dest; nomeMittente = $null; conversazione = [string]$item.ConversationTopic
                testo = (TestoNuovo $item.Body $MaxTesto)
            })
        } else {
            # Qualunque altra cartella: tengo solo i messaggi con mittente ESTERNO
            # (= risposte dei clienti, ovunque archiviate). Le mie copie filtrate
            # nei progetti hanno mittente interno e si saltano: l'originale e' gia'
            # in Posta Inviata.
            $mittente = SmtpMittente $item
            if (-not $mittente -or $mittente -notlike "*@*") { continue }
            $mittente = $mittente.ToLower()
            $dominioMitt = ($mittente -split "@")[-1]
            if ($dominioMitt -eq $dominioInt) { continue }
            $nome = $null; try { $nome = $item.SenderName } catch {}
            $risultati.Add([PSCustomObject]@{
                direzione = "ricevuta"; oggetto = [string]$item.Subject; dataInvio = $data.ToString("o")
                contatti = @($mittente); nomeMittente = $nome; conversazione = [string]$item.ConversationTopic
                testo = (TestoNuovo $item.Body $MaxTesto)
            })
        }
    }
}

$inv = ($risultati | Where-Object { $_.direzione -eq 'inviata' }).Count
$ric = ($risultati | Where-Object { $_.direzione -eq 'ricevuta' }).Count
Scrivi "email raccolte: $($risultati.Count) (inviate $inv, ricevute $ric)"
$risultati | ConvertTo-Json -Depth 4 | Out-File -FilePath $dumpPath -Encoding utf8
Scrivi "dump scritto: $dumpPath"
Scrivi "=== fine scansione ==="
