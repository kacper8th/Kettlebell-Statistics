/**
 * Template.js — struktura arkusza (Inicjalizacja).
 *
 * setupTemplate() jest idempotentna — można ją uruchamiać wielokrotnie:
 *  - zakładki z danymi (Dane) zakłada tylko wtedy, gdy ich brak, i NIGDY ich nie czyści,
 *  - zakładki wyliczane (dochodzą w kolejnych krokach) będzie budować od nowa.
 */

const SHEET_DANE = 'Dane';

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

const STYLE = {
  font: 'Arial',
  headerBg: '#1F3A5F',
  headerFont: '#FFFFFF',
};

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

  if (ensureDane_(ss)) created.push(SHEET_DANE);
  removeDefaultSheet_(ss);

  const msg = created.length
    ? 'Utworzono: ' + created.join(', ')
    : 'Wszystkie zakładki już istnieją — nic nie zmieniono.';
  ss.toast(msg, 'Inicjalizacja zakończona', 5);
}

/**
 * Zakładka Dane — zakładana tylko, jeśli nie istnieje. Istniejącej nie dotyka.
 * @return {boolean} true, jeśli zakładka została utworzona
 */
function ensureDane_(ss) {
  if (ss.getSheetByName(SHEET_DANE)) return false;

  const sh = ss.insertSheet(SHEET_DANE, 0);
  const n = DANE_COLUMNS.length;

  sh.getRange(1, 1, sh.getMaxRows(), n).setFontFamily(STYLE.font).setFontSize(10);

  const header = sh.getRange(1, 1, 1, n);
  header
    .setValues([DANE_COLUMNS.map(c => c.name)])
    .setFontWeight('bold')
    .setFontColor(STYLE.headerFont)
    .setBackground(STYLE.headerBg)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
  sh.setFrozenRows(1);

  DANE_COLUMNS.forEach((c, i) => {
    const col = i + 1;
    sh.setColumnWidth(col, c.width);
    if (c.note) sh.getRange(1, col).setNote(c.note);
    if (c.format) sh.getRange(2, col, sh.getMaxRows() - 1, 1).setNumberFormat(c.format);
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
