/**
 * Template.js — struktura arkusza (Inicjalizacja).
 *
 * setupTemplate() jest idempotentna — można ją uruchamiać wielokrotnie:
 *  - zakładki z danymi (Ustawienia, Dane) zakłada tylko wtedy, gdy ich brak, i NIGDY nie zmienia ich wartości,
 *  - wyjątek: walidację i formaty kolumn w Danych nakłada przy każdym uruchomieniu (tylko reguły, nie wartości),
 *  - zakładki wyliczane (Wyniki, …) czyści i buduje od nowa przy każdym uruchomieniu.
 */

const SHEET_USTAWIENIA = 'Ustawienia';
const SHEET_DANE = 'Dane';
const SHEET_WYNIKI = 'Wyniki';

/** Kolejność zakładek w arkuszu (pozostałe zakładki trafiają za nimi). */
const SHEET_ORDER = [SHEET_USTAWIENIA, SHEET_DANE, SHEET_WYNIKI, 'Korelacje', 'Porównanie 0 / x / 1', 'Korelacje (kategorie)', 'Korelacje (wagi)', 'Bootstrap', 'Wykres ρ(b)', 'Odrzucone'];

/** Zakres wierszy obejmowany formułami zakładek wyliczanych (wiersze Danych 2…MAX_ROWS). */
const MAX_ROWS = 5000;

const STYLE = {
  font: 'Arial',
  headerBg: '#1F3A5F',
  headerFont: '#FFFFFF',
  sectionBg: '#DCE6F1',
  inputBg: '#FFF2CC',
  inputFont: '#0000FF',
  noteFont: '#666666',
};

// ---------------------------------------------------------------- Dane

const DANE_COLUMNS = [
  { name: 'Zawody',      width: 160 },
  { name: 'Kategoria',   width: 200 },
  { name: 'Bój',         width: 70  },
  { name: 'Płeć',        width: 50  },
  { name: 'Imię',        width: 110 },
  { name: 'Nazwisko',    width: 170 },
  { name: 'Wynik',       width: 80,  note: 'TGU / SSP / 2KBSQ / Pistol: najlepsze udane podejście (kg).\nPull-Up: obciążenie dodatkowe (kg) — w punktacji ciężar = waga zawodnika + obciążenie.\nSnatch: tonaż = powtórzenia × odważnik.\n0 = brak zaliczonego podejścia (wykluczane z analizy).' },
  { name: 'BW%',         width: 70,  note: 'Z PDF. Wpisuj jako procent (56,5%) albo ułamek (0,565).\nSnatch: w PDF to odważnik / waga zawodnika.\nPull-Up: w PDF to (waga + obciążenie) / waga, czyli > 100%.', format: '0.0%' },
  { name: 'Odważnik',    width: 90,  note: 'Tylko Snatch — waga odważnika (kg).' },
  { name: 'Powtórzenia', width: 100, note: 'Tylko Snatch — liczba powtórzeń.' },
  { name: 'Waga',        width: 70,  note: 'Waga zawodnika (kg).\nPusta → 📥 Dane → Policz wagi (z BW% tego wiersza). Po imporcie CSV liczona automatycznie.\nWpisanej wagi skrypt nie zmienia.', format: '0.00', optional: true },
];

/** Numery kolumn w Danych (1 = A). */
const D = { zawody: 1, kategoria: 2, boj: 3, plec: 4, imie: 5, nazwisko: 6, wynik: 7, bw: 8, odwaznik: 9, powt: 10, waga: 11 };

const PLCIE = ['K', 'M'];

/** Maksymalna wartość BW% (jako ułamek) uznawana za poprawną — 3 = 300%. */
const BW_MAX = 3;

// ---------------------------------------------------------------- Ustawienia

const WSZYSTKIE = 'WSZYSTKIE';

/**
 * Współczynniki oficjalne — wartości startowe (podane przez organizatora).
 * Odmiany Snatcha (2', 6') to osobne boje — nie łączymy ich w analizie.
 * Pistol i Pull-Up — boje kategorii PRO. Pull-Up: Wynik w Danych = obciążenie dodatkowe,
 * a ciężar w punktacji = waga zawodnika + obciążenie.
 */
const B_OFICJALNE_START = [
  ['TGU',       0.60, 0.67],
  ['SSP',       0.60, 0.67],
  ['2KBSQ',     0.60, 0.67],
  ['Pistol',    0.60, 0.67],
  ['Pull-Up',   0.60, 0.67],
  ["Snatch 2'", 0.40, 0.40],
  ["Snatch 5'", 0.40, 0.40],
  ["Snatch 6'", 0.40, 0.40],
];

/** Współczynniki testowe — wartości startowe. */
const B_TESTOWE_START = [
  ['Test 1', 0.50],
  ['Test 2', 0.67],
  ['Test 3', 0.75],
];

/** Liczba kroków skanu b (start, start + krok, … start + (SKAN_KROKI − 1) · krok). */
const SKAN_KROKI = 151;

/** Symulacja klas wagowych (sekcja H): liczba pól na granice dla każdej płci → do 4 klas na płeć. */
const KLASY_SYM_GRANICE = 3;

/** Wartości startowe granic (kg) — obecny podział: K 65, M 85. Wiersz = granica 1…3, kolumny = K, M. */
const KLASY_SYM_START = [[65, 85], ['', ''], ['', '']];

/** Układ zakładki Ustawienia — numery wierszy sekcji wyliczane z liczby bojów i testów. */
const U_ROWS = (() => {
  const bFirst = 10;                                   // pierwszy bój w sekcji B
  const bLast = bFirst + B_OFICJALNE_START.length - 1;
  const cHead = bLast + 2;                             // nagłówek sekcji C
  const cFirst = cHead + 1;
  const cLast = cFirst + B_TESTOWE_START.length - 1;
  const dHead = cLast + 2;                             // nagłówek sekcji D
  return { bHead: bFirst - 2, bCols: bFirst - 1, bFirst, bLast, cHead, cFirst, cLast,
           dHead, skanStart: dHead + 1, skanKrok: dHead + 2, skanKoniec: dHead + 3,
           eHead: dHead + 5, eOn: dHead + 6, eMetoda: dHead + 7, eProg: dHead + 8,
           fHead: dHead + 10, fPodzial: dHead + 11,
           gHead: dHead + 13, gPowt: dHead + 14,
           hHead: dHead + 16, hCols: dHead + 17, hFirst: dHead + 18, hLast: dHead + 17 + KLASY_SYM_GRANICE,
           hbCols: dHead + 19 + KLASY_SYM_GRANICE, hbFirst: dHead + 20 + KLASY_SYM_GRANICE,
           hbLast: dHead + 20 + 2 * KLASY_SYM_GRANICE,
           iHead: dHead + 22 + 2 * KLASY_SYM_GRANICE, iN: dHead + 23 + 2 * KLASY_SYM_GRANICE,
           iSeed: dHead + 24 + 2 * KLASY_SYM_GRANICE,
           jHead: dHead + 26 + 2 * KLASY_SYM_GRANICE, jMiara: dHead + 27 + 2 * KLASY_SYM_GRANICE };
})();

