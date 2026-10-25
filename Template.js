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
const SHEET_ORDER = [SHEET_USTAWIENIA, SHEET_DANE, SHEET_WYNIKI];

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
    .addItem('Policz wagi', 'computeWeights')
    .addToUi();
}

/** Inicjalizacja — konfiguruje arkusz. Bezpieczna do wielokrotnego uruchamiania. */
function setupTemplate() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const created = [];

  if (ensureUstawienia_(ss)) created.push(SHEET_USTAWIENIA);
  if (ensureDane_(ss)) created.push(SHEET_DANE);
  const addedCols = ensureDaneHeaders_(ss);
  applyDaneRules_(ss);
  buildWyniki_(ss);
  removeDefaultSheet_(ss);
  orderSheets_(ss);

  const msg = (created.length ? 'Utworzono: ' + created.join(', ') + '.' : 'Zakładki z danymi już istnieją — dane bez zmian.')
    + (addedCols.length ? ' Dodano kolumny w Danych: ' + addedCols.join(', ') + '.' : '')
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
