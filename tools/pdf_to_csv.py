#!/usr/bin/env python3
"""
pdf_to_csv.py — PDF z wynikami (aplikacja wyników MP Hardstyle Kettlebell) → CSV do importu
w arkuszu Kettlebell Statistics (menu 📥 Dane → Importuj CSV).

Użycie:
    python pdf_to_csv.py <plik.pdf> --zawody "MP 2026 Bochnia" --snatch "Snatch 2'" [--out plik.csv]

Wymaga: Python 3.8+, program `pdftotext` (poppler-utils) w PATH.
Zamiast PDF można podać gotowy tekst z `pdftotext -layout` (plik .txt).

Zasady (patrz Obsidian: Kettlebell Statystyki / Instrukcja dla AI → „Procedura: PDF → CSV”):
- kategoria i płeć z tytułu PDF („Kategoria: PRO MĘŻCZYZN +85 KG” → M), nazwa kategorii dokładnie jak w PDF
- boje: TGU, SSP, 2KBSQ, Pistol, Pull-Up, Snatch (Snatch dostaje nazwę z --snatch, np. "Snatch 2'")
- Wynik: boje siłowe = Max próba (Pull-Up = obciążenie dodatkowe); Snatch = Total (tonaż)
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
    "WYNIKI TURKISH GET-UP": "TGU",
    "WYNIKI SEE-SAW PRESS": "SSP",
    "WYNIKI KETTLEBELL SQUAT": "2KBSQ",
    "WYNIKI PISTOL SQUAT": "Pistol",
    "WYNIKI PULL-UP": "Pull-Up",
    "WYNIKI SNATCH": "Snatch",
}
NUM = r"-?\d+(?:,\d+)?%?"
HEADER = ["Zawody", "Kategoria", "Bój", "Płeć", "Imię", "Nazwisko", "Wynik", "BW%", "Odważnik", "Powtórzenia"]


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


def make_row(boj, name, nums):
    imie, nazwisko = split_name(name)
    if boj == "Snatch":
        reps, kb, total, _miejsce, _wynik, bw, _pkt = nums
        return dict(boj=boj, imie=imie, nazwisko=nazwisko, wynik=to_num(total),
                    bw=to_num(bw) / 100, odwaznik=to_num(kb), powt=to_num(reps))
    _p1, _p2, _p3, _miejsce, mx, bw, _pkt = nums
    return dict(boj=boj, imie=imie, nazwisko=nazwisko, wynik=to_num(mx),
                bw=to_num(bw) / 100, odwaznik=None, powt=None)


def parse_sections(text):
    """Wiersze ze wszystkich sekcji bojów. Wiersze z %BW = '-' (wynik 0) nie pasują do wzorca i są pomijane."""
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
        toks = line.split()
        nums = []
        while toks and re.fullmatch(NUM, toks[-1]):
            nums.insert(0, toks.pop())
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
    head = re.split(r"WYNIKI (?:TURKISH|SEE-SAW|KETTLEBELL|PISTOL|PULL-UP|SNATCH)", text)[0]
    return len(re.findall(r"(?:\s+\d+){4,6}\s+\d+,\d+\s+\d+\s*$", head, re.M))


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
    kategoria = m.group(1).strip()
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
