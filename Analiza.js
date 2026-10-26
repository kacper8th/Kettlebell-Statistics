/**
 * Analiza.js — obliczenia analityczne liczone skryptem na żądanie (menu 📊 Analiza).
 * Wyniki wpisywane jako wartości (nie formuły) — arkusz pozostaje lekki.
 * Każda zakładka pokazuje, kiedy i z jakimi ustawieniami była liczona, oraz ostrzeżenie, gdy Ustawienia / dane się zmieniły.
 */

const SHEET_KORELACJE = 'Korelacje';
const SHEET_ODRZUCONE = 'Odrzucone';
const SHEET_KOR_KAT = 'Korelacje (kategorie)';

/** Kolumny zakładki Wyniki (1 = A) — muszą odpowiadać WYNIKI_COLUMNS w Template.js. */
const W = { zawody: 1, kategoria: 2, boj: 3, plec: 4, zawodnik: 5, wynik: 6, waga: 7, ciezar: 8, bOfic: 9,
            wAnalizie: 10, grupa: 11, b0: 12, b1: 13, bOficWynik: 14, t1: 15, t2: 16, t3: 17 };

/** Algorytmy porównywane w analizie: klucz kolumny w Wynikach i etykieta. */
const ALGOS = [
  { col: W.b0,         label: 'b = 0' },
  { col: W.b1,         label: 'b = 1' },
  { col: W.bOficWynik, label: 'b ofic.' },
  { col: W.t1,         label: 'Test 1', test: 'B_TEST_1' },
  { col: W.t2,         label: 'Test 2', test: 'B_TEST_2' },
  { col: W.t3,         label: 'Test 3', test: 'B_TEST_3' },
];

/** Minimalna liczebność grupy, dla której liczymy statystyki. */
const MIN_N = 5;

// ---------------------------------------------------------------- Menu

/** 📊 Analiza → Oblicz korelacje */
function computeCorrelations() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ctx = analysisContext_(ss);
  if (!ctx) return;

  const rejected = [];
  const groups = ctx.groups.map(g => {
    let rows = ctx.rows.filter(r => r[W.grupa - 1] === g.key);
    const res = { key: g.key, n: rows.length, out: 0, bOfic: g.bOfic, algos: [] };
    if (ctx.skrajne.on && rows.length >= MIN_N) {
      const f = filterOutliers_(rows, ctx.skrajne);
      f.rejected.forEach(x => rejected.push(Object.assign({ grupa: g.key }, x)));
      rows = f.kept;
      res.out = f.rejected.length;
      res.n = rows.length;
    }
    const waga = rows.map(r => Number(r[W.waga - 1]));
    if (rows.length < MIN_N) return res;
    ALGOS.forEach(a => {
      const y = rows.map(r => Number(r[a.col - 1]));
      const r = pearson_(waga, y);
      res.algos.push({ r: r, p: pValue_(r, rows.length), rho: spearman_(waga, y) });
    });
    const ciezar = rows.map(r => Number(r[W.ciezar - 1]));
    res.loglog = slope_(waga.map(Math.log), ciezar.map(Math.log));
    let best = 0;
    res.algos.forEach((a, i) => { if (Math.abs(a.r) < Math.abs(res.algos[best].r)) best = i; });
    res.closest = ALGOS[best].label;
    const ofic = rows.map(r => Number(r[W.bOficWynik - 1]));
    res.agreeB0 = spearman_(ofic, rows.map(r => Number(r[W.b0 - 1])));
    res.agreeB1 = spearman_(ofic, rows.map(r => Number(r[W.b1 - 1])));
    return res;
  });

  writeOdrzucone_(ss, ctx, rejected);
  writeKorelacje_(ss, ctx, groups);
  ss.toast('Policzono korelacje dla ' + groups.filter(g => g.n >= MIN_N).length + ' grup.'
    + (ctx.powtorzenia.najnowszy ? ' Pominięto wcześniejszych startów: ' + ctx.powtorzenia.pominietoRows + '.' : '')
    + (ctx.skrajne.on ? ' Odrzucono skrajnych: ' + rejected.length + '.' : ''), '📊 Analiza', 5);
}

/**
 * 📊 Analiza → Oblicz korelacje w kategoriach
 * Korelacja liczona osobno w każdej kategorii (wg podziału z Ustawień, sekcja F), potem uśredniana
 * metodą Fishera (z = atanh(·), wagi n − 3, powrót tanh(z̄)):
 *  - tabela 1: dla boju | płci (wszystkie kategorie danej płci),
 *  - tabela 2: dla klasy wagowej (K 65, K +65, M 85, M +85) × bój,
 *  - tabela 3: szczegóły — każda kategoria osobno.
 * Wskaźnik główny: ρ Spearmana (miejsca w rankingu — odporny na pojedyncze skrajne osoby); r Pearsona pomocniczo.
 * b neutralne: b, przy którym uśrednione ρ = 0 (kolejność wyników przestaje zależeć od wagi).
 */
function computeCorrelationsByCategory() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ctx = analysisContext_(ss);
  if (!ctx) return;

  const strata = [];          // tabela 3: jedna kategoria w danym boju
  const classRes = [];        // tabela 2: klasa wagowa × bój
  let rejectedCount = 0;
  const klasaOf = r => stratumLabel_(r, PODZIALY[0]);

  const groups = ctx.groups.map(g => {
    const gRows = ctx.valid.filter(r => r[W.boj - 1] === g.boj && r[W.plec - 1] === g.plec);
    const label = r => stratumLabel_(r, ctx.podzial);
    const st = [];
    unique_(gRows.map(label)).sort().forEach(k => {
      let rows = gRows.filter(r => label(r) === k);
      let rej = [];
      if (ctx.skrajne.on && rows.length >= MIN_N) {
        const kept = filterOutliers_(rows, ctx.skrajne).kept;
        rej = rows.filter(r => kept.indexOf(r) < 0);
        rows = kept;
      }
      rejectedCount += rej.length;
      const rec = makeStratum_(rows, { grupa: g.key, kategoria: k, out: rej.length });
      rec.rows = rows;
      rec.rej = rej;
      st.push(rec);
      strata.push(rec);
    });

    // tabela 2 — klasy wagowe tej płci; wewnątrz klasy uśredniane drobniejsze kategorie (wg podziału)
    klasyDlaPlci_(g.plec).forEach(cl => {
      const sub = [];
      let out = 0;
      st.forEach(x => {
        const rr = x.rows.filter(r => klasaOf(r) === cl);
        out += x.rej.filter(r => klasaOf(r) === cl).length;
        if (rr.length) sub.push(makeStratum_(rr, {}));
      });
      const pooled = poolStrata_(sub);
      if (pooled.n > 0) {
        classRes.push(Object.assign({ key: cl + ' | ' + g.boj, klasa: cl, boj: g.boj, bOfic: g.bOfic, out: out }, pooled));
      }
    });

    return Object.assign({ key: g.key, bOfic: g.bOfic, out: st.reduce((s, x) => s + x.out, 0) }, poolStrata_(st));
  });

  const bojOrder = ctx.groups.map(g => g.boj);
  const klasyOrder = PLCIE.reduce((a, p) => a.concat(klasyDlaPlci_(p)), []);
  classRes.sort((a, b) => klasyOrder.indexOf(a.klasa) - klasyOrder.indexOf(b.klasa)
    || bojOrder.indexOf(a.boj) - bojOrder.indexOf(b.boj));

  writeKorKat_(ss, ctx, groups, classRes, strata);
  ss.toast('Policzono korelacje w kategoriach: ' + groups.filter(g => g.k).length + ' grup, '
    + classRes.filter(c => c.k).length + ' wierszy klas wagowych, '
    + strata.filter(x => x.rho.length).length + ' kategorii.'
    + (ctx.powtorzenia.najnowszy ? ' Pominięto wcześniejszych startów: ' + ctx.powtorzenia.pominietoValid + '.' : '')
    + (ctx.skrajne.on ? ' Odrzucono skrajnych: ' + rejectedCount + '.' : ''), '📊 Analiza', 6);
}