/** Adresy komórek w Ustawieniach. */
const U = {
  filtrZawody:    'B5',
  filtrKategoria: 'B6',
  bOficjalneBoje: 'A' + U_ROWS.bFirst + ':A' + U_ROWS.bLast,
  bOficjalne:     'B' + U_ROWS.bFirst + ':C' + U_ROWS.bLast,
  bAnalizuj:      'D' + U_ROWS.bFirst + ':D' + U_ROWS.bLast,
  bTyp:           'E' + U_ROWS.bFirst + ':E' + U_ROWS.bLast,
  bTest:          B_TESTOWE_START.map((_, i) => 'B' + (U_ROWS.cFirst + i)),
  skanStart:      'B' + U_ROWS.skanStart,
  skanKrok:       'B' + U_ROWS.skanKrok,
  skanKoniec:     'B' + U_ROWS.skanKoniec,
  skrajneOn:      'B' + U_ROWS.eOn,
  skrajneMetoda:  'B' + U_ROWS.eMetoda,
  skrajneProg:    'B' + U_ROWS.eProg,
  podzial:        'B' + U_ROWS.fPodzial,
  powtorzenia:    'B' + U_ROWS.gPowt,
  klasySym:       'B' + U_ROWS.hFirst + ':C' + U_ROWS.hLast,
  klasySymB:      'B' + U_ROWS.hbFirst + ':C' + U_ROWS.hbLast,
  bootN:          'B' + U_ROWS.iN,
  bootSeed:       'B' + U_ROWS.iSeed,
  miara:          'B' + U_ROWS.jMiara,
  listaZawodow:   'F5:F200',
  listaKategorii: 'G5:G200',
};

/** Zakresy nazwane — formuły w kolejnych krokach odwołują się do nazw, nie adresów. */
const NAMED_RANGES = {
  FILTR_ZAWODY:     U.filtrZawody,
  FILTR_KATEGORIA:  U.filtrKategoria,
  B_OFICJALNE_BOJE: U.bOficjalneBoje,
  B_OFICJALNE:      U.bOficjalne,
  B_ANALIZUJ:       U.bAnalizuj,
  B_TYP:            U.bTyp,
  B_TEST_1:         U.bTest[0],
  B_TEST_2:         U.bTest[1],
  B_TEST_3:         U.bTest[2],
  SKAN_START:       U.skanStart,
  SKAN_KROK:        U.skanKrok,
  SKRAJNE_ODRZUCAJ: U.skrajneOn,
  SKRAJNE_METODA:   U.skrajneMetoda,
  SKRAJNE_PROG:     U.skrajneProg,
  PODZIAL_KATEGORII: U.podzial,
  POWTORZENIA:      U.powtorzenia,
  KLASY_SYM:        U.klasySym,
  KLASY_SYM_B:      U.klasySymB,
  BOOT_N:           U.bootN,
  BOOT_SEED:        U.bootSeed,
  MIARA:            U.miara,
};

// ---------------------------------------------------------------- Menu i Inicjalizacja

/** Menu w arkuszu. */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('⚙️ Setup')
    .addItem('Inicjalizacja', 'setupTemplate')
    .addToUi();
  ui.createMenu('📥 Dane')
    .addItem('Importuj CSV', 'showImportDialog')
    .addItem('Policz wagi', 'computeWeights')
    .addToUi();
  ui.createMenu('📊 Analiza')
    .addItem('Oblicz korelacje', 'computeCorrelations')
    .addItem('Porównanie 0 / x / 1', 'computeComparison')
    .addItem('Oblicz korelacje w kategoriach', 'computeCorrelationsByCategory')
    .addItem('Oblicz korelacje w klasach (symulacja)', 'computeCorrelationsByWeightClass')
    .addSeparator()
    .addItem('Bootstrap (przedziały ufności)', 'computeBootstrap')
    .addItem('Wykres ρ(b)', 'computeRhoCurves')
    .addToUi();
}

/** Inicjalizacja — konfiguruje arkusz. Bezpieczna do wielokrotnego uruchamiania. */
function setupTemplate() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const created = [];

  if (ensureUstawienia_(ss)) created.push(SHEET_USTAWIENIA);
  if (ensureDane_(ss)) created.push(SHEET_DANE);
  const addedCols = ensureDaneHeaders_(ss);
  const addedE = ensureSekcjaSkrajne_(ss);
  const addedF = ensureSekcjaPodzial_(ss);
  const addedG = ensureSekcjaPowtorzenia_(ss);
  const addedH = ensureSekcjaKlasySym_(ss);
  const addedHb = ensureSchematB_(ss);
  const addedAnalizuj = ensureKolumnaAnalizuj_(ss);
  const addedTyp = ensureKolumnaTyp_(ss);
  const addedI = ensureSekcjaBootstrap_(ss);
  const addedJ = ensureSekcjaMiara_(ss);
  const fixedNames = ensureNamedRanges_(ss);
  applyDaneRules_(ss);
  buildWyniki_(ss);
  removeDefaultSheet_(ss);
  orderSheets_(ss);

  const msg = (created.length ? 'Utworzono: ' + created.join(', ') + '.' : 'Zakładki z danymi już istnieją — dane bez zmian.')
    + (addedCols.length ? ' Dodano kolumny w Danych: ' + addedCols.join(', ') + '.' : '')
    + (addedE ? ' Dodano w Ustawieniach sekcję E (wartości skrajne).' : '')
    + (addedF ? ' Dodano w Ustawieniach sekcję F (analiza w kategoriach).' : '')
    + (addedG ? ' Dodano w Ustawieniach sekcję G (powtarzający się zawodnicy).' : '')
    + (addedH ? ' Dodano w Ustawieniach sekcję H (symulacja klas wagowych).' : '')
    + (addedHb ? ' Dodano w sekcji H współczynniki schematu (b dla każdej klasy).' : '')
    + (addedAnalizuj ? ' Dodano w Ustawieniach kolumnę „Analizuj” przy bojach (sekcja B).' : '')
    + (addedTyp ? ' Dodano w Ustawieniach kolumnę „Typ” przy bojach (sekcja B).' : '')
    + (addedI ? ' Dodano w Ustawieniach sekcję I (bootstrap).' : '')
    + (addedJ ? ' Dodano w Ustawieniach sekcję J (miara korelacji).' : '')
    + (fixedNames.length ? ' Naprawiono zakresy nazwane: ' + fixedNames.join(', ') + '.' : '')
    + ' Walidacja Danych zaktualizowana. Zbudowano: ' + SHEET_WYNIKI + '.';
  ss.toast(msg, 'Inicjalizacja zakończona', 6);
}

// ---------------------------------------------------------------- Zakładki

/**
 * Zakładka Dane — zakładana tylko, jeśli nie istnieje. Istniejącej nie dotyka.
 * @return {boolean} true, jeśli zakładka została utworzona
 */
function ensureDane_(ss) {
  if (ss.getSheetByName(SHEET_DANE)) return false;

  const sh = ss.insertSheet(SHEET_DANE);
  const n = DANE_COLUMNS.length;

  sh.getRange(1, 1, sh.getMaxRows(), n).setFontFamily(STYLE.font).setFontSize(10);

  styleHeader_(sh.getRange(1, 1, 1, n).setValues([DANE_COLUMNS.map(c => c.name)]));
  sh.setFrozenRows(1);

  DANE_COLUMNS.forEach((c, i) => {
    const col = i + 1;
    sh.setColumnWidth(col, c.width);
    if (c.note) sh.getRange(1, col).setNote(c.note);
  });

  return true;
}

/**
 * Dopisuje brakujące nagłówki kolumn w istniejącej zakładce Dane (np. nowa kolumna Waga na końcu).
 * Zmienia tylko pusty nagłówek, NIGDY wartości ani istniejących nagłówków.
 * @return {string[]} nazwy dopisanych kolumn
 */
