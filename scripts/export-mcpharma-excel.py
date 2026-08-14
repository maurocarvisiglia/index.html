import openpyxl
import json
import sys

SRC = r"C:\Users\Utente\Downloads\database_mcpharma_completo_2026-08-14.xlsx"
OUT = r"C:\Users\Utente\Downloads\INDEX\LS Intelligence\scripts\mcpharma-export.json"

wb = openpyxl.load_workbook(SRC, read_only=True, data_only=True)
ws = wb['Database aziende']

COLS = [
    'Ragione sociale completa', 'Sito azienda', 'Ragione sociale precisa', 'P.IVA', 'CF',
    'Sede legale', 'Referente', 'Ruolo referente', 'Mail referente',
    'Firmatario', 'Ruolo firmatario', 'Mail firmatario', 'Telefono'
]

rows = ws.iter_rows(min_row=1, max_row=None, values_only=True)
headers = next(rows)
idx = {h: i for i, h in enumerate(headers)}

out = []
for r in rows:
    d = {c: (r[idx[c]] if c in idx and idx[c] < len(r) else None) for c in COLS}
    if not d['Ragione sociale completa']:
        continue
    out.append(d)

with open(OUT, 'w', encoding='utf-8') as f:
    json.dump(out, f, ensure_ascii=False, indent=None)

print(f"Esportate {len(out)} righe -> {OUT}")