/** Etykiety klas wagowych dla płci, np. K → ['K 65', 'K +65']. */
function klasyDlaPlci_(plec) {
  const lim = KLASY_WAGOWE[plec];
  return lim ? [plec + ' ' + lim, plec + ' +' + lim] : [];
}

/** Statystyki jednej kategorii: r i ρ dla każdego algorytmu, b z regresji, b neutralne. */
function makeStratum_(rows, meta) {
  const rec = Object.assign({ n: rows.length, r: [], rho: [], loglog: '', bNeutral: '' }, meta);
  if (rows.length < MIN_N) return rec;
  const w = rows.map(r => Number(r[W.waga - 1]));
  const c = rows.map(r => Number(r[W.ciezar - 1]));
  rec.r = ALGOS.map(a => pearson_(w, rows.map(r => Number(r[a.col - 1]))));
  rec.rho = ALGOS.map(a => spearman_(w, rows.map(r => Number(r[a.col - 1]))));
  rec.loglog = slope_(w.map(Math.log), c.map(Math.log));
  rec.w = w;
  rec.c = c;
  rec.bNeutral = neutralB_([rec]);
  return rec;
}

/**
 * Uśrednia kategorie (Fisher): ρ (główne, z p i 95% CI) i r dla każdego algorytmu,
 * b z regresji wewnątrz kategorii, b neutralne (ρ = 0), algorytm najbliżej 0.
 */
function poolStrata_(st) {
  const used = st.filter(x => x.rho.length && x.rho.every(v => v !== '') && x.r.every(v => v !== ''));
  const res = { k: used.length, n: used.reduce((s, x) => s + x.n, 0), algos: [], within: '', bNeutral: '', closest: '' };
  if (!used.length) return res;
  ALGOS.forEach((a, i) => {
    const pr = fisherPool_(used.map(x => ({ r: x.r[i], n: x.n })));
    const ps = fisherPool_(used.map(x => ({ r: x.rho[i], n: x.n })), SPEARMAN_VAR);
    res.algos.push({ r: pr.r, rho: ps.r, p: ps.p, lo: ps.lo, hi: ps.hi });
  });
  let sxy = 0, sxx = 0;
  used.forEach(x => {
    const lw = x.w.map(Math.log), lc = x.c.map(Math.log);
    const mx = mean_(lw), my = mean_(lc);
    lw.forEach((v, j) => { sxy += (v - mx) * (lc[j] - my); sxx += (v - mx) ** 2; });
  });
  res.within = sxx > 0 ? sxy / sxx : '';
  res.bNeutral = neutralB_(used);
  let best = 0;
  res.algos.forEach((a, i) => { if (Math.abs(a.rho) < Math.abs(res.algos[best].rho)) best = i; });
  res.closest = ALGOS[best].label;
  return res;
}

/** Współczynnik wariancji z = atanh(ρ) dla Spearmana (Fieller i in.): Var ≈ 1,06 / (n − 3). */
const SPEARMAN_VAR = 1.06;

/** Zakres i krok szukania b neutralnego. */
const B_SCAN = { min: -1, max: 2, step: 0.01 };

/**
 * b, przy którym uśrednione ρ(waga, ciężar / waga^b) = 0 w podanych kategoriach (interpolacja liniowa).
 * @param {Object[]} strata — obiekty z polami w (wagi), c (ciężary), n
 * @return {number|string} b albo „< −1” / „> 2”, gdy zero leży poza zakresem
 */
function neutralB_(strata) {
  const rhoAt = b => fisherPool_(strata.map(x => ({
    r: spearman_(x.w, x.c.map((c, j) => c / Math.pow(x.w[j], b))), n: x.n,
  })), SPEARMAN_VAR).r;
  let prevB = B_SCAN.min, prev = rhoAt(prevB);
  if (prev === '') return '';
  for (let b = B_SCAN.min + B_SCAN.step; b <= B_SCAN.max + 1e-9; b += B_SCAN.step) {
    const cur = rhoAt(b);
    if (cur === '') return '';
    if (prev === 0) return prevB;
    if ((prev > 0 && cur <= 0) || (prev < 0 && cur >= 0)) {
      return prevB + (b - prevB) * prev / (prev - cur);
    }
    prevB = b;
    prev = cur;
  }
  return prev > 0 ? '> ' + fmt2_(B_SCAN.max) : '< ' + fmt2_(B_SCAN.min);
}

/**
 * Etykieta kategorii (warstwy) wiersza wg wybranego podziału.
 * Klasa wagowa z nazwy kategorii („65 KG” / „+65 KG”), a gdy jej brak (kategoria otwarta) — wg wagi zawodnika.
 */
function stratumLabel_(r, podzial) {
  const plec = r[W.plec - 1];
  const kat = String(r[W.kategoria - 1]);
  if (podzial === PODZIALY[2]) return r[W.zawody - 1] + ' / ' + kat;
  const m = kat.match(/(\+?)\s*(\d+)\s*KG/i);
  let klasa;
  if (m) {
    klasa = (m[1] ? '+' : '') + m[2];
  } else {
    const lim = KLASY_WAGOWE[plec] || 0;
    klasa = (Number(r[W.waga - 1]) > lim ? '+' : '') + lim;
  }
  const base = plec + ' ' + klasa;
  if (podzial === PODZIALY[1]) return kat.trim().split(/\s+/)[0].toUpperCase() + ' ' + base;
  return base;
}

/**
 * Uśrednianie korelacji (metaanaliza, efekt stały): z = atanh(r), waga n − 3.
 * @param {number} varFactor — mnożnik wariancji (1 dla Pearsona, 1,06 dla Spearmana)
 * @return {{r, p, lo, hi}} uśredniona korelacja, p-value (test z), 95% przedział ufności
 */