function ensureDaneHeaders_(ss) {
  const sh = ss.getSheetByName(SHEET_DANE);
  if (!sh) return [];
  const n = DANE_COLUMNS.length;
  if (sh.getMaxColumns() < n) sh.insertColumnsAfter(sh.getMaxColumns(), n - sh.getMaxColumns());
  const header = sh.getRange(1, 1, 1, n).getValues()[0];
  const added = [];
  DANE_COLUMNS.forEach((c, i) => {
    if (String(header[i]).trim() !== '') return;
    const cell = sh.getRange(1, i + 1).setValue(c.name);
    styleHeader_(cell.setFontFamily(STYLE.font).setFontSize(10));
    if (c.note) cell.setNote(c.note);
    sh.setColumnWidth(i + 1, c.width);
    sh.getRange(2, i + 1, Math.max(sh.getMaxRows() - 1, 1), 1).setFontFamily(STYLE.font).setFontSize(10);
    added.push(c.name);
  });
  return added;
}

/**
 * Walidacja i formaty kolumn w Danych — nakładane przy każdej Inicjalizacji i po imporcie.
 * Zmienia wyłącznie reguły i formaty, NIGDY wartości.
 * Tryb ostrzegawczy: błędna wartość dostaje czerwony trójkąt, ale nie jest blokowana.
 */
function applyDaneRules_(ss) {
  const sh = ss.getSheetByName(SHEET_DANE);
  if (!sh) return;
  const rows = sh.getMaxRows() - 1;
  if (rows < 1) return;
  const col = c => sh.getRange(2, c, rows, 1);
  const warn = b => b.setAllowInvalid(true).build();
  const nonNeg = help => warn(SpreadsheetApp.newDataValidation()
    .requireNumberGreaterThanOrEqualTo(0).setHelpText(help));

  const boje = namedRange_(ss, 'B_OFICJALNE_BOJE');
  const bojRule = boje
    ? SpreadsheetApp.newDataValidation().requireValueInRange(boje, true)
    : SpreadsheetApp.newDataValidation().requireValueInList(B_OFICJALNE_START.map(r => r[0]), true);
  col(D.boj).setDataValidation(warn(bojRule.setHelpText('Bój z listy w Ustawieniach (sekcja B)')));

  col(D.plec).setDataValidation(warn(SpreadsheetApp.newDataValidation()
    .requireValueInList(PLCIE, true).setHelpText('K albo M')));

  col(D.wynik).setDataValidation(nonNeg('Liczba ≥ 0 (kg; Snatch = tonaż)'));
  col(D.odwaznik).setDataValidation(nonNeg('Liczba ≥ 0 (kg)'));
  col(D.powt).setDataValidation(nonNeg('Liczba ≥ 0'));
  col(D.bw).setDataValidation(warn(SpreadsheetApp.newDataValidation()
    .requireNumberBetween(0, BW_MAX).setHelpText('Od 0% do 300%')));
  col(D.waga).setDataValidation(warn(SpreadsheetApp.newDataValidation()
    .requireNumberBetween(20, 250).setHelpText('Waga zawodnika w kg (20–250)')));

  DANE_COLUMNS.forEach((c, i) => {
    if (c.format) col(i + 1).setNumberFormat(c.format);
  });
}

/**
 * Zakładka Ustawienia — zakładana tylko, jeśli nie istnieje. Istniejącej nie dotyka
 * (Kacper może zmieniać współczynniki i filtry — Inicjalizacja ich nie nadpisuje).
 * @return {boolean} true, jeśli zakładka została utworzona
 */
function ensureUstawienia_(ss) {
  if (ss.getSheetByName(SHEET_USTAWIENIA)) return false;

  const sh = ss.insertSheet(SHEET_USTAWIENIA);
  sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).setFontFamily(STYLE.font).setFontSize(10);

  sh.getRange('A1').setValue('Ustawienia').setFontSize(14).setFontWeight('bold');
  sh.getRange('A2').setValue('Żółte komórki są do edycji. Inicjalizacja nigdy ich nie nadpisuje.')
    .setFontStyle('italic').setFontColor(STYLE.noteFont);

  // A. Zakres analizy
  styleSection_(sh.getRange('A4:C4'), 'A. Zakres analizy');
  sh.getRange('A5:A6').setValues([['Zawody'], ['Kategoria']]).setFontWeight('bold');
  styleInput_(sh.getRange('B5:B6').setValues([[WSZYSTKIE], [WSZYSTKIE]]));
  sh.getRange(U.filtrZawody).setNote('WSZYSTKIE = bez filtra.\nLista budowana automatycznie z zakładki Dane.');
  sh.getRange(U.filtrKategoria).setNote('WSZYSTKIE = analiza łączna (kategorie razem).\nLista budowana automatycznie z zakładki Dane.');

  // Listy pomocnicze (automatyczne, z zakładki Dane)
  styleHeader_(sh.getRange('F4:G4').setValues([['Lista zawodów (auto)', 'Lista kategorii (auto)']]));
  sh.getRange('F4').setNote('Listy budowane automatycznie z zakładki Dane — nie edytować.');
  sh.getRange('F5').setFormula(uniqueListFormula_('A'));
  sh.getRange('G5').setFormula(uniqueListFormula_('B'));
  sh.getRange('F5:G200').setFontColor(STYLE.noteFont);
  sh.getRange(U.filtrZawody).setDataValidation(listValidation_(sh.getRange(U.listaZawodow)));
  sh.getRange(U.filtrKategoria).setDataValidation(listValidation_(sh.getRange(U.listaKategorii)));

  const R = U_ROWS;

  // B. Współczynniki oficjalne
  styleSection_(sh.getRange('A' + R.bHead + ':C' + R.bHead), 'B. Współczynniki oficjalne');
  styleHeader_(sh.getRange('A' + R.bCols + ':C' + R.bCols).setValues([['Bój', 'Kobiety (K)', 'Mężczyźni (M)']]));
  sh.getRange(U.bOficjalneBoje).setValues(B_OFICJALNE_START.map(r => [r[0]])).setFontWeight('bold');
  styleCoef_(sh.getRange(U.bOficjalne).setValues(B_OFICJALNE_START.map(r => [r[1], r[2]])));
  sh.getRange('A' + R.bCols).setNote('Współczynniki używane na zawodach (podane przez organizatora).\n'
    + 'wynik = ciężar / waga ^ b\n\nLista bojów jest wzorcowa — do niej odwołuje się walidacja i import Danych. '
    + 'Odmiany Snatcha (2\', 6\') to osobne boje.');
  writeKolumnaAnalizuj_(sh);
  writeKolumnaTyp_(sh);

  // C. Współczynniki testowe
  styleSection_(sh.getRange('A' + R.cHead + ':C' + R.cHead), 'C. Współczynniki testowe');
  sh.getRange('A' + R.cFirst + ':A' + R.cLast).setValues(B_TESTOWE_START.map(r => [r[0]])).setFontWeight('bold');
  styleCoef_(sh.getRange('B' + R.cFirst + ':B' + R.cLast).setValues(B_TESTOWE_START.map(r => [r[1]])));
  sh.getRange('A' + R.cFirst).setNote('Dowolne współczynniki do porównania — te same dla K i M.');

  // D. Skan b
  styleSection_(sh.getRange('A' + R.dHead + ':C' + R.dHead), 'D. Skan b');
  sh.getRange('A' + R.skanStart + ':A' + R.skanKoniec)
    .setValues([['Start'], ['Krok'], ['Koniec (wyliczony)']]).setFontWeight('bold');
  styleCoef_(sh.getRange(U.skanStart + ':' + U.skanKrok).setValues([[0], [0.01]]));
  sh.getRange(U.skanKoniec)
    .setFormula('=' + U.skanStart + '+' + (SKAN_KROKI - 1) + '*' + U.skanKrok)
    .setNumberFormat('0.00');
  sh.getRange('C' + R.skanKoniec).setValue(SKAN_KROKI + ' kroków').setFontStyle('italic').setFontColor(STYLE.noteFont);

  // E. Wartości skrajne
  writeSekcjaSkrajne_(sh);

  // F. Analiza w kategoriach
  writeSekcjaPodzial_(sh);

  // G. Powtarzający się zawodnicy
  writeSekcjaPowtorzenia_(sh);

  // H. Symulacja klas wagowych
  writeSekcjaKlasySym_(sh);

  // I. Bootstrap
  writeSekcjaBootstrap_(sh);

  // J. Miara korelacji
  writeSekcjaMiara_(sh);

  // Szerokości kolumn
  [[1, 170], [2, 110], [3, 110], [4, 70], [5, 110], [6, 190], [7, 220]]
    .forEach(([col, w]) => sh.setColumnWidth(col, w));

  // Zakresy nazwane (stare o tych nazwach — np. po ręcznym usunięciu zakładki — są najpierw usuwane)
  Object.entries(NAMED_RANGES).forEach(([name, a1]) => setNamedRange_(ss, name, sh.getRange(a1)));

  return true;
}

