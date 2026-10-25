#!/usr/bin/env python3
"""
pdf_to_csv.py — PDF z wynikami (aplikacja wyników MP Hardstyle Kettlebell) → CSV do importu
w arkuszu Kettlebell Statistics (menu 📥 Dane → Importuj CSV).

Użycie:
    python pdf_to_csv.py <plik.pdf> --zawody "MP 2026 Bochnia" --snatch "Snatch 2'" [--out plik.csv]

Wymaga: Python 3.8+, program `pdftotext` (poppler-utils) w PATH.
Zamiast PDF można podać gotowy tekst z `pdftotext -layout` (plik .txt).

Zasady (patrz Obsidian: Kettlebell Statystyki / Instrukcja dla AI → „Procedura: PDF → CSV”):
- kategoria i płeć z tytułu PDF („Kategoria: PRO MĘŻCZYZN +85 KG” → M); nazwa ujednolicona do formatu 2026
  (KOBIETY → KOBIET, „DO 65 KG” → „65 KG”, „POWYŻEJ 65 KG” → „+65 KG”)
- boje: TGU, SSP, 2KBSQ, Pistol, Pull-Up, Snatch (Snatch dostaje nazwę z --snatch, np. "Snatch 2'")
- Wynik: boje siłowe = Max próba (Pull-Up = obciążenie dodatkowe); Snatch = Total (tonaż)
- Pull-Up: BW% zawsze jako (waga + obciążenie) / waga (PDF 2025 podaje obciążenie / waga — przeliczane +100%)
- wyniki 0 są pomijane
- nazwiska w pisowni tytułowej; nazwiska łamane na dwie linie są sklejane (z myślnikiem bez spacji)
- kontrola strukturalna: liczba zawodników = liczba wierszy klasyfikacji końcowej
"""
import argparse
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

SECTIONS = {
    # układ 2026
    "WYNIKI TURKISH GET-UP": "TGU",
    "WYNIKI SEE-SAW PRESS": "SSP",
    "WYNIKI KETTLEBELL SQUAT": "2KBSQ",
    # układ 2025
    "WYNIKI TGU": "TGU",
    "WYNIKI SEE SAW PRESS": "SSP",
    "WYNIKI 2KB SQUAT": "2KBSQ",
    # wspólne
    "WYNIKI PISTOL SQUAT": "Pistol",
    "WYNIKI PULL-UP": "Pull-Up",
    "WYNIKI PULL UP": "Pull-Up",            # układ 2025
    "WYNIKI SNATCH": "Snatch",
}
NUM = r"-?\d+(?:[.,]\d+)?%?"      # przecinek albo kropka dziesiętna (2025: 106.1%)
HEADER = ["Zawody", "Kategoria", "Bój", "Płeć", "Imię", "Nazwisko", "Wynik", "BW%", "Odważnik", "Powtórzenia"]


def normalize_category(name):
    """Jednolite nazwy kategorii między latami (format z 2026):
    'AMATOR KOBIETY DO 65 KG' → 'AMATOR KOBIET 65 KG', 'AMATOR MĘŻCZYZN POWYŻEJ 85 KG' → 'AMATOR MĘŻCZYZN +85 KG'."""
    n = re.sub(r"\s+", " ", name.strip().upper())
    n = re.sub(r"(\d)\s*KG\b", r"\1 KG", n)            # '85KG' → '85 KG'
    n = re.sub(r"\bKOBIETY\b", "KOBIET", n)
    n = re.sub(r"\bPOWYŻEJ\s+(\d)", r"+\1", n)
    n = re.sub(r"\bDO\s+(\d)", r"\1", n)
    return n


def to_num(tok):
    return float(tok.replace("%", "").replace(",", "."))


def join_name(a, b):
    """Nazwisko złamane na dwie linie; przy myślniku bez spacji (WOLLNY / -STARZYŃSKA)."""
    if a.endswith("-") or b.startswith("-"):
        return a.rstrip() + b.lstrip()
    return a + " " + b


def split_name(full):
    parts = full.split()
    return parts[0], " ".join(parts[1:]).title()


def split_trailing_numbers(line):
    """Oddziela liczby z końca wiersza od nazwiska.
    W PDF 2025 nieudana próba bywa zapisana jako „-” (np. „35 - 37”), a wynik 0 ma %BW „-” albo punkty „N/A”:
    „-” i „N/A” liczymy jako 0, ale tylko gdy daje to pełny wiersz (7 liczb) — inaczej ścisłe dopasowanie."""
    toks = line.split()
    loose = toks[:]
    nums = []
    while loose and (re.fullmatch(NUM, loose[-1]) or loose[-1] in ("-", "N/A")):
        nums.insert(0, loose.pop())
    if len(nums) == 7:
        return loose, ["0" if n in ("-", "N/A") else n for n in nums]
    nums = []
    while toks and re.fullmatch(NUM, toks[-1]):
        nums.insert(0, toks.pop())
    return toks, nums


def make_row(boj, name, nums):
    imie, nazwisko = split_name(name)
    if boj == "Snatch":
        reps, kb, total, _miejsce, _wynik, bw, _pkt = nums
        return dict(boj=boj, imie=imie, nazwisko=nazwisko, wynik=to_num(total),
                    bw=to_num(bw) / 100, odwaznik=to_num(kb), powt=to_num(reps))
    _p1, _p2, _p3, _miejsce, mx, bw, _pkt = nums
    bw = to_num(bw) / 100
    if boj == "Pull-Up" and 0 < bw < 1:
        # PDF 2025: %BW = obciążenie / waga; ujednolicamy do konwencji 2026: (waga + obciążenie) / waga
        bw = round(bw + 1, 4)
    return dict(boj=boj, imie=imie, nazwisko=nazwisko, wynik=to_num(mx),
                bw=bw, odwaznik=None, powt=None)