function fisherPool_(items, varFactor) {
  const vf = varFactor || 1;
  let sw = 0, swz = 0;
  items.forEach(it => {
    if (it.r === '' || it.r === null || isNaN(it.r)) return;
    const r = Math.max(-0.9999, Math.min(0.9999, it.r));
    const w = it.n - 3;
    if (w <= 0) return;
    sw += w;
    swz += w * 0.5 * Math.log((1 + r) / (1 - r));
  });
  if (sw <= 0) return { r: '', p: '', lo: '', hi: '' };
  const z = swz / sw, se = Math.sqrt(vf / sw);
  return { r: Math.tanh(z), p: 2 * (1 - normCdf_(Math.abs(z) / se)), lo: Math.tanh(z - 1.96 * se), hi: Math.tanh(z + 1.96 * se) };
}

/** Dystrybuanta rozkładu normalnego (Abramowitz–Stegun 7.1.26). */
function normCdf_(x) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t
    * Math.exp(-(x * x) / 2);
  return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

/** Zakładka „Korelacje (kategorie)”: tabela wg płci, tabela wg klas wagowych, szczegóły per kategoria. */
function writeKorKat_(ss, ctx, groups, classRes, strata) {
  let sh = ss.getSheetByName(SHEET_KOR_KAT);
  if (sh) {
    sh.clear();
    sh.clearNotes();
    sh.setConditionalFormatRules([]);
    sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).breakApart();
  } else {
    sh = ss.insertSheet(SHEET_KOR_KAT);
  }
  if (sh.getMaxColumns() < 30) sh.insertColumnsAfter(sh.getMaxColumns(), 30 - sh.getMaxColumns());
  const need = 30 + groups.length + classRes.length + strata.length;
  if (sh.getMaxRows() < need) sh.insertRowsAfter(sh.getMaxRows(), need - sh.getMaxRows());
  sh.getRange(1, 1, sh.getMaxRows(), 30).setFontFamily(STYLE.font).setFontSize(10);

  sh.getRange('A1').setValue('Korelacja wyniku z wagą — w kategoriach, uśredniona').setFontSize(14).setFontWeight('bold');
  sh.getRange('A2').setValue('Podział: ' + ctx.podzial + ' | zawody = ' + ctx.filtrZawody
    + ' (filtr Kategoria nie dotyczy)'
    + powtorzeniaInfo_(ctx, ctx.powtorzenia ? ctx.powtorzenia.pominietoValid : 0)
    + ' | wartości skrajne: ' + (ctx.skrajne.on
      ? 'odrzucane w każdej kategorii (' + ctx.skrajne.metoda + ', próg ' + fmt2_(ctx.skrajne.prog) + ')' : 'nie odrzucane'))
    .setFontWeight('bold');
  sh.getRange('A3').setValue('Obliczono: ' + Utilities.formatDate(new Date(), 'Europe/Warsaw', 'yyyy-MM-dd HH:mm')
    + ' | Test 1 = ' + fmt2_(ctx.tests[0]) + ', Test 2 = ' + fmt2_(ctx.tests[1]) + ', Test 3 = ' + fmt2_(ctx.tests[2]))
    .setFontColor(STYLE.noteFont);
  writeStaleCheck_(sh, 'A4', '📊 Analiza → Oblicz korelacje w kategoriach');

  const algoTitle = (a, i) => a.test ? a.label + ' (b = ' + fmt2_(ctx.tests[i - 3]) + ')' : a.label;

  // ---- Tabela 1: wg płci
  let row = writeSummaryTable_(sh, ctx, 6, '1. Podsumowanie wg płci — bój | płeć (uśrednione ze wszystkich kategorii danej płci)',
    'Grupa', groups, algoTitle);

  // ---- Tabela 2: wg klas wagowych
  row = writeSummaryTable_(sh, ctx, row + 2, '2. Podsumowanie wg klas wagowych — K 65, K +65, M 85, M +85 (wewnątrz klasy uśredniane kategorie wg podziału)',
    'Klasa | bój', classRes, algoTitle, true);

  // ---- Tabela 3: szczegóły per kategoria
  const D0 = row + 3;
  sh.getRange(D0 - 2, 1).setValue('3. Szczegóły — ρ w każdej kategorii osobno (wg podziału z Ustawień, sekcja F)').setFontWeight('bold');
  const dHead = ['Grupa', 'Kategoria (' + ctx.podzial + ')', 'n', 'odrzucono']
    .concat(ALGOS.map((a, i) => 'ρ ' + algoTitle(a, i))).concat(['b neutralne (ρ = 0)', 'b z regresji']);
  styleHeader_(sh.getRange(D0 - 1, 1, 1, dHead.length).setValues([dHead]).setWrap(true));
  sh.setRowHeight(D0 - 1, 40);
  const det = strata.map(x => [x.grupa, x.kategoria, x.n, ctx.skrajne.on ? x.out : '']
    .concat(x.rho.length ? x.rho : new Array(ALGOS.length).fill('')).concat([x.bNeutral, x.loglog]));
  if (det.length) {
    const dr = sh.getRange(D0, 1, det.length, dHead.length).setValues(det);
    dr.setBorder(true, true, true, true, true, true, '#BFBFBF', SpreadsheetApp.BorderStyle.SOLID);
    sh.getRange(D0, 3, det.length, 2).setNumberFormat('0').setHorizontalAlignment('center');
    sh.getRange(D0, 5, det.length, ALGOS.length).setNumberFormat('0.000').setHorizontalAlignment('center');
    sh.getRange(D0, 5 + ALGOS.length, det.length, 2).setNumberFormat('0.00').setHorizontalAlignment('center');
    sh.getRange(D0, 5, det.length, ALGOS.length)
      .setBackgrounds(det.map(r => r.slice(4, 4 + ALGOS.length).map(v => typeof v === 'number' ? divergingColor_(v) : null)));
    det.forEach((r, i) => { if (r[2] < MIN_N) sh.getRange(D0 + i, 1, 1, dHead.length).setFontColor('#9E9E9E'); });
  }

  // ---- Legenda
  const L0 = D0 + det.length + 1;
  [
    'ρ (Spearman) — wskaźnik główny: liczony z miejsc w rankingu, więc pojedyncza skrajna osoba nie może mocno zmienić wyniku. r (Pearson, szary) — pomocniczo; gdy r i ρ są zbliżone, wniosek jest pewny.',
    'b neutralne (ρ = 0): wykładnik b, przy którym kolejność wyników (ciężar / waga^b) przestaje zależeć od wagi — szukany w zakresie od −1 do 2 co 0,01.',
    'Tabela 2: klasa wagowa z nazwy kategorii („65 KG” / „+65 KG”); kategoria bez klasy (np. PRO KOBIET w PP 2024) — wg wagi zawodnika (granice K 65 kg, M 85 kg). Wiersze bez danych pominięte.',
    'Uśrednienie: korelacja → z = atanh, średnia ważona n − 3, z powrotem tanh. p i 95% CI dla ρ z testu z (wariancja 1,06 / (n − 3)).',
    'b z regresji: nachylenie ln(ciężar) względem ln(waga) w obrębie kategorii — wrażliwe na skrajne osoby, dlatego pomocniczo.',
    'Kolory: pomarańcz = faworyzuje lżejszych, zielony = neutralny, niebieski = cięższych; p < 0,05 na czerwono. Kategorie z n < ' + MIN_N + ' pominięte (szare).',
  ].forEach((t, i) => sh.getRange(L0 + i, 1).setValue(t).setFontStyle('italic').setFontColor(STYLE.noteFont));

  const FIX = 5, cx = FIX + 1 + ALGOS.length * 3;
  sh.setColumnWidth(1, 140);
  sh.setColumnWidth(2, 150);
  sh.setColumnWidth(3, 60);
  sh.setColumnWidth(4, 75);
  sh.setColumnWidth(5, 70);
  for (let c = 6; c <= cx + 3; c++) sh.setColumnWidth(c, 60);
  [cx, cx + 1, cx + 2, cx + 3].forEach(c => sh.setColumnWidth(c, 105));
  sh.setFrozenRows(0);
  sh.setFrozenColumns(1);
  orderSheets_(ss);
  ss.setActiveSheet(sh);
}