/**
 * Ustawia zakres nazwany: usuwa tylko te zakresy o tej nazwie, które naprawdę istnieją (z listy getNamedRanges,
 * także uszkodzone #REF!), potem zakłada nowy.
 * Nie używać ss.removeNamedRange(name) „na ślepo” w try/catch — Apps Script wykonuje zmiany odroczone,
 * więc błąd „Zakres o nazwie … nie istnieje” wylatuje dopiero przy następnym odczycie, poza try/catch.
 */
function setNamedRange_(ss, name, range) {
  ss.getNamedRanges().filter(n => n.getName() === name).forEach(n => n.remove());
  ss.setNamedRange(name, range);
}

/** Zakres nazwany albo null, gdy nie istnieje (getRangeByName potrafi wtedy rzucić wyjątek). */
function namedRange_(ss, name) {
  try {
    return ss.getRangeByName(name) || null;
  } catch (e) {
    return null;
  }
}

/**
 * Pilnuje, żeby każdy zakres nazwany wskazywał na właściwe komórki w zakładce Ustawienia.
 * Naprawia nazwy uszkodzone (np. po ręcznym usunięciu zakładki Ustawienia, gdy inne zakładki już istniały).
 * @return {string[]} nazwy naprawionych zakresów
 */
function ensureNamedRanges_(ss) {
  const sh = ss.getSheetByName(SHEET_USTAWIENIA);
  if (!sh) return [];
  const fixed = [];
  Object.entries(NAMED_RANGES).forEach(([name, a1]) => {
    let ok = false;
    try {
      const r = namedRange_(ss, name);
      ok = !!r && r.getSheet().getSheetId() === sh.getSheetId() && r.getA1Notation() === a1;
    } catch (e) {
      ok = false;
    }
    if (ok) return;
    setNamedRange_(ss, name, sh.getRange(a1));
    fixed.push(name);
  });
  return fixed;
}

/** Podział na kategorie w analizie „Korelacje (kategorie)”. */
const PODZIALY = ['Klasa wagowa', 'Klasa wagowa × poziom', 'Zawody × kategoria'];

/** Granice klas wagowych (kg): do granicy = klasa „65” / „85”, powyżej = „+65” / „+85”. */
const KLASY_WAGOWE = { K: 65, M: 85 };

/** Sekcja F Ustawień — sposób podziału na kategorie w analizie w kategoriach. */
function writeSekcjaPodzial_(sh) {
  const R = U_ROWS;
  const ss = sh.getParent();
  styleSection_(sh.getRange('A' + R.fHead + ':C' + R.fHead), 'F. Analiza w kategoriach');
  sh.getRange('A' + R.fPodzial).setValue('Podział na kategorie').setFontWeight('bold');
  styleInput_(sh.getRange(U.podzial).setValue(PODZIALY[0]));
  sh.getRange(U.podzial).setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(PODZIALY, true).setAllowInvalid(false).build());
  sh.getRange('A' + R.fHead).setNote(
    'Jak dzielić dane w 📊 Analiza → Oblicz korelacje w kategoriach:\n'
    + '• Klasa wagowa — K 65, K +65, M 85, M +85 (AMATOR i PRO oraz roczniki razem)\n'
    + '• Klasa wagowa × poziom — np. AMATOR K +65 i PRO K +65 osobno\n'
    + '• Zawody × kategoria — każda kategoria każdych zawodów osobno (najdrobniejszy podział)\n\n'
    + 'Kategoria bez klasy wagowej (np. PRO KOBIET w PP 2024) → klasa wg wagi zawodnika (granice: K 65 kg, M 85 kg).');
  sh.getRange('C' + R.fPodzial).setValue('wybierz z listy').setFontStyle('italic').setFontColor(STYLE.noteFont);
  setNamedRange_(ss, 'PODZIAL_KATEGORII', sh.getRange(U.podzial));
}

/** Dopisuje sekcję F do istniejących Ustawień, jeśli jej brak. @return {boolean} */
function ensureSekcjaPodzial_(ss) {
  const sh = ss.getSheetByName(SHEET_USTAWIENIA);
  if (!sh || namedRange_(ss, 'PODZIAL_KATEGORII')) return false;
  if (String(sh.getRange('A' + U_ROWS.fHead).getValue()).trim() !== '') return false;
  writeSekcjaPodzial_(sh);
  return true;
}

/**
 * Powtarzający się zawodnicy (ta sama osoba na kilku zawodach) — opcje sekcji G Ustawień.
 * [0] = wszystkie starty (każdy start to osobna obserwacja), [1] = tylko najnowszy start w danym boju.
 */
const POWTORZENIA_OPCJE = ['Wszystkie starty', 'Najnowszy start'];

/** Sekcja G Ustawień — co robić z zawodnikami, którzy startowali na kilku zawodach. */
function writeSekcjaPowtorzenia_(sh) {
  const R = U_ROWS;
  const ss = sh.getParent();
  styleSection_(sh.getRange('A' + R.gHead + ':C' + R.gHead), 'G. Powtarzający się zawodnicy');
  sh.getRange('A' + R.gPowt).setValue('Starty zawodnika').setFontWeight('bold');
  styleInput_(sh.getRange(U.powtorzenia).setValue(POWTORZENIA_OPCJE[0]));
  sh.getRange(U.powtorzenia).setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(POWTORZENIA_OPCJE, true).setAllowInvalid(false).build());
  sh.getRange('A' + R.gHead).setNote(
    'Ta sama osoba startowała na kilku zawodach (np. MP 2025 i MP 2026):\n'
    + '• Wszystkie starty — każdy start to osobna obserwacja (p i CI mogą być zbyt optymistyczne)\n'
    + '• Najnowszy start — w każdym boju zostaje tylko wynik z najnowszych zawodów, na których zawodnik ma wynik w tym boju\n\n'
    + 'Działa w obu analizach (📊 Analiza), po filtrze Zawody, przed odrzuceniem wartości skrajnych. '
    + 'Zawodnik = imię + nazwisko (bez względu na wielkość liter i polskie znaki). '
    + 'Kolejność zawodów — rok z nazwy zawodów (np. „MP 2026 Bochnia” → 2026).');
  sh.getRange('C' + R.gPowt).setValue('wybierz z listy').setFontStyle('italic').setFontColor(STYLE.noteFont);
  setNamedRange_(ss, 'POWTORZENIA', sh.getRange(U.powtorzenia));
}

