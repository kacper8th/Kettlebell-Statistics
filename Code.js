/**
 * Code.js — logika projektu Kettlebell Statistics.
 * Struktura arkusza i Inicjalizacja: Template.js.
 */

// ---------------------------------------------------------------- Import CSV

/** Liczba błędów pokazywanych w okienku importu (pozostałe tylko zliczane). */
const IMPORT_MAX_ERRORS = 30;

/** Menu 📥 Dane → Importuj CSV — okienko wyboru pliku. */
function showImportDialog() {
  const html = HtmlService.createHtmlOutputFromFile('Import').setWidth(560).setHeight(460);
  SpreadsheetApp.getUi().showModalDialog(html, 'Importuj CSV');
}

/**
 * Import CSV do zakładki Dane (wywoływany z okienka Import.html).
 *
 * @param {string} text     zawartość pliku CSV
 * @param {boolean} replace true = zastąp istniejące wiersze tych samych Zawodów + Kategorii
 * @return {Object} wynik dla okienka:
 *   { status: 'ok', count, replaced, groups }
 *   { status: 'errors', errors, total }
 *   { status: 'conflict', groups: [{ name, count }] }
 */
function importCsv(text, replace) {
  const parsed = parseImportCsv_(text);
  if (parsed.errors.length) {
    return { status: 'errors', errors: parsed.errors.slice(0, IMPORT_MAX_ERRORS), total: parsed.errors.length };
  }
  if (!parsed.rows.length) {
    return { status: 'errors', errors: ['Plik nie zawiera wierszy z danymi.'], total: 1 };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_DANE);
  if (!sh) {
    return { status: 'errors', errors: ['Brak zakładki Dane — uruchom najpierw ⚙️ Setup → Inicjalizacja.'], total: 1 };
  }

  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    const keyOf = r => r[D.zawody - 1] + ' / ' + r[D.kategoria - 1];
    const importKeys = unique_(parsed.rows.map(keyOf));

    // Istniejące wiersze tych samych Zawodów + Kategorii
    const lastRow = sh.getLastRow();
    const existing = lastRow > 1
      ? sh.getRange(2, 1, lastRow - 1, 2).getValues()
      : [];
    const conflictRows = [];                       // numery wierszy w arkuszu
    const conflictCount = {};
    existing.forEach((r, i) => {
      const key = String(r[0]).trim() + ' / ' + String(r[1]).trim();
      if (importKeys.indexOf(key) >= 0) {
        conflictRows.push(i + 2);
        conflictCount[key] = (conflictCount[key] || 0) + 1;
      }
    });

    if (conflictRows.length && !replace) {
      return {
        status: 'conflict',
        groups: Object.keys(conflictCount).map(k => ({ name: k, count: conflictCount[k] })),
      };
    }

    if (conflictRows.length) {
      // Arkusz nie pozwala usunąć wszystkich niezamrożonych wierszy — w razie potrzeby dokładamy jeden pusty
      if (sh.getMaxRows() - sh.getFrozenRows() - conflictRows.length < 1) sh.insertRowsAfter(sh.getMaxRows(), 1);
      deleteRows_(sh, conflictRows);
    }

    ensureDaneHeaders_(ss);
    const start = appendRows_(sh, parsed.rows);
    applyDaneRules_(ss);
    const w = fillWeights_(sh, start, parsed.rows.length);

    const groups = importKeys.map(k => ({
      name: k,
      count: parsed.rows.filter(r => keyOf(r) === k).length,
    }));
    ss.toast('Zaimportowano ' + parsed.rows.length + ' wierszy. Policzono wagi: ' + w.filled + '.', 'Import CSV', 5);
    return {
      status: 'ok', count: parsed.rows.length, replaced: conflictRows.length, groups: groups,
      weightsFilled: w.filled, weightsFailed: w.failed,
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Czyta i sprawdza CSV. Zwraca wiersze gotowe do zapisu w Danych albo listę błędów.
 * @return {{rows: Array[], errors: string[]}}
 */
function parseImportCsv_(text) {
  const errors = [];
  text = String(text || '').replace(/^﻿/, '');
  if (!text.trim()) return { rows: [], errors: ['Plik jest pusty.'] };

  const firstLine = text.split(/\r?\n/)[0];
  const delim = firstLine.split(';').length >= firstLine.split(',').length ? ';' : ',';

  let data;
  try {
    data = Utilities.parseCsv(text, delim);
  } catch (e) {
    return { rows: [], errors: ['Nie udało się odczytać pliku CSV: ' + e.message] };
  }

  // Nagłówek → numer kolumny w pliku
  const header = data[0].map(h => String(h).trim().toLowerCase());
  const idx = {};
  DANE_COLUMNS.forEach(c => {
    const i = header.indexOf(c.name.toLowerCase());
    if (i < 0 && !c.optional) errors.push('Brak kolumny „' + c.name + '” w nagłówku pliku.');
    idx[c.name] = i;
  });
  if (errors.length) {
    errors.push('Wymagany nagłówek: ' + DANE_COLUMNS.filter(c => !c.optional).map(c => c.name).join(delim)
      + ' (opcjonalnie: ' + DANE_COLUMNS.filter(c => c.optional).map(c => c.name).join(', ') + ')');
    return { rows: [], errors: errors };
  }

  const boje = validBoje_();
  const rows = [];

  for (let i = 1; i < data.length; i++) {
    const line = data[i];
    if (line.every(c => String(c).trim() === '')) continue;    // pusty wiersz
    const lineNo = i + 1;                                     // numer linii w pliku
    const get = name => String(line[idx[name]] === undefined ? '' : line[idx[name]]).trim();
    const err = msg => errors.push('Wiersz ' + lineNo + ': ' + msg);

    const zawody = get('Zawody');
    const kategoria = get('Kategoria');
    const imie = get('Imię');
    const nazwisko = get('Nazwisko');
    if (!zawody) err('puste „Zawody”');
    if (!kategoria) err('pusta „Kategoria”');
    if (!imie) err('puste „Imię”');
    if (!nazwisko) err('puste „Nazwisko”');

    const bojRaw = get('Bój');
    const boj = boje.filter(b => b.toLowerCase() === bojRaw.toLowerCase())[0];
    if (!boj) err('nieznany bój „' + bojRaw + '” (dozwolone: ' + boje.join(', ') + ')');

    const plec = get('Płeć').toUpperCase();
    if (PLCIE.indexOf(plec) < 0) err('płeć „' + get('Płeć') + '” — dozwolone K albo M');

    const wynik = parseNumber_(get('Wynik'));
    if (wynik === null || isNaN(wynik) || wynik < 0) err('„Wynik” musi być liczbą ≥ 0 (jest: „' + get('Wynik') + '”)');

    const bw = parsePercent_(get('BW%'));
    if (bw === null || isNaN(bw) || bw < 0 || bw > BW_MAX) err('„BW%” musi być liczbą od 0% do 300% (jest: „' + get('BW%') + '”)');

    const odwaznik = parseNumber_(get('Odważnik'));
    const powt = parseNumber_(get('Powtórzenia'));
    const isSnatch = isSnatch_(boj);
    if (isSnatch && (odwaznik === null || isNaN(odwaznik) || odwaznik < 0)) err('Snatch wymaga „Odważnik” (liczba ≥ 0)');
    if (isSnatch && (powt === null || isNaN(powt) || powt < 0)) err('Snatch wymaga „Powtórzenia” (liczba ≥ 0)');
    if (!isSnatch && odwaznik !== null && (isNaN(odwaznik) || odwaznik < 0)) err('„Odważnik” musi być liczbą ≥ 0 albo pusty');
    if (!isSnatch && powt !== null && (isNaN(powt) || powt < 0)) err('„Powtórzenia” musi być liczbą ≥ 0 albo puste');

    const waga = parseNumber_(get('Waga'));                   // kolumna opcjonalna
    if (waga !== null && (isNaN(waga) || waga <= 0)) err('„Waga” musi być liczbą > 0 albo pusta (jest: „' + get('Waga') + '”)');

    const row = [];
    row[D.zawody - 1] = zawody;
    row[D.kategoria - 1] = kategoria;
    row[D.boj - 1] = boj || bojRaw;
    row[D.plec - 1] = plec;
    row[D.imie - 1] = imie;
    row[D.nazwisko - 1] = nazwisko;
    row[D.wynik - 1] = wynik;
    row[D.bw - 1] = bw;
    row[D.odwaznik - 1] = odwaznik === null ? '' : odwaznik;
    row[D.powt - 1] = powt === null ? '' : powt;
    row[D.waga - 1] = waga === null ? '' : waga;
    rows.push(row);
  }

  return { rows: errors.length ? [] : rows, errors: errors };
}

/** Lista dozwolonych bojów — z Ustawień (B_OFICJALNE_BOJE), a gdy jej brak, z wartości startowych. */
function validBoje_() {
  const r = SpreadsheetApp.getActiveSpreadsheet().getRangeByName('B_OFICJALNE_BOJE');
  const list = r ? r.getValues().map(v => String(v[0]).trim()).filter(Boolean) : [];
  return list.length ? list : B_OFICJALNE_START.map(v => v[0]);
}

/** "38" / "44,5" / "44.5" → liczba; "" → null; niepoprawne → NaN. */
function parseNumber_(s) {
  s = String(s).replace(/\s/g, '').replace(',', '.');
  if (s === '') return null;
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

/**
 * BW%: "56,5%" / "56.5%" → 0.565; "0,565" → 0.565.
 * Liczba bez znaku % większa niż BW_MAX jest traktowana jako procent ("56,5" → 0.565).
 */
function parsePercent_(s) {
  s = String(s).trim();
  const pct = /%$/.test(s);
  const n = parseNumber_(pct ? s.slice(0, -1) : s);
  if (n === null || isNaN(n)) return n;
  return pct || n > BW_MAX ? Number((n / 100).toFixed(6)) : n;
}

/** Usuwa wiersze o podanych numerach (od dołu, ciągłymi blokami). */
function deleteRows_(sh, rowNumbers) {
  const sorted = rowNumbers.slice().sort((a, b) => b - a);
  let i = 0;
  while (i < sorted.length) {
    let start = sorted[i];
    let len = 1;
    while (i + len < sorted.length && sorted[i + len] === start - 1) {
      start--;
      len++;
    }
    sh.deleteRows(start, len);
    i += len;
  }
}

/**
 * Dopisuje wiersze pod ostatnim wierszem z danymi (dokłada wiersze arkusza, jeśli brakuje).
 * @return {number} numer pierwszego dopisanego wiersza
 */
function appendRows_(sh, rows) {
  const start = Math.max(sh.getLastRow(), 1) + 1;
  const needed = start + rows.length - 1 - sh.getMaxRows();
  if (needed > 0) sh.insertRowsAfter(sh.getMaxRows(), needed);
  sh.getRange(start, 1, rows.length, DANE_COLUMNS.length).setValues(rows);
  return start;
}

// ---------------------------------------------------------------- Wagi

/** Menu 📥 Dane → Policz wagi — uzupełnia puste wagi w całej zakładce Dane. */
function computeWeights() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_DANE);
  if (!sh) {
    SpreadsheetApp.getUi().alert('Brak zakładki Dane — uruchom najpierw ⚙️ Setup → Inicjalizacja.');
    return;
  }
  ensureDaneHeaders_(ss);
  const last = sh.getLastRow();
  const w = last > 1 ? fillWeights_(sh, 2, last - 1) : { filled: 0, failed: [] };
  let msg = 'Uzupełniono wagi: ' + w.filled + '.';
  if (w.failed.length) {
    SpreadsheetApp.getUi().alert('Policz wagi',
      msg + '\n\nNie udało się policzyć wagi (brak lub błędne BW%) w ' + w.failed.length + ' wierszach:\n'
      + w.failed.slice(0, 15).join('\n') + (w.failed.length > 15 ? '\n…' : ''),
      SpreadsheetApp.getUi().ButtonSet.OK);
  } else {
    ss.toast(msg, 'Policz wagi', 5);
  }
}

/**
 * Wylicza wagę z BW% tego samego wiersza — tylko dla pustych komórek Waga (wpisanych wag nie zmienia):
 *  - Snatch:  waga = odważnik / BW%
 *  - Pull-Up: waga = obciążenie / (BW% − 1)     (BW% = (waga + obciążenie) / waga)
 *  - pozostałe boje: waga = wynik / BW%
 * Wynik zaokrąglony do 0,01 kg i zapisany jako liczba.
 * @return {{filled: number, failed: string[]}} failed = opisy wierszy, dla których nie dało się policzyć wagi
 */
function fillWeights_(sh, startRow, numRows) {
  if (numRows < 1) return { filled: 0, failed: [] };
  const data = sh.getRange(startRow, 1, numRows, DANE_COLUMNS.length).getValues();
  const out = [];
  let filled = 0;
  const failed = [];
  data.forEach((r, i) => {
    const current = r[D.waga - 1];
    if (current !== '' && current !== null) {
      out.push([current]);
      return;
    }
    const boj = r[D.boj - 1];
    const wynik = Number(r[D.wynik - 1]);
    const bw = Number(r[D.bw - 1]);
    const odw = Number(r[D.odwaznik - 1]);
    let w = null;
    if (bw > 0) {
      if (isSnatch_(boj)) w = odw > 0 ? odw / bw : null;
      else if (isPullUp_(boj)) w = bw > 1 ? wynik / (bw - 1) : null;
      else w = wynik > 0 ? wynik / bw : null;
    }
    if (w && isFinite(w)) {
      out.push([Math.round(w * 100) / 100]);
      filled++;
    } else {
      out.push(['']);
      if (r[D.zawody - 1] !== '') {
        failed.push('wiersz ' + (startRow + i) + ': ' + r[D.imie - 1] + ' ' + r[D.nazwisko - 1] + ' (' + boj + ')');
      }
    }
  });
  sh.getRange(startRow, D.waga, numRows, 1).setValues(out);
  return { filled: filled, failed: failed };
}

function unique_(arr) {
  return arr.filter((v, i) => arr.indexOf(v) === i);
}