/**
 * Tabela podsumowania (uśrednione ρ / p / r dla algorytmów + b neutralne, CI, b z regresji, najbliżej 0).
 * @param {boolean} skipEmpty — pomijaj wiersze bez danych
 * @return {number} numer ostatniego wiersza tabeli
 */
function writeSummaryTable_(sh, ctx, top, title, labelHeader, items, algoTitle, skipEmpty) {
  const hdr = (r, c, rs, cs, text, sub) => {
    const rg = sh.getRange(r, c, rs, cs);
    if (rs > 1 || cs > 1) rg.merge();
    rg.setValue(text);
    sub ? rg.setBackground(STYLE.sectionBg).setFontWeight('bold').setHorizontalAlignment('center')
        : styleHeader_(rg).setWrap(true);
  };
  const list = skipEmpty ? items.filter(g => g.k) : items;
  const HR = top + 1, SR = top + 2, R0 = top + 3, FIX = 5;
  sh.getRange(top, 1).setValue(title).setFontWeight('bold');
  hdr(HR, 1, 2, 1, labelHeader);
  hdr(HR, 2, 2, 1, 'kategorii');
  hdr(HR, 3, 2, 1, 'n');
  hdr(HR, 4, 2, 1, 'odrzucono');
  hdr(HR, 5, 2, 1, 'b oficjalny');
  ALGOS.forEach((a, i) => {
    const c = FIX + 1 + i * 3;
    hdr(HR, c, 1, 3, algoTitle(a, i));
    hdr(SR, c, 1, 1, 'ρ', true);
    hdr(SR, c + 1, 1, 1, 'p', true);
    hdr(SR, c + 2, 1, 1, 'r', true);
  });
  const cx = FIX + 1 + ALGOS.length * 3;
  hdr(HR, cx, 2, 1, 'b neutralne (ρ = 0)');
  hdr(HR, cx + 1, 2, 1, '95% CI ρ (ofic.)');
  hdr(HR, cx + 2, 2, 1, 'b z regresji (pomocniczo)');
  hdr(HR, cx + 3, 2, 1, 'Najbliżej 0 (ρ)');
  sh.setRowHeight(HR, 48);
  const nCols = cx + 3;
  if (!list.length) {
    sh.getRange(R0, 1).setValue('Brak danych.').setFontStyle('italic');
    return R0;
  }

  const out = list.map(g => {
    const row = [g.key, g.k, g.n, ctx.skrajne.on ? g.out : '', g.bOfic];
    if (!g.algos.length) return row.concat(new Array(nCols - FIX).fill(''));
    g.algos.forEach(a => row.push(a.rho, a.p, a.r));
    const o = g.algos[2];
    row.push(g.bNeutral, o.rho === '' ? '' : fmt3_(o.lo) + ' … ' + fmt3_(o.hi), g.within, g.closest);
    return row;
  });
  const rng = sh.getRange(R0, 1, out.length, nCols).setValues(out);
  rng.setBorder(true, true, true, true, true, true, '#BFBFBF', SpreadsheetApp.BorderStyle.SOLID);
  sh.getRange(R0, 2, out.length, nCols - 1).setHorizontalAlignment('center');
  sh.getRange(R0, 2, out.length, 3).setNumberFormat('0');
  sh.getRange(R0, FIX, out.length, 1).setNumberFormat('0.00');
  sh.getRange(R0, FIX + 1, out.length, ALGOS.length * 3).setNumberFormat('0.000');
  sh.getRange(R0, cx + 2, out.length, 1).setNumberFormat('0.00');
  colorBlocks_(sh, R0, out, FIX, 3, [0, 2], 1);
  sh.getRange(R0, cx, out.length, 1).setNumberFormat('0.00').setFontWeight('bold').setBackground('#FFF2CC');
  ALGOS.forEach((a, i) => sh.getRange(R0, FIX + 3 + i * 3, out.length, 1).setFontColor('#757575'));
  list.forEach((g, i) => { if (!g.k) sh.getRange(R0 + i, 1, 1, nCols).setFontColor('#9E9E9E'); });
  // grube linie między blokami (zmiana pierwszego członu etykiety, np. klasy wagowej)
  if (skipEmpty) {
    for (let i = 1; i < list.length; i++) {
      if (String(list[i].key).split(' | ')[0] !== String(list[i - 1].key).split(' | ')[0]) {
        sh.getRange(R0 + i, 1, 1, nCols).setBorder(true, null, null, null, null, null, '#1F3A5F', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
      }
    }
  }
  return R0 + out.length - 1;
}

/**
 * Kolory w blokach algorytmów: kolumny korelacji (indeksy colorIdx w bloku) — skala; kolumna p (pIdx) — czerwona, gdy < 0,05.
 * @param {number} step — liczba kolumn w bloku jednego algorytmu
 */
function colorBlocks_(sh, r0, rows, fix, step, colorIdx, pIdx) {
  const nCols = rows[0].length;
  const bg = [], fc = [], fw = [];
  rows.forEach(row => {
    const b = [], f = [], w = [];
    for (let c = 0; c < nCols; c++) {
      const v = row[c], k = c - fix, inBlock = k >= 0 && k < ALGOS.length * step, pos = k % step;
      b.push(inBlock && colorIdx.indexOf(pos) >= 0 && typeof v === 'number' ? divergingColor_(v) : null);
      const sig = inBlock && pos === pIdx && typeof v === 'number' && v < 0.05;
      f.push(sig ? '#C00000' : null);
      w.push(sig ? 'bold' : null);
    }
    bg.push(b); fc.push(f); fw.push(w);
  });
  sh.getRange(r0, 1, rows.length, nCols).setBackgrounds(bg).setFontColors(fc).setFontWeights(fw);
  sh.getRange(r0, 1, rows.length, 1).setFontWeight('bold');
}

function fmt3_(v) {
  return typeof v === 'number' ? v.toFixed(3).replace('.', ',') : '';
}

// ---------------------------------------------------------------- Dane wejściowe

/**
 * Wiersze z Wyników (tylko „W analizie” = 1) + grupy bój × płeć z Ustawień + parametry.
 * @return {Object|null}
 */
function analysisContext_(ss) {
  const wy = ss.getSheetByName(SHEET_WYNIKI);
  if (!wy) {
    SpreadsheetApp.getUi().alert('Brak zakładki Wyniki — uruchom najpierw ⚙️ Setup → Inicjalizacja.');
    return null;
  }
  const last = wy.getLastRow();
  const all = last > 1 ? wy.getRange(2, 1, last - 1, W.t3).getValues() : [];
  const rows = all.filter(r => r[W.wAnalizie - 1] === 1 && r[W.grupa - 1] !== '');

  const missing = ['B_OFICJALNE_BOJE', 'B_OFICJALNE', 'FILTR_ZAWODY', 'FILTR_KATEGORIA', 'B_TEST_1', 'B_TEST_2', 'B_TEST_3']
    .filter(n => !namedRange_(ss, n));
  if (missing.length) {
    SpreadsheetApp.getUi().alert('Brak zakresów nazwanych: ' + missing.join(', ')
      + '.\nUruchom ⚙️ Setup → Inicjalizacja (naprawi je), a potem ponownie Oblicz korelacje.');
    return null;
  }
  const boje = namedRange_(ss, 'B_OFICJALNE_BOJE').getValues().map(v => String(v[0]).trim());
  const bOf = namedRange_(ss, 'B_OFICJALNE').getValues();
  const groups = [];
  boje.forEach((b, i) => {
    if (!b) return;
    PLCIE.forEach((p, j) => groups.push({ key: b + ' | ' + p, boj: b, plec: p, bOfic: bOf[i][j] }));
  });

  const val = name => namedRange_(ss, name).getValue();
  const opt = (name, def) => { const r = namedRange_(ss, name); return r ? r.getValue() : def; };
  const fz = val('FILTR_ZAWODY');
  // wiersze poprawne niezależnie od filtra kategorii (dla analizy w kategoriach) — filtr Zawody nadal działa
  const valid = all.filter(r => r[W.boj - 1] !== '' && typeof r[W.ciezar - 1] === 'number'
    && typeof r[W.waga - 1] === 'number' && r[W.waga - 1] > 0 && typeof r[W.bOfic - 1] === 'number'
    && Number(r[W.wynik - 1]) > 0 && (fz === 'WSZYSTKIE' || r[W.zawody - 1] === fz));

  // powtarzający się zawodnicy (Ustawienia, sekcja G) — po filtrze Zawody, przed wartościami skrajnymi
  const powtOpt = String(opt('POWTORZENIA', POWTORZENIA_OPCJE[0]));
  const najnowszy = powtOpt === POWTORZENIA_OPCJE[1];
  const dRows = najnowszy ? dedupNewest_(rows) : { kept: rows, dropped: [], conflicts: [] };
  const dValid = najnowszy ? dedupNewest_(valid) : { kept: valid, dropped: [], conflicts: [] };
  const conflicts = unique_(dRows.conflicts.concat(dValid.conflicts));
  if (conflicts.length) {
    SpreadsheetApp.getUi().alert('Powtarzający się zawodnicy — „' + POWTORZENIA_OPCJE[1] + '”: nie da się ustalić, który start jest najnowszy.\n\n'
      + conflicts.slice(0, 15).join('\n') + (conflicts.length > 15 ? '\n… i ' + (conflicts.length - 15) + ' więcej' : '')
      + '\n\nKolejność zawodów jest brana z roku w nazwie zawodów (np. „MP 2026 Bochnia”). '
      + 'Dopisz rok do nazwy zawodów albo wybierz w Ustawieniach (sekcja G) „' + POWTORZENIA_OPCJE[0] + '”.');
    return null;
  }
  return {
    rows: dRows.kept,
    valid: dValid.kept,
    powtorzenia: { najnowszy: najnowszy, pominietoRows: dRows.dropped.length, pominietoValid: dValid.dropped.length },
    groups: groups,
    skrajne: {
      on: String(opt('SKRAJNE_ODRZUCAJ', 'NIE')).toUpperCase() === 'TAK',
      metoda: String(opt('SKRAJNE_METODA', 'MAD')).toUpperCase() === 'SD' ? 'SD' : 'MAD',
      prog: Number(opt('SKRAJNE_PROG', 3.5)) || 3.5,
    },
    podzial: PODZIALY.indexOf(String(opt('PODZIAL_KATEGORII', PODZIALY[0]))) >= 0
      ? String(opt('PODZIAL_KATEGORII', PODZIALY[0])) : PODZIALY[0],
    filtrZawody: val('FILTR_ZAWODY'),
    filtrKategoria: val('FILTR_KATEGORIA'),
    tests: ALGOS.filter(a => a.test).map(a => val(a.test)),
  };
}

// ---------------------------------------------------------------- Powtarzający się zawodnicy

/** Klucz zawodnika: imię + nazwisko bez względu na wielkość liter, polskie znaki i nadmiarowe spacje. */
function zawodnikKey_(name) {
  return String(name || '').toLowerCase().replace(/ł/g, 'l')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ').trim();
}

/** Rok zawodów z nazwy (np. „MP 2026 Bochnia” → 2026) albo null. */
function zawodyYear_(zawody) {
  const m = String(zawody || '').match(/\b(19|20)\d{2}\b/);
  return m ? Number(m[0]) : null;
}

/**
 * Zostawia jeden wynik zawodnika w każdym boju | płci — z najnowszych zawodów (rok z nazwy zawodów).
 * Kilka wierszy tego samego zawodnika na tych samych zawodach zostaje (to nie powtórzony start).
 * Konflikt = dwa różne zawody z tym samym (albo nieznanym) rokiem jako kandydaci na najnowszy start.
 * @param {Array[]} rows — wiersze Wyników
 * @return {{kept: Array[], dropped: Array[], conflicts: string[]}}
 */
function dedupNewest_(rows) {
  const byKey = {};
  rows.forEach(r => {
    const k = r[W.boj - 1] + ' | ' + r[W.plec - 1] + ' | ' + zawodnikKey_(r[W.zawodnik - 1]);
    (byKey[k] = byKey[k] || []).push(r);
  });
  const keep = new Set(), conflicts = [];
  Object.keys(byKey).forEach(k => {
    const list = byKey[k];
    const zawody = unique_(list.map(r => r[W.zawody - 1]));
    if (zawody.length === 1) { list.forEach(r => keep.add(r)); return; }
    const years = zawody.map(zawodyYear_);
    if (years.some(y => y === null)) {
      conflicts.push(list[0][W.zawodnik - 1] + ' (' + list[0][W.boj - 1] + '): brak roku w nazwie — ' + zawody.join(', '));
      return;
    }
    const maxY = Math.max.apply(null, years);
    const newest = zawody.filter((z, i) => years[i] === maxY);
    if (newest.length > 1) {
      conflicts.push(list[0][W.zawodnik - 1] + ' (' + list[0][W.boj - 1] + '): ' + newest.join(' i ') + ' — ten sam rok');
      return;
    }
    list.forEach(r => { if (r[W.zawody - 1] === newest[0]) keep.add(r); });
  });
  return { kept: rows.filter(r => keep.has(r)), dropped: rows.filter(r => !keep.has(r)), conflicts: conflicts };
}

/** Opis opcji powtórzeń do wiersza z ustawieniami (A2). @param {number} dropped — ile wierszy pominięto */
function powtorzeniaInfo_(ctx, dropped) {
  return ' | powtórzenia: ' + (ctx.powtorzenia && ctx.powtorzenia.najnowszy
    ? 'najnowszy start (pominięto ' + dropped + ' wcześniejszych)' : 'wszystkie starty');
}

// ---------------------------------------------------------------- Zapis zakładki Korelacje

function writeKorelacje_(ss, ctx, groups) {
  let sh = ss.getSheetByName(SHEET_KORELACJE);
  if (sh) {
    sh.clear();
    sh.clearNotes();
    sh.setConditionalFormatRules([]);
    sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).breakApart();
  } else {
    sh = ss.insertSheet(SHEET_KORELACJE);
  }

  const HR = 6, SR = 7, R0 = 8;                       // nagłówek bloków, podnagłówek, pierwszy wiersz danych
  const FIX = 4;                                      // Grupa, n, odrzucono, b ofic
  const nCols = FIX + ALGOS.length * 3 + 4;           // … | 6×(r,p,ρ) | log-log, najbliżej 0, 2× zgodność
  if (sh.getMaxColumns() < 26) sh.insertColumnsAfter(sh.getMaxColumns(), 26 - sh.getMaxColumns());
  sh.getRange(1, 1, sh.getMaxRows(), 26).setFontFamily(STYLE.font).setFontSize(10);

  // Nagłówek i stan
  sh.getRange('A1').setValue('Korelacja wyniku z wagą zawodnika').setFontSize(14).setFontWeight('bold');
  sh.getRange('A2').setValue('Zakres: zawody = ' + ctx.filtrZawody + ', kategoria = ' + ctx.filtrKategoria
    + ' | wierszy w analizie: ' + ctx.rows.length
    + powtorzeniaInfo_(ctx, ctx.powtorzenia ? ctx.powtorzenia.pominietoRows : 0)
    + ' | wartości skrajne: ' + (ctx.skrajne.on
      ? 'odrzucane (' + ctx.skrajne.metoda + ', próg ' + fmt2_(ctx.skrajne.prog) + ') — lista w zakładce „Odrzucone”'
      : 'nie odrzucane')).setFontWeight('bold');
  sh.getRange('A3').setValue('Obliczono: ' + Utilities.formatDate(new Date(), 'Europe/Warsaw', 'yyyy-MM-dd HH:mm')
    + ' | Test 1 = ' + fmt2_(ctx.tests[0]) + ', Test 2 = ' + fmt2_(ctx.tests[1]) + ', Test 3 = ' + fmt2_(ctx.tests[2]))
    .setFontColor(STYLE.noteFont);
  writeStaleCheck_(sh, 'A4', '📊 Analiza → Oblicz korelacje');

  // Nagłówki tabeli
  const hdr = (r, c, rs, cs, text, sub) => {
    const rg = sh.getRange(r, c, rs, cs);
    if (rs > 1 || cs > 1) rg.merge();
    rg.setValue(text);
    sub ? rg.setBackground(STYLE.sectionBg).setFontWeight('bold').setHorizontalAlignment('center')
        : styleHeader_(rg).setWrap(true);
  };
  hdr(HR, 1, 2, 1, 'Grupa');
  hdr(HR, 2, 2, 1, 'n');
  hdr(HR, 3, 2, 1, 'odrzucono');
  hdr(HR, 4, 2, 1, 'b oficjalny');
  ALGOS.forEach((a, i) => {
    const c = FIX + 1 + i * 3;
    const title = a.test ? a.label + ' (b = ' + fmt2_(ctx.tests[i - 3]) + ')' : a.label;
    hdr(HR, c, 1, 3, title);
    ['r', 'p', 'ρ'].forEach((t, k) => hdr(SR, c + k, 1, 1, t, true));
  });
  const cx = FIX + 1 + ALGOS.length * 3;
  hdr(HR, cx, 2, 1, 'b z regresji log-log');
  hdr(HR, cx + 1, 2, 1, 'Najbliżej 0 (r)');
  hdr(HR, cx + 2, 2, 1, 'Zgodność rankingu: ofic. vs b=0 (ρ)');
  hdr(HR, cx + 3, 2, 1, 'Zgodność rankingu: ofic. vs b=1 (ρ)');
  sh.setRowHeight(HR, 48);

  // Dane
  const out = groups.map(g => {
    const row = [g.key, g.n, ctx.skrajne.on ? g.out : '', g.bOfic];
    if (!g.algos.length) return row.concat(new Array(nCols - FIX).fill(''));
    g.algos.forEach(a => row.push(a.r, a.p, a.rho));
    return row.concat([g.loglog, g.closest, g.agreeB0, g.agreeB1]);
  });
  const data = sh.getRange(R0, 1, out.length, nCols).setValues(out);
  data.setBorder(true, true, true, true, true, true, '#BFBFBF', SpreadsheetApp.BorderStyle.SOLID);
  sh.getRange(R0, 2, out.length, nCols - 1).setHorizontalAlignment('center');
  sh.getRange(R0, 1, out.length, 1).setFontWeight('bold');
  sh.getRange(R0, 2, out.length, 2).setNumberFormat('0');
  sh.getRange(R0, FIX, out.length, 1).setNumberFormat('0.00');
  sh.getRange(R0, FIX + 1, out.length, ALGOS.length * 3).setNumberFormat('0.000');
  sh.getRange(R0, cx, out.length, 1).setNumberFormat('0.00');
  sh.getRange(R0, cx + 2, out.length, 2).setNumberFormat('0.000');

  // Kolory nadawane wprost przez skrypt (wartości są statyczne, więc bez formatowania warunkowego):
  // r i ρ — pomarańcz = faworyzuje lżejszych, zielony = neutralny, niebieski = cięższych; p < 0,05 — czerwone, pogrubione
  const bg = [], fc = [], fw = [];
  out.forEach(row => {
    const b = [], f = [], w = [];
    for (let c = 0; c < nCols; c++) {
      const v = row[c];
      const k = c - FIX;                                 // pozycja w blokach r, p, ρ
      const inBlock = k >= 0 && k < ALGOS.length * 3;
      if (inBlock && k % 3 !== 1 && typeof v === 'number') b.push(divergingColor_(v));
      else b.push(null);
      const sig = inBlock && k % 3 === 1 && typeof v === 'number' && v < 0.05;
      f.push(sig ? '#C00000' : null);
      w.push(sig ? 'bold' : null);
    }
    bg.push(b); fc.push(f); fw.push(w);
  });
  data.setBackgrounds(bg);
  sh.getRange(R0, 1, out.length, nCols).setFontColors(fc).setFontWeights(fw);
  sh.getRange(R0, 1, out.length, 1).setFontWeight('bold');
  groups.forEach((g, i) => { if (g.n < MIN_N) sh.getRange(R0 + i, 1, 1, nCols).setFontColor('#9E9E9E'); });

  // Legenda
  const notes = [
    'r = korelacja Pearsona, ρ = Spearmana (na rangach), p = p-value dla r. Liczone w grupach bój | płeć z wierszy „W analizie” (zakładka Wyniki).',
    'Kolory: pomarańczowy = algorytm faworyzuje lżejszych, zielony = neutralny wobec wagi, niebieski = faworyzuje cięższych.',
    'p na czerwono (< 0,05) = zależność od wagi raczej realna, nie przypadkowa. Przy małym n traktuj ostrożnie.',
    'b z regresji log-log: nachylenie ln(ciężar) względem ln(waga) — wykładnik, przy którym wynik / waga^b przestaje (w przybliżeniu) zależeć od wagi.',
    'Najbliżej 0: algorytm z najmniejszym |r|. Zgodność rankingu: ρ między wynikami oficjalnymi a b=0 / b=1 (1 = identyczna kolejność).',
    'n = liczba wyników użytych w statystykach (po odrzuceniu skrajnych). Odrzucono = ilu zawodników pominął filtr wartości skrajnych (Ustawienia, sekcja E).',
    'Grupy z n < ' + MIN_N + ' — bez statystyk (wyszarzone). Zmiana Ustawień lub danych → kliknij ponownie 📊 Analiza → Oblicz korelacje.',
  ];
  notes.forEach((t, i) => sh.getRange(R0 + out.length + 1 + i, 1).setValue(t).setFontStyle('italic').setFontColor(STYLE.noteFont));

  // Szerokości, zamrożenie
  sh.setColumnWidth(1, 120);
  sh.setColumnWidth(2, 45);
  sh.setColumnWidth(3, 75);
  sh.setColumnWidth(4, 70);
  for (let c = FIX + 1; c < cx; c++) sh.setColumnWidth(c, 58);
  [cx, cx + 1, cx + 2, cx + 3].forEach(c => sh.setColumnWidth(c, 105));
  sh.setFrozenRows(SR);
  sh.setFrozenColumns(1);
  orderSheets_(ss);
  ss.setActiveSheet(sh);
}