/** Dopisuje sekcję G do istniejących Ustawień, jeśli jej brak (komórka nagłówka pusta). @return {boolean} */
function ensureSekcjaPowtorzenia_(ss) {
  const sh = ss.getSheetByName(SHEET_USTAWIENIA);
  if (!sh || namedRange_(ss, 'POWTORZENIA')) return false;
  if (String(sh.getRange('A' + U_ROWS.gHead).getValue()).trim() !== '') return false;
  writeSekcjaPowtorzenia_(sh);
  return true;
}

/**
 * Sekcja H Ustawień — symulacja klas wagowych: do 3 granic (kg) dla K i M → do 4 klas na płeć.
 * Zawodnik trafia do klasy wg swojej wagi (bez podziału AMATOR / PRO). Granica należy do wyższej klasy.
 */
function writeSekcjaKlasySym_(sh) {
  const R = U_ROWS;
  const ss = sh.getParent();
  styleSection_(sh.getRange('A' + R.hHead + ':C' + R.hHead), 'H. Symulacja klas wagowych');
  styleHeader_(sh.getRange('A' + R.hCols + ':C' + R.hCols).setValues([['Granica (kg)', 'Kobiety (K)', 'Mężczyźni (M)']]));
  sh.getRange('A' + R.hFirst + ':A' + R.hLast)
    .setValues(KLASY_SYM_START.map((_, i) => ['Granica ' + (i + 1)])).setFontWeight('bold');
  const rng = sh.getRange(U.klasySym);
  styleInput_(rng.setValues(KLASY_SYM_START)).setNumberFormat('0.0');
  rng.setDataValidation(SpreadsheetApp.newDataValidation()
    .requireNumberBetween(20, 250).setAllowInvalid(false).setHelpText('Waga w kg (20–250) albo puste').build());
  sh.getRange('A' + R.hHead).setNote(
    'Granice klas wagowych do 📊 Analiza → Oblicz korelacje w klasach (symulacja) → zakładka „Korelacje (wagi)”.\n\n'
    + 'Do ' + KLASY_SYM_GRANICE + ' granic dla każdej płci (puste pole = mniej klas), np. K: 58, 65, 72 → K <58, K 58–65, K 65–72, K 72+.\n'
    + 'Kolejność wpisywania bez znaczenia (skrypt sortuje).\n\n'
    + 'Zawodnik trafia do klasy wg swojej wagi z Danych — bez podziału AMATOR / PRO i bez podziału na zawody. '
    + 'Waga równa granicy należy do wyższej klasy (85,0 → 85+), tak jak w danych z zawodów.\n'
    + 'Domyślnie K 65 / M 85 = obecny podział.');
  setNamedRange_(ss, 'KLASY_SYM', rng);
  writeSchematB_(sh);
}

/**
 * Część sekcji H — schemat punktacji: b dla każdej klasy symulacji (klasa 1 = najlżejsza), osobno K i M.
 * Puste pole = b oficjalny danego boju (sekcja B). Wpisane b dotyczy wszystkich bojów tej klasy (także Snatcha).
 */
function writeSchematB_(sh) {
  const R = U_ROWS;
  const ss = sh.getParent();
  styleHeader_(sh.getRange('A' + R.hbCols + ':C' + R.hbCols).setValues([['b w schemacie', 'Kobiety (K)', 'Mężczyźni (M)']]));
  sh.getRange('A' + R.hbFirst + ':A' + R.hbLast)
    .setValues(Array.from({ length: KLASY_SYM_GRANICE + 1 }, (_, i) =>
      ['Klasa ' + (i + 1) + (i === 0 ? ' (najlżejsza)' : '')])).setFontWeight('bold');
  const rng = sh.getRange(U.klasySymB);
  styleInput_(rng.clearContent()).setNumberFormat('0.00');
  rng.setDataValidation(SpreadsheetApp.newDataValidation()
    .requireNumberBetween(0, 2).setAllowInvalid(false).setHelpText('b od 0 do 2 albo puste (= b oficjalny)').build());
  sh.getRange('A' + R.hbCols).setNote(
    'Schemat punktacji do sprawdzenia w „Korelacje (wagi)” — dodatkowy algorytm „Schemat”.\n\n'
    + 'Klasa 1 = najlżejsza, kolejne wg granic powyżej (np. przy 2 granicach klasa 3 = otwarta). '
    + 'Puste pole = b oficjalny danego boju (sekcja B). Wpisane b dotyczy wszystkich bojów tej klasy, także Snatcha.\n\n'
    + 'Przykład: M granica 85, klasa 1 puste (0,67), klasa 2 = 0 → klasa otwarta liczona siłą absolutną.\n'
    + 'Przegląd klas w „Korelacje (wagi)” pokazuje b schematu dla każdej klasy.');
  setNamedRange_(ss, 'KLASY_SYM_B', rng);
}

/** Dopisuje schemat b do istniejącej sekcji H, jeśli go brak (pusty nagłówek). @return {boolean} */
function ensureSchematB_(ss) {
  const sh = ss.getSheetByName(SHEET_USTAWIENIA);
  if (!sh || !namedRange_(ss, 'KLASY_SYM') || namedRange_(ss, 'KLASY_SYM_B')) return false;
  if (String(sh.getRange('A' + U_ROWS.hbCols).getValue()).trim() !== '') return false;
  writeSchematB_(sh);
  return true;
}

/** Dopisuje sekcję H do istniejących Ustawień, jeśli jej brak (komórka nagłówka pusta). @return {boolean} */
function ensureSekcjaKlasySym_(ss) {
  const sh = ss.getSheetByName(SHEET_USTAWIENIA);
  if (!sh || namedRange_(ss, 'KLASY_SYM')) return false;
  if (String(sh.getRange('A' + U_ROWS.hHead).getValue()).trim() !== '') return false;
  writeSekcjaKlasySym_(sh);
  return true;
}

/**
 * Kolumna D w sekcji B Ustawień — checkbox „Analizuj” przy każdym boju (domyślnie zaznaczone).
 * Odznaczony bój znika ze wszystkich analiz (📊 Analiza); Dane, Wyniki i import bez zmian.
 */
function writeKolumnaAnalizuj_(sh) {
  const R = U_ROWS;
  const ss = sh.getParent();
  styleHeader_(sh.getRange('D' + R.bCols).setValue('Analizuj').setFontFamily(STYLE.font).setFontSize(10));
  sh.getRange('D' + R.bCols).setNote('Zaznaczone boje biorą udział w analizach (📊 Analiza). '
    + 'Odznaczony bój znika ze wszystkich tabel analiz — Dane i Wyniki zostają bez zmian.');
  const rng = sh.getRange(U.bAnalizuj);
  rng.insertCheckboxes().setValue(true).setHorizontalAlignment('center').setBackground(STYLE.inputBg);
  sh.setColumnWidth(4, 70);
  setNamedRange_(ss, 'B_ANALIZUJ', rng);
}

