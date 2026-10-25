/**
 * Template.js — struktura arkusza (Inicjalizacja).
 *
 * setupTemplate() jest idempotentna — można ją uruchamiać wielokrotnie:
 *  - zakładki z danymi (Ustawienia, Dane) zakłada tylko wtedy, gdy ich brak, i NIGDY nie zmienia ich wartości,
 *  - wyjątek: walidację i formaty kolumn w Danych nakłada przy każdym uruchomieniu (tylko reguły, nie wartości),
 *  - zakładki wyliczane (dochodzą w kolejnych krokach) będzie budować od nowa.
 */

const SHEET_USTAWIENIA = 'Ustawienia';
const SHEET_DANE = 'Dane';

/** Kolejność zakładek w arkuszu (pozostałe zakładki trafiają za nimi). */
const SHEET_ORDER = [SHEET_USTAWIENIA, SHEET_DANE];

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
];

/** Numery kolumn w Danych (1 = A). */
const D = { zawody: 1, kategoria: 2, boj: 3, plec: 4, imie: 5, nazwisko: 6, wynik: 7, bw: 8, odwaznik: 9, powt: 10 };

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

/** Układ zakładki Ustawienia — numery wierszy sekcji wyliczane z liczby bojów i testów. */
const U_ROWS = (() => {
  const bFirst = 10;                                   // pierwszy bój w sekcji B
  const bLast = bFirst + B_OFICJALNE_START.length - 1;
  const cHead = bLast + 2;                             // nagłówek sekcji C
  const cFirst = cHead + 1;
  const cLast = cFirst + B_TESTOWE_START.length - 1;
  const dHead = cLast + 2;                             // nagłówek sekcji D
  return { bHead: bFirst - 2, bCols: bFirst - 1, bFirst, bLast, cHead, cFirst, cLast,
           dHead, skanStart: dHead + 1, skanKrok: dHead + 2, skanKoniec: dHead + 3 };
})();

/** Adresy komórek w Ustawieniach. */
const U = {
  filtrZawody:    'B5',
  filtrKategoria: 'B6',
  bOficjalneBoje: 'A' + U_ROWS.bFirst + ':A' + U_ROWS.bLast,
  bOficjalne:     'B' + U_ROWS.bFirst + ':C' + U_ROWS.bLast,
  bTest:          B_TESTOWE_START.map((_, i) => 'B' + (U_ROWS.cFirst + i)),
  skanStart:      'B' + U_ROWS.skanStart,
  skanKrok:       'B' + U_ROWS.skanKrok,
  skanKoniec:     'B' + U_ROWS.skanKoniec,
  listaZawodow:   'F5:F200',
  listaKategorii: 'G5:G200',
};

/** Zakresy nazwane — formuły w kolejnych krokach odwołują się do nazw, nie adresów. */
const NAMED_RANGES = {
  FILTR_ZAWODY:     U.filtrZawody,
  FILTR_KATEGORIA:  U.filtrKategoria,
  B_OFICJALNE_BOJE: U.bOficjalneBoje,
  B_OFICJALNE:      U.bOficjalne,
  B_TEST_1:         U.bTest[0],
  B_TEST_2:         U.bTest[1],
  B_TEST_3:         U.bTest[2],
  SKAN_START:       U.skanStart,
  SKAN_KROK:        U.skanKrok,
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
    .addToUi();
}

/** Inicjalizacja — konfiguruje arkusz. Bezpieczna do wielokrotnego uruchamiania. */
function setupTemplate() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const created = [];

  if (ensureUstawienia_(ss)) created.push(SHEET_USTAWIENIA);
  if (ensureDane_(ss)) created.push(SHEET_DANE);
  applyDaneRules_(ss);
  removeDefaultSheet_(ss);
  orderSheets_(ss);

  const msg = (created.length ? 'Utworzono: ' + created.join(', ') : 'Zakładki już istnieją — dane bez zmian.')
    + ' Walidacja Danych zaktualizowana.';
  ss.toast(msg, 'Inicjalizacja zakończona', 5);
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

  const boje = ss.getRangeByName('B_OFICJALNE_BOJE');
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

  // Szerokości kolumn
  [[1, 170], [2, 110], [3, 110], [4, 30], [5, 30], [6, 190], [7, 220]]
    .forEach(([col, w]) => sh.setColumnWidth(col, w));

  // Zakresy nazwane (stare o tych nazwach — np. po ręcznym usunięciu zakładki — są najpierw usuwane)
  Object.entries(NAMED_RANGES).forEach(([name, a1]) => {
    try { ss.removeNamedRange(name); } catch (e) { /* nie istniał */ }
    ss.setNamedRange(name, sh.getRange(a1));
  });

  return true;
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