/**
 * Wskaźnik aktualności: w kolumnie Z zapisuje „podpis” Ustawień i danych z chwili obliczenia (wartość)
 * oraz ten sam podpis liczony na żywo (formuła). Komórka statusu porównuje oba.
 */
function writeStaleCheck_(sh, statusCell, action) {
  const sig = '=FILTR_ZAWODY&"|"&FILTR_KATEGORIA&"|"&TEXTJOIN(";";FALSE;B_OFICJALNE_BOJE;B_OFICJALNE)'
    + '&"|"&B_TEST_1&"|"&B_TEST_2&"|"&B_TEST_3'
    + '&"|"&IFERROR(SKRAJNE_ODRZUCAJ&SKRAJNE_METODA&SKRAJNE_PROG;"")&"|"&IFERROR(PODZIAL_KATEGORII;"")&"|"&IFERROR(POWTORZENIA;"")'
    + '&"|"&SUM(' + SHEET_WYNIKI + '!J2:J' + MAX_ROWS + ')&"|"&ROUND(SUM(' + SHEET_WYNIKI + '!H2:H' + MAX_ROWS + ');3)';
  const live = sh.getRange('Z2');
  live.setFormula(sig);
  SpreadsheetApp.flush();
  sh.getRange('Z1').setValue(live.getDisplayValue());
  sh.getRange(statusCell)
    .setFormula('=IF(Z1=Z2;"✓ Aktualne";"⚠ Ustawienia lub dane zmienione od ostatniego obliczenia — kliknij ' + action + '")')
    .setFontWeight('bold');
  const rules = sh.getConditionalFormatRules();
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextStartsWith('⚠')
    .setFontColor('#C00000').setBackground('#FCE8E6').setRanges([sh.getRange(statusCell)]).build());
  sh.setConditionalFormatRules(rules);
  sh.hideColumns(26);
}