def parse_sections(text):
    """Wiersze ze wszystkich sekcji bojów (także z wynikiem 0 — odfiltrowywane później)."""
    rows = []
    boj = None
    pending_name = pending_nums = None
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        hit = next((v for k, v in SECTIONS.items() if line.startswith(k)), None)
        if hit:
            boj = hit
            pending_name = pending_nums = None
            continue
        if line.startswith("WYNIKI"):          # nieznana sekcja (np. WYNIKI KOŃCOWE) — przerwij bieżącą
            boj = None
            continue
        if boj is None or line.startswith("Zawodnik") or line.startswith("ia "):
            continue
        toks, nums = split_trailing_numbers(line)
        name = " ".join(toks)
        if len(nums) == 7 and name:
            rows.append(make_row(boj, name, nums))
            pending_name = None
        elif len(nums) == 7 and not name:
            pending_nums = nums
        elif not nums and name:
            if pending_nums is not None and pending_name:
                rows.append(make_row(boj, join_name(pending_name, name), pending_nums))
                pending_name = pending_nums = None
            else:
                pending_name = name
    return rows


def unknown_sections(text):
    known = tuple(SECTIONS) + ("WYNIKI KOŃCOWE",)
    return sorted({l.strip() for l in text.splitlines()
                   if l.strip().startswith("WYNIKI") and not l.strip().startswith(known)})


def final_count(text):
    head = re.split(r"WYNIKI (?!KOŃCOWE)", text)[0]
    # wiersz klasyfikacji: miejsca w bojach [, tiebreak], punkty (x,xxx / x.xxx), miejsce
    return len(re.findall(r"(?:\s+-?\d+(?:[.,]\d+)?){4,7}\s+\d+[.,]\d{3}\s+\d+\s*$", head, re.M))


def fmt_num(x):
    if x is None:
        return ""
    return str(int(x)) if float(x) == int(x) else ("%g" % x).replace(".", ",")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pdf", help="plik PDF z wynikami (albo .txt z pdftotext -layout)")
    ap.add_argument("--zawody", required=True, help='nazwa zawodów, np. "MP 2026 Bochnia"')
    ap.add_argument("--snatch", required=True, help="nazwa boju Snatch, np. \"Snatch 2'\"")
    ap.add_argument("--out", help="plik wyjściowy (domyślnie: <Zawody>_<Kategoria>.csv)")
    args = ap.parse_args()

    src = Path(args.pdf)
    if src.suffix.lower() == ".pdf":
        text = subprocess.run(["pdftotext", "-layout", str(src), "-"], check=True,
                              capture_output=True, text=True, encoding="utf-8").stdout
    else:
        text = src.read_text(encoding="utf-8")

    m = re.search(r"Kategoria:\s*(.+)", text)
    if not m:
        sys.exit("Nie znaleziono 'Kategoria:' w PDF.")
    kategoria = normalize_category(m.group(1))
    if re.search(r"MĘŻCZ|MEZCZ", kategoria, re.I):
        plec = "M"
    elif re.search(r"KOBIET", kategoria, re.I):
        plec = "K"
    else:
        sys.exit(f"Nie rozpoznano płci z kategorii: {kategoria}")

    all_rows = parse_sections(text)
    rows = [r for r in all_rows if r["wynik"] > 0]

    athletes = Counter((r["imie"], r["nazwisko"]) for r in all_rows)
    n_final = final_count(text)
    warnings = []
    if n_final and n_final != len(athletes):
        warnings.append(f"klasyfikacja końcowa: {n_final} zawodników, w bojach: {len(athletes)}")
    for s in unknown_sections(text):
        warnings.append(f"nieznana sekcja w PDF (pominięta): {s}")

    if args.out:
        out = Path(args.out)
    else:
        base = re.sub(r"\s+KG$", "", f"{args.zawody} {kategoria}", flags=re.I)
        base = base.translate(str.maketrans("ĄĆĘŁŃÓŚŹŻąćęłńóśźż", "ACELNOSZZacelnoszz"))
        out = Path(re.sub(r"\s+", "_", base) + ".csv")
    lines = [";".join(HEADER)]
    for r in rows:
        boj = args.snatch if r["boj"] == "Snatch" else r["boj"]
        bw = ("%.1f%%" % round(r["bw"] * 100, 1)).replace(".", ",")
        lines.append(";".join([args.zawody, kategoria, boj, plec, r["imie"], r["nazwisko"],
                               fmt_num(r["wynik"]), bw, fmt_num(r["odwaznik"]), fmt_num(r["powt"])]))
    with open(out, "w", encoding="utf-8-sig", newline="\r\n") as f:
        f.write("\n".join(lines) + "\n")

    per_boj = Counter(r["boj"] for r in rows)
    print(f"Kategoria: {kategoria} | płeć: {plec} | zawodników: {len(athletes)} | wierszy: {len(rows)}")
    print("Wiersze wg bojów:", dict(per_boj))
    print(f"Pominięte zera (z rozpoznanych wierszy): {len(all_rows) - len(rows)}")
    for w in warnings:
        print("UWAGA:", w)
    print("Zapisano:", out)


if __name__ == "__main__":
    main()
