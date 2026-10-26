# Kettlebell Statistics

Narzędzie w Google Sheets + Apps Script do analizy algorytmów punktacji na zawodach Hardstyle Kettlebell (MP / PP, Bochnia).

Sprawdza, który sposób przeliczania wyniku jest najbardziej neutralny wobec masy ciała zawodnika:

```
wynik = ciężar / waga_zawodnika ^ b
```

- `b = 0` — siła absolutna (sam ciężar / tonaż)
- `b = 1` — siła względna (%BW)
- `b` oficjalny — współczynnik używany na zawodach (boje siłowe: K 0,60, M 0,67; Snatch: 0,40)
- Pull-Up: ciężar = waga zawodnika + obciążenie

## Pliki

| Plik | Rola |
|---|---|
| `appsscript.json` | manifest projektu (strefa czasowa Europe/Warsaw) |
| `.clasp.json` | powiązanie z projektem Apps Script (konto `ckbbochnia`) |
| `.claspignore` | clasp wysyła tylko pliki z głównego folderu (bez `tools/`, `dane/`) |
| `Template.js` | struktura arkusza: Inicjalizacja, Ustawienia, Dane, Wyniki, menu |
| `Code.js` | import CSV, liczenie wag |
| `Analiza.js` | analizy liczone skryptem: Korelacje, Korelacje (kategorie), Korelacje (wagi), Bootstrap, Wykres ρ(b), Odrzucone |
| `Import.html` | okienko importu CSV |
| `tools/pdf_to_csv.py` | PDF z wynikami → CSV do importu (Python + `pdftotext`) |
| `tools/test_analiza.js` | logika arkusza uruchamiana lokalnie w Node na `dane/*.csv` (sprawdzanie obliczeń) |
| `dane/*.csv` | zaimportowane dane: MP 2026, MP 2025, PP 2024 (2047 wierszy, bez przysiadu PP 2024) |

## Menu w arkuszu

- **⚙️ Setup → Inicjalizacja** — buduje / naprawia strukturę (bezpieczne do wielokrotnego uruchamiania)
- **📥 Dane → Importuj CSV**, **Policz wagi**
- **📊 Analiza → Oblicz korelacje**, **Oblicz korelacje w kategoriach**, **Oblicz korelacje w klasach (symulacja)** (granice klas i schemat b w Ustawieniach, sekcja H); w sekcji B: „Analizuj” i „Typ” boju (średnie dla bojów siłowych / wydolnościowych)
- **📊 Analiza → Bootstrap (przedziały ufności)** — losowanie zawodników ze zwracaniem, 95% CI dla b neutralnego i ρ (Ustawienia, sekcja I: liczba powtórzeń, ziarno)
- Ustawienia, sekcja J: **miara główna** — r Pearsona (wartości, domyślnie) albo ρ Spearmana (miejsca)
- **📊 Analiza → Wykres ρ(b)** — krzywe ρ w funkcji b dla kategorii oficjalnych (A) i klas z symulacji (B), osobno boje siłowe / wydolnościowe

## Praca z kodem

Konto Google: `ckbbochnia` — każda komenda `clasp` z `-u ckbbochnia`.

```
clasp push --force -u ckbbochnia
```

PDF → CSV:

```
python tools/pdf_to_csv.py wyniki.pdf --zawody "MP 2026 Bochnia" --snatch "Snatch 2'"
python tools/pdf_to_csv.py wyniki.pdf --zawody "PP 2024 Bochnia" --snatch "Snatch 5'" --pomin 2KBSQ
```

Analiza lokalnie (bez arkusza):

```
node tools/test_analiza.js
node tools/test_analiza.js --zawody "MP 2026 Bochnia" --podzial 2 --skrajne off
node tools/test_analiza.js --powtorzenia najnowszy
node tools/test_analiza.js --klasy "K:58,65,72;M:75,85,95"
node tools/test_analiza.js --klasy "K:65;M:85" --schemat "K:,0.25;M:,0" --boje "TGU,SSP,2KBSQ"
node tools/test_analiza.js --bootstrap 200 --ziarno 1
node tools/test_analiza.js --miara rho
```

Dokumentacja projektu: Obsidian, `02-Praca/Projekty/Kettlebell Statystyki`.
