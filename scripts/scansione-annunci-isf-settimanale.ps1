# Wrapper settimanale: scansione annunci ISF -> company_annunci
# Lanciato dall'attivita' pianificata "Scansione annunci ISF - settimanale".
$ErrorActionPreference = 'Stop'
$proj = 'C:\Users\Utente\Downloads\INDEX\LS Intelligence'
$node = 'C:\Program Files\nodejs\node.exe'
$log  = Join-Path $proj 'logs-avvio\annunci-isf.log'
Set-Location $proj
"==== $(Get-Date -Format 'yyyy-MM-dd HH:mm') : avvio scansione annunci ISF ====" | Out-File -FilePath $log -Append -Encoding UTF8
& $node 'scripts/scansione-annunci-isf.mjs' '--apply' *>> $log
"==== fine (exit $LASTEXITCODE) ====" | Out-File -FilePath $log -Append -Encoding UTF8
