# Kettlebell Statistics

Narzędzie w Google Sheets + Apps Script do analizy algorytmów punktacji na zawodach Hardstyle Kettlebell (MP Bochnia).

Sprawdza, który sposób przeliczania wyniku jest najbardziej neutralny wobec masy ciała zawodnika, licząc korelację wyniku z wagą dla różnych wartości wykładnika `b`:

```
wynik = ciężar / waga_zawodnika ^ b
```

- `b = 0` — siła absolutna (sam ciężar / tonaż)
- `b = 1` — siła względna (%BW)
- `b` oficjalny — współczynnik używany na zawodach (Boje siłowe: K 0,60, M 0,67; Snatch: 0,40)

## Praca z kodem

Konto Google: `ckbbochnia` — każda komenda `clasp` z `-u ckbbochnia`.

```
clasp push --force -u ckbbochnia
```

Dokumentacja projektu: Obsidian, `02-Praca/Projekty/Kettlebell Statystyki`.