// ---------------------------------------------------------------- Wartości skrajne

/**
 * Odrzuca wartości skrajne w grupie: reszty z regresji ln(ciężar) względem ln(waga),
 * z-score MAD (0,6745·(e − mediana)/MAD) albo SD ((e − średnia)/odch. std.); |z| > próg → odrzucony.
 * @return {{kept: Array[], rejected: Object[]}}
 */
function filterOutliers_(rows, opt) {
  const lw = rows.map(r => Math.log(Number(r[W.waga - 1])));
  const lc = rows.map(r => Math.log(Number(r[W.ciezar - 1])));
  const b = slope_(lw, lc);
  if (b === '') return { kept: rows, rejected: [] };
  const a = mean_(lc) - b * mean_(lw);
  const e = lc.map((v, i) => v - (a + b * lw[i]));
  let z;
  if (opt.metoda === 'SD') {
    const m = mean_(e);
    const sd = Math.sqrt(e.reduce((s, v) => s + (v - m) ** 2, 0) / (e.length - 1));
    z = e.map(v => sd > 0 ? (v - m) / sd : 0);
  } else {
    const med = median_(e);
    const mad = median_(e.map(v => Math.abs(v - med)));
    z = e.map(v => mad > 0 ? 0.6745 * (v - med) / mad : 0);
  }
  const kept = [], rejected = [];
  rows.forEach((r, i) => {
    if (Math.abs(z[i]) > opt.prog) {
      const expected = Math.exp(a + b * lw[i]);
      rejected.push({
        zawody: r[W.zawody - 1], kategoria: r[W.kategoria - 1], zawodnik: r[W.zawodnik - 1],
        waga: Number(r[W.waga - 1]), ciezar: Number(r[W.ciezar - 1]), oczekiwany: expected,
        odchylenie: Number(r[W.ciezar - 1]) / expected - 1, z: z[i],
      });
    } else {
      kept.push(r);
    }
  });
  return { kept: kept, rejected: rejected };
}