/** Typy bojów do średnich w analizach (kolumna E w sekcji B Ustawień). */
const TYPY_BOJOW = ['Siłowy', 'Wydolnościowy'];

/** Typ startowy boju: odmiany Snatcha = wydolnościowy, pozostałe = siłowy. */
function typBojuStart_(boj) {
  return isSnatch_(boj) ? TYPY_BOJOW[1] : TYPY_BOJOW[0];
}

/**
 * Kolumna E w sekcji B Ustawień — typ boju (Siłowy / Wydolnościowy) do tabel „średnio z bojów” w analizach.
 * Startowo: Snatch = Wydolnościowy, pozostałe = Siłowy.
 */
function writeKolumnaTyp_(sh) {
  const R = U_ROWS;
  const ss = sh.getParent();
  styleHeader_(sh.getRange('E' + R.bCols).setValue('Typ').setFontFamily(STYLE.font).setFontSize(10));
  sh.getRange('E' + R.bCols).setNote('Typ boju do tabel „średnio z bojów” w Korelacjach (kategorie) i Korelacjach (wagi): '
    + 'korelacje uśredniane osobno dla bojów siłowych i wydolnościowych.\n\n'
    + 'Uśrednianie ma sens, gdy boje danego typu mają ten sam współczynnik oficjalny.');
  const rng = sh.getRange(U.bTyp);
  styleInput_(rng.setValues(B_OFICJALNE_START.map(r => [typBojuStart_(r[0])])));
  rng.setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(TYPY_BOJOW, true).setAllowInvalid(false).build());
  sh.setColumnWidth(5, 110);
  setNamedRange_(ss, 'B_TYP', rng);
}

/** Dopisuje kolumnę „Typ” do istniejących Ustawień, jeśli jej brak (pusty nagłówek E w sekcji B). @return {boolean} */
function ensureKolumnaTyp_(ss) {
  const sh = ss.getSheetByName(SHEET_USTAWIENIA);
  if (!sh || namedRange_(ss, 'B_TYP')) return false;
  if (String(sh.getRange('E' + U_ROWS.bCols).getValue()).trim() !== '') return false;
  writeKolumnaTyp_(sh);
  return true;
}

/** Dopisuje kolumnę „Analizuj” do istniejących Ustawień, jeśli jej brak (pusty nagłówek D w sekcji B). @return {boolean} */
function ensureKolumnaAnalizuj_(ss) {
  const sh = ss.getSheetByName(SHEET_USTAWIENIA);
  if (!sh || namedRange_(ss, 'B_ANALIZUJ')) return false;
  if (String(sh.getRange('D' + U_ROWS.bCols).getValue()).trim() !== '') return false;
  writeKolumnaAnalizuj_(sh);
  return true;
}

/** Bootstrap (sekcja I): wartości startowe liczby powtórzeń i ziarna losowania. */
const BOOTSTRAP_START = { n: 200, seed: 1 };

/** Sekcja I Ustawień — bootstrap po zawodnikach (📊 Analiza → Bootstrap): liczba powtórzeń i ziarno losowania. */
function writeSekcjaBootstrap_(sh) {
  const R = U_ROWS;
  const ss = sh.getParent();
  styleSection_(sh.getRange('A' + R.iHead + ':C' + R.iHead), 'I. Bootstrap');
  sh.getRange('A' + R.iN + ':A' + R.iSeed).setValues([['Liczba powtórzeń'], ['Ziarno losowania']]).setFontWeight('bold');
  styleInput_(sh.getRange(U.bootN + ':' + U.bootSeed).setValues([[BOOTSTRAP_START.n], [BOOTSTRAP_START.seed]])).setNumberFormat('0');
  sh.getRange(U.bootN).setDataValidation(SpreadsheetApp.newDataValidation()
    .requireNumberBetween(20, 1000).setAllowInvalid(false).setHelpText('Liczba od 20 do 1000 (zalecane 200)').build());
  sh.getRange(U.bootSeed).setDataValidation(SpreadsheetApp.newDataValidation()
    .requireNumberBetween(1, 999999).setAllowInvalid(false).setHelpText('Liczba całkowita 1–999999').build());
  sh.getRange('A' + R.iHead).setNote(
    '📊 Analiza → Bootstrap (przedziały ufności) — zakładka „Bootstrap”.\n\n'
    + 'Losuje zawodników ze zwracaniem (osobno K i M; wylosowany zawodnik wnosi wszystkie swoje wyniki — boje i lata) '
    + 'i w każdym powtórzeniu liczy od nowa symulację klas (sekcja H). Z rozrzutu wyników: 95% przedziały ufności dla b neutralnego i ρ.\n\n'
    + 'Więcej powtórzeń = dokładniej, ale dłużej (200 ≈ 2–4 min). Limit Apps Script to 6 min — skrypt kończy wcześniej i pisze, ile powtórzeń wykonał.\n'
    + 'To samo ziarno = te same wyniki przy każdym kliknięciu.');
  sh.getRange('C' + R.iN).setValue('200 ≈ 2–4 min').setFontStyle('italic').setFontColor(STYLE.noteFont);
  sh.getRange('C' + R.iSeed).setValue('te same = te same wyniki').setFontStyle('italic').setFontColor(STYLE.noteFont);
  setNamedRange_(ss, 'BOOT_N', sh.getRange(U.bootN));
  setNamedRange_(ss, 'BOOT_SEED', sh.getRange(U.bootSeed));
}

/** Miary korelacji (sekcja J). [0] = domyślna. */
const MIARY = ['r Pearsona (wartości)', 'ρ Spearmana (miejsca)'];

/** Sekcja J Ustawień — miara główna korelacji we wszystkich analizach. */
function writeSekcjaMiara_(sh) {
  const R = U_ROWS;
  const ss = sh.getParent();
  styleSection_(sh.getRange('A' + R.jHead + ':C' + R.jHead), 'J. Miara korelacji');
  sh.getRange('A' + R.jMiara).setValue('Miara główna').setFontWeight('bold');
  styleInput_(sh.getRange(U.miara).setValue(MIARY[0]));
  sh.getRange(U.miara).setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(MIARY, true).setAllowInvalid(false).build());
  sh.getRange('A' + R.jHead).setNote(
    'Miara korelacji wyniku z wagą w analizach (📊 Analiza): b neutralne, „najbliżej 0”, p i 95% CI, bootstrap, wykres.\n\n'
    + '• r Pearsona (wartości) — domyślnie: patrzy na wielkość wyników (ile kto podniósł względem wagi). '
    + 'Bez skoku przy b = 0 — mikroskopijne różnice wyników mają mikroskopijny wpływ. Wrażliwszy na pojedyncze skrajne wyniki (sekcja E)\n'
    + '• ρ Spearmana (miejsca) — patrzy na kolejność w rankingu. Odporny na skrajne wyniki, ale przy b = 0 remisy (te same odważniki) '
    + 'dają skok: każde b > 0 rozstrzyga remis na korzyść lżejszego.\n\n'
    + 'Druga miara jest zawsze pokazywana pomocniczo (szara). Korelacje (analiza łączna) pokazuje obie bez zmian.');
  sh.getRange('C' + R.jMiara).setValue('wybierz z listy').setFontStyle('italic').setFontColor(STYLE.noteFont);
  setNamedRange_(ss, 'MIARA', sh.getRange(U.miara));
}

