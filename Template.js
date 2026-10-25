/**
 * Template.js — struktura arkusza (Inicjalizacja).
 *
 * setupTemplate() jest idempotentna — można ją uruchamiać wielokrotnie:
 *  - zakładki z danymi (Ustawienia, Dane) zakłada tylko wtedy, gdy ich brak, i NIGDY ich nie czyści,
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
  { name: 'Wynik',       width: 80,  note: 'TGU / SSP / 2KBSQ: najlepsze udane podejście (kg).\nSnatch: tonaż = powtórzenia × odważnik.\n0 = brak zaliczonego podejścia (wykluczane z analizy).' },
  { name: 'BW%',         width: 70,  note: 'Z PDF. Wpisuj jako procent (56,5%) albo ułamek (0,565).\nSnatch: w PDF to odważnik / waga zawodnika.', format: '0.0%' },
  { name: 'Odważnik',    width: 90,  note: 'Tylko Snatch — waga odważnika (kg).' },
  { name: 'Powtórzenia', width: 100, note: 'Tylko Snatch — liczba powtórzeń.' },
];

// ---------------------------------------------------------------- Ustawienia

const WSZYSTKIE = 'WSZYSTKIE';

/** Współczynniki oficjalne — wartości startowe (podane przez organizatora). */
const B_OFICJALNE_START = [
  ['TGU',    0.60, 0.67],
  ['SSP',    0.60, 0.67],
  ['2KBSQ',  0.60, 0.67],
  ['Snatch', 0.40, 0.40],
];

/** Współczynniki testowe — wartości startowe. */
const B_TESTOWE_START = [
  ['Test 1', 0.50],
  ['Test 2', 0.67],
  ['Test 3', 0.75],
];

/** Liczba kroków skanu b (start, start + krok, … start + (SKAN_KROKI − 1) · krok). */
const SKAN_KROKI = 151;

/** Układ zakładki Ustawienia — adresy komórek i zakresy nazwane. */
const U = {
  filtrZawody:    'B5',
  filtrKategoria: 'B6',
  bOficjalneBoje: 'A10:A13',
  bOficjalne:     'B10:C13',
  bTest:          ['B16', 'B17', 'B18'],
  skanStart:      'B21',
  skanKrok:       'B22',
  skanKoniec:     'B23',
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
  SpreadsheetApp.getUi()
    .createMenu('⚙️ Setup')
    .addItem('Inicjalizacja', 'setupTemplate')
    .addToUi();
}

/** Inicjalizacja — konfiguruje arkusz. Bezpieczna do wielokrotnego uruchamiania. */
function setupTemplate() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const created = [];

  if (ensureUstawienia_(ss)) created.push(SHEET_USTAWIENIA);
  if (ensureDane_(ss)) created.push(SHEET_DANE);
  removeDefaultSheet_(ss);
  orderSheets_(ss);

  const msg = created.length
    ? 'Utworzono: ' + created.join(', ')
    : 'Wszystkie zakładki już istnieją — nic nie zmieniono.';
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
    if (c.format) sh.getRange(2, col, sh.getMaxRows() - 1, 1).setNumberFormat(c.format);
  });

  return true;
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

  // B. Współczynniki oficjalne
  styleSection_(sh.getRange('A8:C8'), 'B. Współczynniki oficjalne');
  styleHeader_(sh.getRange('A9:C9').setValues([['Bój', 'Kobiety (K)', 'Mężczyźni (M)']]));
  sh.getRange(U.bOficjalneBoje).setValues(B_OFICJALNE_START.map(r => [r[0]])).setFontWeight('bold');
  styleCoef_(sh.getRange(U.bOficjalne).setValues(B_OFICJALNE_START.map(r => [r[1], r[2]])));
  sh.getRange('A9').setNote('Współczynniki używane na zawodach (podane przez organizatora).\nwynik = ciężar / waga ^ b');

  // C. Współczynniki testowe
  styleSection_(sh.getRange('A15:C15'), 'C. Współczynniki testowe');
  sh.getRange('A16:A18').setValues(B_TESTOWE_START.map(r => [r[0]])).setFontWeight('bold');
  styleCoef_(sh.getRange('B16:B18').setValues(B_TESTOWE_START.map(r => [r[1]])));
  sh.getRange('A16').setNote('Dowolne współczynniki do porównania — te same dla K i M.');

  // D. Skan b
  styleSection_(sh.getRange('A20:C20'), 'D. Skan b');
  sh.getRange('A21:A23').setValues([['Start'], ['Krok'], ['Koniec (wyliczony)']]).setFontWeight('bold');
  styleCoef_(sh.getRange('B21:B22').setValues([[0], [0.01]]));
  sh.getRange(U.skanKoniec)
    .setFormula('=' + U.skanStart + '+' + (SKAN_KROKI - 1) + '*' + U.skanKrok)
    .setNumberFormat('0.00');
  sh.getRange('C23').setValue(SKAN_KROKI + ' kroków').setFontStyle('italic').setFontColor(STYLE.noteFont);

  // Szerokości kolumn
  [[1, 170], [2, 110], [3, 110], [4, 30], [5, 30], [6, 190], [7, 220]]
    .forEach(([col, w]) => sh.setColumnWidth(col, w));

  // Zakresy nazwane
  Object.entries(NAMED_RANGES).forEach(([name, a1]) => ss.setNamedRange(name, sh.getRange(a1)));

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