function median_(a) {
  const s = a.slice().sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Zakładka Odrzucone — lista zawodników pominiętych przez filtr wartości skrajnych (budowana od nowa). */
function writeOdrzucone_(ss, ctx, rejected) {
  let sh = ss.getSheetByName(SHEET_ODRZUCONE);
  if (sh) {
    sh.clear();
    sh.clearNotes();
    sh.setConditionalFormatRules([]);
  } else {
    sh = ss.insertSheet(SHEET_ODRZUCONE);
  }
  sh.getRange(1, 1, sh.getMaxRows(), 10).setFontFamily(STYLE.font).setFontSize(10);
  sh.getRange('A1').setValue('Wartości skrajne — zawodnicy pominięci w analizie').setFontSize(14).setFontWeight('bold');
  const info = ctx.skrajne.on
    ? 'Metoda: ' + ctx.skrajne.metoda + ', próg: ' + fmt2_(ctx.skrajne.prog) + ' | zakres: zawody = ' + ctx.filtrZawody
      + ', kategoria = ' + ctx.filtrKategoria + ' | odrzucono: ' + rejected.length
    : 'Filtr wartości skrajnych jest wyłączony (Ustawienia, sekcja E → Odrzucaj skrajne = TAK).';
  sh.getRange('A2').setValue(info).setFontWeight('bold');
  sh.getRange('A3').setValue('Obliczono: ' + Utilities.formatDate(new Date(), 'Europe/Warsaw', 'yyyy-MM-dd HH:mm')
    + ' — razem z 📊 Analiza → Oblicz korelacje.').setFontColor(STYLE.noteFont);
  writeStaleCheck_(sh, 'A4', '📊 Analiza → Oblicz korelacje');

  const head = ['Grupa', 'Zawody', 'Kategoria', 'Zawodnik', 'Waga', 'Ciężar', 'Oczekiwany ciężar', 'Odchylenie', 'z'];
  styleHeader_(sh.getRange(6, 1, 1, head.length).setValues([head]));
  sh.getRange(6, 7).setNote('Ciężar oczekiwany dla tej wagi z prostej ln(ciężar) ~ ln(waga) w grupie.');
  sh.getRange(6, 8).setNote('Ciężar / oczekiwany − 1. Ujemne = wynik słabszy niż typowy dla tej wagi.');
  sh.getRange(6, 9).setNote('Z-score reszty (MAD albo SD). Odrzucono, gdy |z| > próg.');
  if (rejected.length) {
    rejected.sort((x, y) => x.grupa.localeCompare(y.grupa) || x.z - y.z);
    const rows = rejected.map(x => [x.grupa, x.zawody, x.kategoria, x.zawodnik, x.waga, x.ciezar, x.oczekiwany, x.odchylenie, x.z]);
    sh.getRange(7, 1, rows.length, head.length).setValues(rows);
    sh.getRange(7, 5, rows.length, 3).setNumberFormat('0.0');
    sh.getRange(7, 8, rows.length, 1).setNumberFormat('+0%;-0%');
    sh.getRange(7, 9, rows.length, 1).setNumberFormat('0.00');
  } else {
    sh.getRange(7, 1).setValue(ctx.skrajne.on ? 'Brak odrzuconych przy tym progu.' : '—').setFontStyle('italic');
  }
  [120, 140, 190, 190, 70, 70, 120, 90, 60].forEach((w, i) => sh.setColumnWidth(i + 1, w));
  sh.setFrozenRows(6);
}

// ---------------------------------------------------------------- Statystyka

function mean_(a) {
  return a.reduce((s, v) => s + v, 0) / a.length;
}

/** Korelacja Pearsona. */
function pearson_(x, y) {
  const mx = mean_(x), my = mean_(y);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < x.length; i++) {
    const dx = x[i] - mx, dy = y[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : '';
}

/** Rangi średnie (remisy dostają średnią rangę). */
function ranks_(a) {
  const idx = a.map((v, i) => i).sort((i, j) => a[i] - a[j]);
  const r = new Array(a.length);
  let k = 0;
  while (k < idx.length) {
    let m = k;
    while (m + 1 < idx.length && a[idx[m + 1]] === a[idx[k]]) m++;
    const avg = (k + m) / 2 + 1;
    for (let t = k; t <= m; t++) r[idx[t]] = avg;
    k = m + 1;
  }
  return r;
}

/** Korelacja Spearmana = Pearson na rangach średnich. */
function spearman_(x, y) {
  return pearson_(ranks_(x), ranks_(y));
}

/** Nachylenie prostej regresji y względem x. */
function slope_(x, y) {
  const mx = mean_(x), my = mean_(y);
  let sxy = 0, sxx = 0;
  for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; }
  return sxx > 0 ? sxy / sxx : '';
}

/** Dwustronne p-value dla współczynnika korelacji r przy liczebności n (test t, n − 2 stopni swobody). */
function pValue_(r, n) {
  if (r === '' || n < 3) return '';
  if (Math.abs(r) >= 1) return 0;
  const df = n - 2;
  const t = Math.abs(r) * Math.sqrt(df / (1 - r * r));
  return betaInc_(df / 2, 0.5, df / (df + t * t));
}

/** Uregulowana niekompletna funkcja beta I_x(a, b) (Numerical Recipes, ułamek łańcuchowy). */
function betaInc_(a, b, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lbeta = logGamma_(a + b) - logGamma_(a) - logGamma_(b) + a * Math.log(x) + b * Math.log(1 - x);
  const front = Math.exp(lbeta);
  return x < (a + 1) / (a + b + 2)
    ? front * betaCf_(a, b, x) / a
    : 1 - front * betaCf_(b, a, 1 - x) / b;
}

function betaCf_(a, b, x) {
  const EPS = 1e-12, FPMIN = 1e-300;
  let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** ln Γ(x) — przybliżenie Lanczosa. */
function logGamma_(x) {
  const g = [76.18009172947146, -86.50532032941677, 24.01409824083091,
             -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x, tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += g[j] / ++y;
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

/**
 * Kolor dla korelacji: −0,6 i mniej → pomarańczowy, 0 → jasnozielony, +0,6 i więcej → niebieski (płynne przejście).
 */
function divergingColor_(v) {
  const NEG = [0xF4, 0xB1, 0x83], MID = [0xE2, 0xF0, 0xD9], POS = [0x9D, 0xC3, 0xE6], LIM = 0.6;
  const t = Math.min(Math.abs(v) / LIM, 1);
  const end = v < 0 ? NEG : POS;
  const c = MID.map((m, i) => Math.round(m + (end[i] - m) * t));
  return '#' + c.map(x => x.toString(16).padStart(2, '0')).join('');
}

function fmt2_(v) {
  return (typeof v === 'number' ? v.toFixed(2) : String(v)).replace('.', ',');
}