/** Dopisuje sekcję J do istniejących Ustawień, jeśli jej brak (komórka nagłówka pusta). @return {boolean} */
function ensureSekcjaMiara_(ss) {
  const sh = ss.getSheetByName(SHEET_USTAWIENIA);
  if (!sh || namedRange_(ss, 'MIARA')) return false;
  if (String(sh.getRange('A' + U_ROWS.jHead).getValue()).trim() !== '') return false;
  writeSekcjaMiara_(sh);
  return true;
}

/** Dopisuje sekcję I do istniejących Ustawień, jeśli jej brak (komórka nagłówka pusta). @return {boolean} */
function ensureSekcjaBootstrap_(ss) {
  const sh = ss.getSheetByName(SHEET_USTAWIENIA);
  if (!sh || namedRange_(ss, 'BOOT_N')) return false;
  if (String(sh.getRange('A' + U_ROWS.iHead).getValue()).trim() !== '') return false;
  writeSekcjaBootstrap_(sh);
  return true;
}

/** Wartości startowe filtra wartości skrajnych. */
const SKRAJNE_START = { on: 'NIE', metoda: 'MAD', prog: 3.5 };
const SKRAJNE_METODY = ['MAD', 'SD'];

/**
 * Sekcja E Ustawień — odrzucanie wartości skrajnych (reszty z regresji log-log w grupie bój | płeć).
 * Zapisuje treść sekcji i jej zakresy nazwane.
 */
function writeSekcjaSkrajne_(sh) {
  const R = U_ROWS;
  const ss = sh.getParent();
  styleSection_(sh.getRange('A' + R.eHead + ':C' + R.eHead), 'E. Wartości skrajne');
  sh.getRange('A' + R.eOn + ':A' + R.eProg)
    .setValues([['Odrzucaj skrajne'], ['Metoda'], ['Próg']]).setFontWeight('bold');
  styleInput_(sh.getRange(U.skrajneOn + ':' + U.skrajneProg)
    .setValues([[SKRAJNE_START.on], [SKRAJNE_START.metoda], [SKRAJNE_START.prog]]));
  sh.getRange(U.skrajneOn).setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(['TAK', 'NIE'], true).setAllowInvalid(false).build());
  sh.getRange(U.skrajneMetoda).setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(SKRAJNE_METODY, true).setAllowInvalid(false).build());
  sh.getRange(U.skrajneProg).setNumberFormat('0.0').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireNumberBetween(1, 10).setAllowInvalid(false).setHelpText('Liczba od 1 do 10').build());
  sh.getRange('A' + R.eHead).setNote(
    'W każdej grupie (bój | płeć) dopasowujemy prostą ln(ciężar) względem ln(waga). '
    + 'Zawodnik, którego wynik odbiega od oczekiwanego dla jego wagi o więcej niż „Próg” (w jednostkach odchylenia), '
    + 'jest pomijany w analizie — w obie strony (bardzo słaby i bardzo mocny wynik).\n\n'
    + 'MAD = odporny z-score (mediana i medianowe odchylenie bezwzględne), zalecany próg 3,5.\n'
    + 'SD = zwykły z-score (średnia i odchylenie standardowe), typowy próg 3.\n\n'
    + 'Odrzuconych zawodników pokazuje zakładka „Odrzucone” (po 📊 Analiza → Oblicz korelacje).');
  sh.getRange('C' + R.eOn).setValue('TAK = pomijaj skrajne w analizie').setFontStyle('italic').setFontColor(STYLE.noteFont);
  sh.getRange('C' + R.eMetoda).setValue('MAD (odporny) albo SD').setFontStyle('italic').setFontColor(STYLE.noteFont);
  sh.getRange('C' + R.eProg).setValue('MAD: 3,5; SD: 3').setFontStyle('italic').setFontColor(STYLE.noteFont);
  [['SKRAJNE_ODRZUCAJ', U.skrajneOn], ['SKRAJNE_METODA', U.skrajneMetoda], ['SKRAJNE_PROG', U.skrajneProg]]
    .forEach(([name, a1]) => setNamedRange_(ss, name, sh.getRange(a1)));
}

/**
 * Dopisuje sekcję E do istniejących Ustawień, jeśli jej brak (komórka nagłówka pusta). Nie zmienia innych wartości.
 * @return {boolean} true, jeśli dopisano
 */
function ensureSekcjaSkrajne_(ss) {
  const sh = ss.getSheetByName(SHEET_USTAWIENIA);
  if (!sh || namedRange_(ss, 'SKRAJNE_ODRZUCAJ')) return false;
  if (String(sh.getRange('A' + U_ROWS.eHead).getValue()).trim() !== '') return false;   // coś tam już jest — nie nadpisuj
  writeSekcjaSkrajne_(sh);
  return true;
}

// ---------------------------------------------------------------- Wyniki (zakładka wyliczana)

/**
 * Kolumny zakładki Wyniki. Każda kolumna = jedna formuła ARRAYFORMULA w wierszu 2,
 * wiersz Wyników = ten sam wiersz Danych. Funkcje: d(kol) — zakres w Danych, w(kol) — zakres w Wynikach.
 * Ciężar: Pull-Up = waga + obciążenie, pozostałe = wynik (Snatch = tonaż). Wynik(b) = ciężar / waga ^ b.
 */
const WYNIKI_COLUMNS = [
  { key: 'A', name: 'Zawody',          width: 140, f: (d, w) => `IF(${d('C')}="";"";${d('A')})` },
  { key: 'B', name: 'Kategoria',       width: 180, f: (d, w) => `IF(${d('C')}="";"";${d('B')})` },
  { key: 'C', name: 'Bój',             width: 75,  f: (d, w) => `IF(${d('C')}="";"";${d('C')})` },
  { key: 'D', name: 'Płeć',            width: 45,  f: (d, w) => `IF(${d('C')}="";"";${d('D')})` },
  { key: 'E', name: 'Zawodnik',        width: 190, f: (d, w) => `IF(${d('C')}="";"";${d('E')}&" "&${d('F')})` },
  { key: 'F', name: 'Wynik',           width: 70,  f: (d, w) => `IF(${d('C')}="";"";${d('G')})` },
  { key: 'G', name: 'Waga',            width: 65,  f: (d, w) => `IF(${d('C')}="";"";${d('K')})`, format: '0.00' },
  { key: 'H', name: 'Ciężar',          width: 70,
    note: 'Ciężar do algorytmów: Pull-Up = waga + obciążenie; pozostałe boje = wynik (Snatch = tonaż).',
    f: (d, w) => `IF(ISNUMBER(${w('F')})*ISNUMBER(${w('G')});IF(${w('C')}="Pull-Up";${w('G')}+${w('F')};${w('F')});"")` },
  { key: 'I', name: 'b oficjalny',     width: 75,  format: '0.00',
    note: 'Współczynnik z Ustawień (sekcja B) wg boju i płci.',
    f: (d, w) => `IF(${w('C')}="";"";IFERROR(VLOOKUP(${w('C')};{B_OFICJALNE_BOJE\\B_OFICJALNE};IF(${w('D')}="K";2;3);FALSE);""))` },
  { key: 'J', name: 'W analizie',      width: 75,
    note: '1 = wiersz wchodzi do analizy: jest ciężar, waga i b oficjalny, wynik > 0 oraz pasuje do filtra Zawody / Kategoria z Ustawień.',
    f: (d, w) => `IF(${w('C')}="";"";IF(ISNUMBER(${w('H')})*(${w('F')}>0)*ISNUMBER(${w('I')})`
      + `*((FILTR_ZAWODY="WSZYSTKIE")+(${w('A')}=FILTR_ZAWODY))`
      + `*((FILTR_KATEGORIA="WSZYSTKIE")+(${w('B')}=FILTR_KATEGORIA));1;0))` },
  { key: 'K', name: 'Grupa',           width: 110,
    note: 'Bój | Płeć — grupa do korelacji (krok 4). Puste, gdy wiersz poza analizą.',
    f: (d, w) => `IF(${w('J')}=1;${w('C')}&" | "&${w('D')};"")` },
  { key: 'L', name: 'Wynik b=0',       width: 85,  note: 'Siła absolutna: ciężar.',
    f: (d, w) => `IF(ISNUMBER(${w('H')});${w('H')};"")` },
  { key: 'M', name: 'Wynik b=1',       width: 85,  format: '0.0000', note: 'Siła względna: ciężar / waga.',
    f: (d, w) => `IF(ISNUMBER(${w('H')});${w('H')}/${w('G')};"")` },
  { key: 'N', name: 'Wynik b ofic.',   width: 90,  format: '0.0000', note: 'ciężar / waga ^ b oficjalny',
    f: (d, w) => `IF(ISNUMBER(${w('H')})*ISNUMBER(${w('I')});${w('H')}/${w('G')}^${w('I')};"")` },
  { key: 'O', name: 'Wynik Test 1',    width: 85,  format: '0.0000', note: 'ciężar / waga ^ B_TEST_1',
    f: (d, w) => `IF(ISNUMBER(${w('H')});${w('H')}/${w('G')}^B_TEST_1;"")` },
  { key: 'P', name: 'Wynik Test 2',    width: 85,  format: '0.0000', note: 'ciężar / waga ^ B_TEST_2',
    f: (d, w) => `IF(ISNUMBER(${w('H')});${w('H')}/${w('G')}^B_TEST_2;"")` },
  { key: 'Q', name: 'Wynik Test 3',    width: 85,  format: '0.0000', note: 'ciężar / waga ^ B_TEST_3',
    f: (d, w) => `IF(ISNUMBER(${w('H')});${w('H')}/${w('G')}^B_TEST_3;"")` },
];

/** Zakładka Wyniki — wyliczana: czyszczona i budowana od nowa przy każdej Inicjalizacji. */
function buildWyniki_(ss) {
  let sh = ss.getSheetByName(SHEET_WYNIKI);
  if (sh) {
    sh.clear();                                   // treść + formaty (ten sam arkusz — odwołania z innych zakładek zostają)
    sh.clearNotes();
    sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).clearDataValidations();
  } else {
    sh = ss.insertSheet(SHEET_WYNIKI);
  }
  const n = WYNIKI_COLUMNS.length;
  if (sh.getMaxRows() < MAX_ROWS) sh.insertRowsAfter(sh.getMaxRows(), MAX_ROWS - sh.getMaxRows());
  if (sh.getMaxColumns() < n) sh.insertColumnsAfter(sh.getMaxColumns(), n - sh.getMaxColumns());

  const d = col => SHEET_DANE + '!' + col + '2:' + col + MAX_ROWS;
  const w = col => col + '2:' + col + MAX_ROWS;

  sh.getRange(1, 1, MAX_ROWS, n).setFontFamily(STYLE.font).setFontSize(10);
  styleHeader_(sh.getRange(1, 1, 1, n).setValues([WYNIKI_COLUMNS.map(c => c.name)]).setWrap(true));
  sh.setFrozenRows(1);
  sh.setFrozenColumns(5);

  WYNIKI_COLUMNS.forEach((c, i) => {
    const col = i + 1;
    sh.setColumnWidth(col, c.width);
    if (c.note) sh.getRange(1, col).setNote(c.note);
    if (c.format) sh.getRange(2, col, MAX_ROWS - 1, 1).setNumberFormat(c.format);
    sh.getRange(2, col).setFormula('=ARRAYFORMULA(' + c.f(d, w) + ')');
  });
  sh.getRange('A1').setNote('Zakładka wyliczana — budowana od nowa przy każdej Inicjalizacji. Nie edytuj; dane zmieniaj w zakładce Dane.');
}

/** Usuwa domyślną zakładkę (Arkusz1 / Sheet1), jeśli jest pusta i nie jest jedyną. */
function removeDefaultSheet_(ss) {
  ['Arkusz1', 'Sheet1'].forEach(name => {
    const sh = ss.getSheetByName(name);
    if (sh && ss.getSheets().length > 1 && sh.getLastRow() === 0 && sh.getLastColumn() === 0) {
      ss.deleteSheet(sh);
    }
  });
}

/** Ustawia zakładki w kolejności SHEET_ORDER (przesuwa je, nie zmienia zawartości). */
function orderSheets_(ss) {
  let pos = 1;
  SHEET_ORDER.forEach(name => {
    const sh = ss.getSheetByName(name);
    if (!sh) return;
    ss.setActiveSheet(sh);
    ss.moveActiveSheet(pos++);
  });
  const first = ss.getSheetByName(SHEET_ORDER[0]);
  if (first) ss.setActiveSheet(first);
}

// ---------------------------------------------------------------- Pomocnicze

/**
 * Czy bój to odmiana Snatcha (Snatch 2', Snatch 6', …) — wynik = tonaż,
 * wymagane Odważnik i Powtórzenia, %BW w PDF liczony z odważnika.
 */
function isSnatch_(boj) {
  return /^snatch/i.test(String(boj || '').trim());
}

/** Czy bój to Pull-Up — Wynik = obciążenie dodatkowe, ciężar = waga + obciążenie, BW% = (waga + obciążenie) / waga. */
function isPullUp_(boj) {
  return /^pull-?\s?up$/i.test(String(boj || '').trim());
}

/** Formuła listy: WSZYSTKIE + unikalne, posortowane wartości kolumny z zakładki Dane. */
function uniqueListFormula_(col) {
  const r = SHEET_DANE + '!' + col + '2:' + col;
  return '=IFERROR({"' + WSZYSTKIE + '";SORT(UNIQUE(FILTER(' + r + ';' + r + '<>"")))};"' + WSZYSTKIE + '")';
}

function listValidation_(range) {
  return SpreadsheetApp.newDataValidation()
    .requireValueInRange(range, true)
    .setAllowInvalid(false)
    .build();
}

function styleHeader_(range) {
  return range
    .setFontWeight('bold')
    .setFontColor(STYLE.headerFont)
    .setBackground(STYLE.headerBg)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
}

function styleSection_(range, title) {
  range.setBackground(STYLE.sectionBg);
  range.getCell(1, 1).setValue(title).setFontWeight('bold');
  return range;
}

function styleInput_(range) {
  return range
    .setBackground(STYLE.inputBg)
    .setFontColor(STYLE.inputFont)
    .setHorizontalAlignment('center')
    .setBorder(true, true, true, true, true, true, '#BFBFBF', SpreadsheetApp.BorderStyle.SOLID);
}

/** Komórka współczynnika: pole do edycji, format 0,00, walidacja 0–2. */
function styleCoef_(range) {
  styleInput_(range).setNumberFormat('0.00');
  range.setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireNumberBetween(0, 2)
      .setAllowInvalid(false)
      .setHelpText('Liczba od 0 do 2')
      .build()
  );
  return range;
}
