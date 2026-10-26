/**
 * Analiza.js — obliczenia analityczne liczone skryptem na żądanie (menu 📊 Analiza).
 * Wyniki wpisywane jako wartości (nie formuły) — arkusz pozostaje lekki.
 * Każda zakładka pokazuje, kiedy i z jakimi ustawieniami była liczona, oraz ostrzeżenie, gdy Ustawienia / dane się zmieniły.
 */

const SHEET_KORELACJE = 'Korelacje';
const SHEET_ODRZUCONE = 'Odrzucone';
const SHEET_KOR_KAT = 'Korelacje (kategorie)';
const SHEET_KOR_WAGI = 'Korelacje (wagi)';
const SHEET_BOOTSTRAP = 'Bootstrap';

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

  const strata = [];          // tabela 5: jedna kategoria w danym boju
  const classRes = [];        // tabela 2: klasa wagowa × bój
  const classEntries = [], sexEntries = [];   // tabele 3–4: średnio z bojów danego typu
  const rejectedList = [];                     // odrzucone wartości skrajne — lista na dole zakładki
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
        const f = filterOutliers_(rows, ctx.skrajne);
        rej = rows.filter(r => f.kept.indexOf(r) < 0);
        rows = f.kept;
        f.rejected.forEach(x => rejectedList.push(Object.assign({ grupa: g.key, warstwa: k }, x)));
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
      classEntries.push({ grp: cl, boj: g.boj, bOfic: g.bOfic, strata: sub, out: out });
    });

    const gOut = st.reduce((s, x) => s + x.out, 0);
    sexEntries.push({ grp: g.plec, boj: g.boj, bOfic: g.bOfic, strata: st, out: gOut });
    return Object.assign({ key: g.key, bOfic: g.bOfic, out: gOut }, poolStrata_(st));
  });

  const bojOrder = ctx.groups.map(g => g.boj);
  const klasyOrder = PLCIE.reduce((a, p) => a.concat(klasyDlaPlci_(p)), []);
  classRes.sort((a, b) => klasyOrder.indexOf(a.klasa) - klasyOrder.indexOf(b.klasa)
    || bojOrder.indexOf(a.boj) - bojOrder.indexOf(b.boj));

  const typeRes = { klasy: poolByType_(ctx, classEntries, klasyOrder), plcie: poolByType_(ctx, sexEntries, PLCIE) };
  writeKorKat_(ss, ctx, groups, classRes, strata, typeRes, rejectedList);
  ss.toast('Policzono korelacje w kategoriach: ' + groups.filter(g => g.k).length + ' grup, '
    + classRes.filter(c => c.k).length + ' wierszy klas wagowych, '
    + strata.filter(x => x.rho.length).length + ' kategorii.'
    + (ctx.powtorzenia.najnowszy ? ' Pominięto wcześniejszych startów: ' + ctx.powtorzenia.pominietoValid + '.' : '')
    + (ctx.skrajne.on ? ' Odrzucono skrajnych: ' + rejectedCount + '.' : ''), '📊 Analiza', 6);
}

/**
 * 📊 Analiza → Oblicz korelacje w klasach (symulacja)
 * Klasy wagowe z Ustawień (sekcja H) — zawodnik w klasie wg swojej wagi, bez podziału AMATOR / PRO i bez podziału na zawody.
 * Zakładka „Korelacje (wagi)”: 1) przegląd klas, 2) klasa × bój, 3) płeć × bój (klasy uśrednione Fisherem).
 */
function computeCorrelationsByWeightClass() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ctx = analysisContext_(ss);
  if (!ctx) return;
  if (!ctx.klasySym) {
    SpreadsheetApp.getUi().alert('Brak sekcji H (symulacja klas wagowych) w Ustawieniach — uruchom ⚙️ Setup → Inicjalizacja.');
    return;
  }
  const res = weightClassAnalysis_(ctx);
  writeKorWagi_(ss, ctx, res);
  ss.toast('Policzono korelacje w klasach (symulacja): ' + res.classRes.filter(c => c.k).length + ' wierszy klasa × bój.'
    + (ctx.powtorzenia.najnowszy ? ' Pominięto wcześniejszych startów: ' + ctx.powtorzenia.pominietoValid + '.' : '')
    + (ctx.skrajne.on ? ' Odrzucono skrajnych: ' + res.rejected + '.' : ''), '📊 Analiza', 6);
}

/**
 * Granice klas z sekcji H (wiersze = granice, kolumny = K, M) → {K: [posortowane, unikalne], M: […]}.
 * @return {Object|null} null, gdy brak zakresu
 */
function klasySymFromValues_(values) {
  if (!values) return null;
  const out = {};
  PLCIE.forEach((p, j) => {
    const v = values.map(r => r[j]).filter(x => typeof x === 'number' && x > 0).map(x => Math.round(x * 100) / 100);
    out[p] = unique_(v).sort((a, b) => a - b);
  });
  return out;
}

/**
 * Schemat b z sekcji H (wiersze = klasa 1…4, kolumny = K, M) → {K: [b | null, …], M: […]}; null = b oficjalny boju.
 * Brak zakresu → wszystkie null (schemat = obecna punktacja).
 */
function schematBFromValues_(values) {
  const out = {};
  PLCIE.forEach((p, j) => {
    out[p] = Array.from({ length: KLASY_SYM_GRANICE + 1 }, (_, i) => {
      const v = values && values[i] ? values[i][j] : '';
      return typeof v === 'number' ? v : null;
    });
  });
  return out;
}

/** Kolumna (1 = A) wyniku „Schemat” dopisywanego do wierszy Wyników w symulacji klas. */
const W_SCHEMAT = W.t3 + 1;

/** Algorytmy w „Korelacje (wagi)”: 6 standardowych + Schemat (b wg klasy z sekcji H). */
const ALGOS_SYM = ALGOS.concat([{ col: W_SCHEMAT, label: 'Schemat' }]);

/** Etykiety klas symulacji dla płci, np. [58, 65, 72] → ['K <58', 'K 58–65', 'K 65–72', 'K 72+']; brak granic → ['K wszystkie']. */
function simClassLabels_(plec, bounds) {
  if (!bounds.length) return [plec + ' wszystkie'];
  const f = v => String(v).replace('.', ',');
  const out = [plec + ' <' + f(bounds[0])];
  for (let i = 1; i < bounds.length; i++) out.push(plec + ' ' + f(bounds[i - 1]) + '–' + f(bounds[i]));
  out.push(plec + ' ' + f(bounds[bounds.length - 1]) + '+');
  return out;
}

/** Indeks klasy dla wagi: waga < granica → niższa klasa, waga równa granicy → wyższa (porównanie z dokładnością 0,01 kg). */
function simClassIndex_(waga, bounds) {
  const w = Math.round(waga * 100);
  let i = 0;
  while (i < bounds.length && w >= Math.round(bounds[i] * 100)) i++;
  return i;
}

/**
 * Obliczenia do „Korelacje (wagi)”. Klasa zawodnika na danych zawodach — z mediany jego wag ze wszystkich bojów
 * (waga z BW% różni się między bojami o ±0,3 kg, a zawodnik nie może być w dwóch klasach naraz).
 * @return {{overview, classRes, sexRes, rejected}}
 */
function weightClassAnalysis_(ctx) {
  const startKey = r => r[W.zawody - 1] + '|' + r[W.plec - 1] + '|' + zawodnikKey_(r[W.zawodnik - 1]);
  const wagiStartu = {};
  ctx.valid.forEach(r => { (wagiStartu[startKey(r)] = wagiStartu[startKey(r)] || []).push(Number(r[W.waga - 1])); });
  const wagaStartu = {};
  Object.keys(wagiStartu).forEach(k => { wagaStartu[k] = median_(wagiStartu[k]); });
  const labels = {};
  PLCIE.forEach(p => { labels[p] = simClassLabels_(p, ctx.klasySym[p]); });
  const idxOf = r => simClassIndex_(wagaStartu[startKey(r)], ctx.klasySym[r[W.plec - 1]]);
  const classOf = r => labels[r[W.plec - 1]][idxOf(r)];
  // wynik „Schemat”: ciężar / waga ^ b klasy (sekcja H); puste b = b oficjalny boju
  const schemat = ctx.schematB || schematBFromValues_(null);
  const bSchematu = r => { const b = schemat[r[W.plec - 1]][idxOf(r)]; return typeof b === 'number' ? b : Number(r[W.bOfic - 1]); };
  const valid = ctx.valid.map(r => {
    const x = r.slice(0, W.t3);
    x[W_SCHEMAT - 1] = Number(r[W.ciezar - 1]) / Math.pow(Number(r[W.waga - 1]), bSchematu(r));
    return x;
  });

  // 1. przegląd klas: starty (zawodnik × zawody), waga min / mediana / max
  const overview = [];
  PLCIE.forEach(p => {
    const keys = Object.keys(wagaStartu).filter(k => k.split('|')[1] === p);
    labels[p].forEach((cl, i) => {
      const w = keys.filter(k => simClassIndex_(wagaStartu[k], ctx.klasySym[p]) === i).map(k => wagaStartu[k]);
      overview.push({ klasa: cl, bSchematu: typeof schemat[p][i] === 'number' ? schemat[p][i] : 'oficjalny',
        starty: w.length, min: w.length ? Math.min.apply(null, w) : '',
        med: w.length ? median_(w) : '', max: w.length ? Math.max.apply(null, w) : '' });
    });
  });

  // 2. klasa × bój, 3. płeć × bój
  const classRes = [], sexRes = [], classEntries = [], sexEntries = [], rejectedList = [];
  let rejected = 0;
  ctx.groups.forEach(g => {
    const gRows = valid.filter(r => r[W.boj - 1] === g.boj && r[W.plec - 1] === g.plec);
    const st = [];
    labels[g.plec].forEach(cl => {
      let rows = gRows.filter(r => classOf(r) === cl);
      let out = 0;
      if (ctx.skrajne.on && rows.length >= MIN_N) {
        const f = filterOutliers_(rows, ctx.skrajne);
        out = rows.length - f.kept.length;
        rows = f.kept;
        f.rejected.forEach(x => rejectedList.push(Object.assign({ grupa: g.key, warstwa: cl }, x)));
      }
      rejected += out;
      const rec = makeStratum_(rows, {}, ALGOS_SYM, true);
      st.push(rec);
      classEntries.push({ grp: cl, boj: g.boj, bOfic: g.bOfic, strata: [rec], out: out });
      const pooled = poolStrata_([rec], ALGOS_SYM);
      if (rows.length) {
        classRes.push(Object.assign({ key: cl + ' | ' + g.boj, klasa: cl, boj: g.boj, bOfic: g.bOfic, out: out }, pooled,
          { n: rows.length }));
      }
    });
    sexRes.push(Object.assign({ key: g.key, bOfic: g.bOfic, out: 0 }, poolStrata_(st, ALGOS_SYM)));
    sexRes[sexRes.length - 1].out = classRes.filter(c => c.boj === g.boj && labels[g.plec].indexOf(c.klasa) >= 0)
      .reduce((s, c) => s + c.out, 0);
    sexEntries.push({ grp: g.plec, boj: g.boj, bOfic: g.bOfic, strata: st, out: sexRes[sexRes.length - 1].out });
  });

  const bojOrder = ctx.groups.map(g => g.boj);
  const klasyOrder = PLCIE.reduce((a, p) => a.concat(labels[p]), []);
  classRes.sort((a, b) => klasyOrder.indexOf(a.klasa) - klasyOrder.indexOf(b.klasa)
    || bojOrder.indexOf(a.boj) - bojOrder.indexOf(b.boj));
  const typeRes = { klasy: poolByType_(ctx, classEntries, klasyOrder, ALGOS_SYM), plcie: poolByType_(ctx, sexEntries, PLCIE, ALGOS_SYM) };
  return { overview: overview, classRes: classRes, sexRes: sexRes, typeRes: typeRes, rejected: rejected, rejectedList: rejectedList };
}

/** Zakładka „Korelacje (wagi)”: przegląd klas, klasa × bój, płeć × bój. */
function writeKorWagi_(ss, ctx, res) {
  let sh = ss.getSheetByName(SHEET_KOR_WAGI);
  if (sh) {
    sh.clear();
    sh.clearNotes();
    sh.setConditionalFormatRules([]);
    sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).breakApart();
  } else {
    sh = ss.insertSheet(SHEET_KOR_WAGI);
  }
  if (sh.getMaxColumns() < 30) sh.insertColumnsAfter(sh.getMaxColumns(), 30 - sh.getMaxColumns());
  const need = 60 + res.overview.length + res.classRes.length + res.sexRes.length
    + (res.typeRes ? res.typeRes.klasy.length + res.typeRes.plcie.length : 0) + (res.rejectedList || []).length;
  if (sh.getMaxRows() < need) sh.insertRowsAfter(sh.getMaxRows(), need - sh.getMaxRows());
  sh.getRange(1, 1, sh.getMaxRows(), 30).setFontFamily(STYLE.font).setFontSize(10);

  const granice = PLCIE.map(p => p + ': ' + (ctx.klasySym[p].length ? ctx.klasySym[p].map(fmt2_).join(' / ') : 'brak')).join(', ');
  sh.getRange('A1').setValue('Korelacja wyniku z wagą — symulacja klas wagowych').setFontSize(14).setFontWeight('bold');
  const sch = ctx.schematB || schematBFromValues_(null);
  const schemat = PLCIE.map(p => p + ': ' + simClassLabels_(p, ctx.klasySym[p])
    .map((cl, i) => typeof sch[p][i] === 'number' ? fmt2_(sch[p][i]) : 'ofic.').join(' / ')).join(', ');
  sh.getRange('A2').setValue('Granice klas (Ustawienia, sekcja H): ' + granice + ' | schemat b: ' + schemat
    + ' | AMATOR i PRO razem, zawody razem'
    + ' | zawody = ' + ctx.filtrZawody + ' (filtr Kategoria nie dotyczy)'
    + powtorzeniaInfo_(ctx, ctx.powtorzenia ? ctx.powtorzenia.pominietoValid : 0)
    + ' | wartości skrajne: ' + (ctx.skrajne.on
      ? 'odrzucane w każdej klasie (' + ctx.skrajne.metoda + ', próg ' + fmt2_(ctx.skrajne.prog) + ')' : 'nie odrzucane'))
    .setFontWeight('bold');
  sh.getRange('A3').setValue('Obliczono: ' + Utilities.formatDate(new Date(), 'Europe/Warsaw', 'yyyy-MM-dd HH:mm')
    + ' | Test 1 = ' + fmt2_(ctx.tests[0]) + ', Test 2 = ' + fmt2_(ctx.tests[1]) + ', Test 3 = ' + fmt2_(ctx.tests[2]))
    .setFontColor(STYLE.noteFont);
  writeStaleCheck_(sh, 'A4', '📊 Analiza → Oblicz korelacje w klasach (symulacja)', '&"|"&IFERROR(TEXTJOIN(";";FALSE;KLASY_SYM);"")&"|"&IFERROR(TEXTJOIN(";";FALSE;KLASY_SYM_B);"")');

  // ---- 1. Przegląd klas
  sh.getRange(6, 1).setValue('1. Klasy wagowe w symulacji — starty (zawodnik × zawody) i wagi').setFontWeight('bold');
  const oHead = ['Klasa', 'startów', 'waga min', 'mediana', 'waga max', 'b schematu'];
  styleHeader_(sh.getRange(7, 1, 1, oHead.length).setValues([oHead]));
  const ov = res.overview.map(o => [o.klasa, o.starty, o.min, o.med, o.max, o.bSchematu]);
  const orng = sh.getRange(8, 1, ov.length, oHead.length).setValues(ov);
  orng.setBorder(true, true, true, true, true, true, '#BFBFBF', SpreadsheetApp.BorderStyle.SOLID);
  sh.getRange(8, 1, ov.length, 1).setFontWeight('bold');
  sh.getRange(8, 2, ov.length, 5).setHorizontalAlignment('center');
  sh.getRange(8, 3, ov.length, 3).setNumberFormat('0.0');
  sh.getRange(8, 6, ov.length, 1).setNumberFormat('0.00').setBackground('#FFF2CC');
  let row = 8 + ov.length - 1;

  const algoTitle = (a, i) => a.test ? a.label + ' (b = ' + fmt2_(ctx.tests[i - 3]) + ')' : a.label;

  // ---- 2. Klasa × bój
  row = writeSummaryTable_(sh, ctx, row + 2, '2. Klasa × bój — wszyscy zawodnicy klasy razem (AMATOR, PRO, wszystkie zawody)',
    'Klasa | bój', res.classRes, algoTitle, true, ALGOS_SYM);

  // ---- 3. Płeć × bój
  row = writeSummaryTable_(sh, ctx, row + 2, '3. Podsumowanie wg płci — bój | płeć (klasy uśrednione metodą Fishera; „kategorii” = liczba klas)',
    'Grupa', res.sexRes, algoTitle, false, ALGOS_SYM);

  // ---- 4–5. Średnio z bojów danego typu
  if (res.typeRes) row = writeTypeTables_(sh, ctx, row + 2, 4, res.typeRes, algoTitle, 'Klasa | typ boju', ALGOS_SYM);

  // ---- Legenda
  [
    'Schemat: ciężar / waga ^ b klasy z Ustawień (sekcja H, „b w schemacie”); puste pole = b oficjalny boju. Tabela 3 pokazuje, jak cały schemat działa razem.',
    'Klasa zawodnika wg jego wagi na danych zawodach (mediana wag z bojów); waga równa granicy należy do wyższej klasy (85,0 → 85+).',
    'Uwaga: wagi pochodzą z zawodów z obecnymi klasami (zbijanie do 85 / 65, starty tuż nad granicą) — przy innych granicach zawodnicy mogliby zachowywać się inaczej.',
    'ρ (Spearman) — wskaźnik główny; r (Pearson, szary) — pomocniczo. b neutralne (ρ = 0) szukane od −1 do 2 co 0,01.',
    'Tabela 3: korelacje z klas uśrednione (z = atanh, wagi n − 3) — jak dany algorytm sprawdza się w całym systemie klas.',
    'Kolory: pomarańcz = faworyzuje lżejszych, zielony = neutralny, niebieski = cięższych; p < 0,05 na czerwono. Klasy z n < ' + MIN_N + ' bez statystyk (szare).',
  ].forEach((t, i) => sh.getRange(row + 2 + i, 1).setValue(t).setFontStyle('italic').setFontColor(STYLE.noteFont));

  // ---- Odrzucone w tej analizie
  writeRejectedTable_(sh, ctx, row + 10, '6. Odrzucone w tej analizie — wartości skrajne w każdej klasie symulacji',
    'Klasa', res.rejectedList || []);

  const FIX = 5, cx = FIX + 1 + ALGOS_SYM.length * 3;
  sh.setColumnWidth(1, 140);
  sh.setColumnWidth(2, 75);
  sh.setColumnWidth(3, 70);
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
 * Średnio z bojów danego typu (Ustawienia, sekcja B, kolumna „Typ”): dla każdej grupy (klasy albo płci) i typu boju
 * kategorie / klasy wszystkich zaznaczonych bojów tego typu uśredniane razem metodą Fishera; b neutralne — jedno dla typu.
 * p i 95% CI pomijane: ci sami zawodnicy występują w kilku bojach, więc wyszłyby zbyt optymistyczne.
 * @param {Object[]} entries — {grp, boj, bOfic, strata, out}
 * @param {string[]} grpOrder — kolejność grup
 * @return {Object[]} wiersze w formacie writeSummaryTable_ (k = liczba bojów)
 */
function poolByType_(ctx, entries, grpOrder, algos) {
  const out = [];
  const grps = unique_(entries.map(e => e.grp)).sort((a, b) => grpOrder.indexOf(a) - grpOrder.indexOf(b));
  grps.forEach(grp => {
    TYPY_BOJOW.forEach(typ => {
      const sel = entries.filter(e => e.grp === grp && ctx.typBoju[e.boj] === typ);
      if (!sel.length) return;
      const usable = x => x.rho.length && x.rho.every(v => v !== '');
      const used = sel.filter(e => e.strata.some(usable));
      const pooled = poolStrata_(sel.reduce((a, e) => a.concat(e.strata), []), algos);
      pooled.algos.forEach(a => { a.p = ''; a.lo = ''; a.hi = ''; });
      const bs = unique_(used.map(e => e.bOfic));
      const typLabel = typ === TYPY_BOJOW[0] ? 'siłowe' : 'wydolnościowe';
      const label = (PLCIE.indexOf(grp) >= 0 ? grp + ' (wszystkie klasy)' : grp) + ' | ' + typLabel;
      out.push(Object.assign(pooled, { key: label, k: used.length, bOfic: bs.length > 1 ? 'różne' : (bs[0] === undefined ? '' : bs[0]),
        out: sel.reduce((s, e) => s + e.out, 0), boje: used.map(e => e.boj) }));
    });
  });
  return out;
}

/**
 * Tabele „średnio z bojów”: klasa × typ i płeć × typ. Zwraca numer ostatniego wiersza.
 * @param {number} num — numer pierwszej z dwóch tabel w zakładce
 */
function writeTypeTables_(sh, ctx, top, num, typeRes, algoTitle, labelHeader, algos) {
  const all = typeRes.klasy.concat(typeRes.plcie);
  const mixed = all.filter(x => x.bOfic === 'różne').map(x => x.key);
  let row = top;
  const note = 'n = liczba wyników (zawodnik liczony w każdym boju osobno); p i CI pominięte — ci sami zawodnicy w kilku bojach. '
    + 'Typ boju: Ustawienia, sekcja B, kolumna „Typ”; uśredniane tylko zaznaczone boje („Analizuj”).'
    + (mixed.length ? ' ⚠ Różne współczynniki oficjalne w: ' + mixed.join(', ') + ' — średnia mało sensowna.' : '');
  sh.getRange(row, 1).setValue(note).setFontStyle('italic').setFontColor(mixed.length ? '#C00000' : STYLE.noteFont);
  row = writeSummaryTable_(sh, ctx, row + 1, num + '. Średnio z bojów — klasa × typ boju (siłowe / wydolnościowe)',
    labelHeader, typeRes.klasy, algoTitle, true, algos, 'bojów');
  row = writeSummaryTable_(sh, ctx, row + 2, (num + 1) + '. Średnio z bojów — płeć × typ boju (wszystkie klasy)',
    'Płeć | typ boju', typeRes.plcie, algoTitle, true, algos, 'bojów');
  return row;
}

// ---------------------------------------------------------------- Bootstrap

/** Limit czasu bootstrapu (ms) — Apps Script przerywa skrypt po 6 min; zostawiamy zapas na zapis. */
const BOOT_TIME_LIMIT = 5 * 60 * 1000;

/**
 * 📊 Analiza → Bootstrap (przedziały ufności)
 * Losuje zawodników ze zwracaniem (osobno K i M; wylosowany zawodnik wnosi wszystkie swoje wiersze — boje i lata)
 * i w każdym powtórzeniu liczy od nowa symulację klas (weightClassAnalysis_, z filtrem wartości skrajnych).
 * 95% przedziały ufności = percentyle 2,5% i 97,5% rozkładu z powtórzeń.
 */
function computeBootstrap() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ctx = analysisContext_(ss);
  if (!ctx) return;
  if (!ctx.klasySym) {
    SpreadsheetApp.getUi().alert('Brak sekcji H (symulacja klas wagowych) w Ustawieniach — uruchom ⚙️ Setup → Inicjalizacja.');
    return;
  }
  ss.toast('Bootstrap: ' + ctx.boot.n + ' powtórzeń — to może potrwać kilka minut.', '📊 Analiza', 10);
  const res = bootstrapAnalysis_(ctx);
  writeBootstrap_(ss, ctx, res);
  ss.toast('Bootstrap: wykonano ' + res.done + ' z ' + res.requested + ' powtórzeń (' + Math.round(res.ms / 1000) + ' s).'
    + (res.done < res.requested ? ' Limit czasu — wynik z mniejszej liczby powtórzeń.' : ''), '📊 Analiza', 8);
}

/** Generator liczb losowych z ziarnem (mulberry32) — powtarzalne wyniki. */
function rng_(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Kwantyl posortowanej tablicy (interpolacja liniowa); ±Infinity dozwolone. */
function quantile_(sorted, q) {
  if (!sorted.length) return '';
  const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  if (lo === hi || !isFinite(sorted[lo]) || !isFinite(sorted[hi])) return sorted[q < 0.5 ? lo : hi];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * Obliczenia bootstrapu: estymata punktowa (weightClassAnalysis_ na prawdziwych danych) + rozkład z powtórzeń.
 * @return {{tables, done, requested, ms, osoby}}
 */
function bootstrapAnalysis_(ctx) {
  const t0 = Date.now();
  const point = weightClassAnalysis_(ctx);
  const tablesDef = [
    ['klasaBoj', point.classRes], ['plecBoj', point.sexRes], ['klasaTyp', point.typeRes.klasy], ['plecTyp', point.typeRes.plcie],
  ];
  // zbieracz: klucz wiersza → listy wartości z powtórzeń
  const acc = {};
  tablesDef.forEach(([t, list]) => list.forEach(g => { acc[t + '§' + g.key] = { bn: [], ofic: [], sch: [] }; }));
  const bnNum = v => typeof v === 'number' ? v : (String(v).indexOf('>') === 0 ? Infinity : (String(v).indexOf('<') === 0 ? -Infinity : null));
  const collect = res => {
    [['klasaBoj', res.classRes], ['plecBoj', res.sexRes], ['klasaTyp', res.typeRes.klasy], ['plecTyp', res.typeRes.plcie]]
      .forEach(([t, list]) => list.forEach(g => {
        const a = acc[t + '§' + g.key];
        if (!a || !g.k || !g.algos.length) return;
        const b = bnNum(g.bNeutral);
        if (b !== null) a.bn.push(b);
        if (typeof g.algos[2].rho === 'number') a.ofic.push(g.algos[2].rho);
        if (g.algos[6] && typeof g.algos[6].rho === 'number') a.sch.push(g.algos[6].rho);
      }));
  };

  // zawodnicy (płeć + imię i nazwisko — wszystkie zawody i boje razem)
  const osoby = {};
  ctx.valid.forEach(r => {
    const k = r[W.plec - 1] + '|' + zawodnikKey_(r[W.zawodnik - 1]);
    (osoby[k] = osoby[k] || []).push(r);
  });
  const poPlci = {};
  Object.keys(osoby).forEach(k => { (poPlci[k.split('|')[0]] = poPlci[k.split('|')[0]] || []).push(osoby[k]); });

  const rand = rng_(ctx.boot.seed);
  let done = 0;
  for (let i = 0; i < ctx.boot.n; i++) {
    if (Date.now() - t0 > BOOT_TIME_LIMIT) break;
    const valid = [];
    Object.keys(poPlci).forEach(p => {
      const list = poPlci[p];
      for (let j = 0; j < list.length; j++) {
        const rows = list[Math.floor(rand() * list.length)];
        // kopia z dopiskiem numeru losowania — wylosowany kilka razy zawodnik to osobne „osoby” (osobna waga startu)
        rows.forEach(r => { const x = r.slice(); x[W.zawodnik - 1] = r[W.zawodnik - 1] + ' #' + j; valid.push(x); });
      }
    });
    collect(weightClassAnalysis_(Object.assign({}, ctx, { valid: valid })));
    done++;
  }

  const ci = arr => {
    const s = arr.slice().sort((a, b) => a - b);
    return { lo: quantile_(s, 0.025), hi: quantile_(s, 0.975), n: s.length,
      p: s.length ? Math.min(1, 2 * Math.min(s.filter(v => v <= 0).length, s.filter(v => v >= 0).length) / s.length) : '' };
  };
  const tables = {};
  tablesDef.forEach(([t, list]) => {
    tables[t] = list.filter(g => g.k && g.algos.length).map(g => {
      const a = acc[t + '§' + g.key];
      return { key: g.key, n: g.n, k: g.k, bOfic: g.bOfic, bNeutral: g.bNeutral, bnCI: ci(a.bn),
        ofic: g.algos[2].rho, oficCI: ci(a.ofic), sch: g.algos[6] ? g.algos[6].rho : '', schCI: ci(a.sch) };
    });
  });
  return { tables: tables, done: done, requested: ctx.boot.n, ms: Date.now() - t0,
    osoby: PLCIE.map(p => p + ': ' + ((poPlci[p] || []).length)).join(', ') };
}

/** Zakładka „Bootstrap”: 4 tabele (klasa × bój, płeć × bój, klasa × typ, płeć × typ). */
function writeBootstrap_(ss, ctx, res) {
  let sh = ss.getSheetByName(SHEET_BOOTSTRAP);
  if (sh) {
    sh.clear();
    sh.clearNotes();
    sh.setConditionalFormatRules([]);
  } else {
    sh = ss.insertSheet(SHEET_BOOTSTRAP);
  }
  const all = Object.keys(res.tables).reduce((s, k) => s + res.tables[k].length, 0);
  const need = 40 + all;
  if (sh.getMaxRows() < need) sh.insertRowsAfter(sh.getMaxRows(), need - sh.getMaxRows());
  if (sh.getMaxColumns() < 20) sh.insertColumnsAfter(sh.getMaxColumns(), 20 - sh.getMaxColumns());
  sh.getRange(1, 1, sh.getMaxRows(), 20).setFontFamily(STYLE.font).setFontSize(10);

  const sch = ctx.schematB || schematBFromValues_(null);
  const granice = PLCIE.map(p => p + ': ' + (ctx.klasySym[p].length ? ctx.klasySym[p].map(fmt2_).join(' / ') : 'brak')).join(', ');
  const schemat = PLCIE.map(p => p + ': ' + simClassLabels_(p, ctx.klasySym[p])
    .map((cl, i) => typeof sch[p][i] === 'number' ? fmt2_(sch[p][i]) : 'ofic.').join(' / ')).join(', ');
  sh.getRange('A1').setValue('Bootstrap po zawodnikach — 95% przedziały ufności').setFontSize(14).setFontWeight('bold');
  sh.getRange('A2').setValue('Symulacja klas (sekcja H): ' + granice + ' | schemat b: ' + schemat
    + ' | zawody = ' + ctx.filtrZawody + powtorzeniaInfo_(ctx, ctx.powtorzenia ? ctx.powtorzenia.pominietoValid : 0)
    + ' | wartości skrajne: ' + (ctx.skrajne.on ? ctx.skrajne.metoda + ', próg ' + fmt2_(ctx.skrajne.prog) : 'nie odrzucane'))
    .setFontWeight('bold');
  sh.getRange('A3').setValue('Obliczono: ' + Utilities.formatDate(new Date(), 'Europe/Warsaw', 'yyyy-MM-dd HH:mm')
    + ' | powtórzeń: ' + res.done + ' z ' + res.requested + (res.done < res.requested ? ' (limit czasu)' : '')
    + ' | ziarno: ' + ctx.boot.seed + ' | czas: ' + Math.round(res.ms / 1000) + ' s | zawodników (losowanych): ' + res.osoby)
    .setFontColor(res.done < res.requested ? '#C00000' : STYLE.noteFont);
  writeStaleCheck_(sh, 'A4', '📊 Analiza → Bootstrap (przedziały ufności)',
    '&"|"&IFERROR(TEXTJOIN(";";FALSE;KLASY_SYM);"")&"|"&IFERROR(TEXTJOIN(";";FALSE;KLASY_SYM_B);"")'
    + '&"|"&IFERROR(BOOT_N&"/"&BOOT_SEED;"")');

  const head = ['Grupa', 'n', 'b oficjalny', 'b neutralne', '95% CI b neutralnego', 'b ofic. w CI?',
    'ρ ofic.', '95% CI ρ ofic.', 'p (ofic.)', 'ρ schemat', '95% CI ρ schemat', 'p (schemat)'];
  const fmtB = v => typeof v !== 'number' ? String(v) : (v === Infinity ? '> ' + fmt2_(B_SCAN.max)
    : v === -Infinity ? '< ' + fmt2_(B_SCAN.min) : fmt2_(v));
  const inCI = (b, c) => typeof b !== 'number' || c.lo === '' ? '' : (b >= c.lo && b <= c.hi ? 'TAK' : 'NIE');
  let row = 6;
  [
    ['klasaBoj', '1. Klasa × bój'],
    ['plecBoj', '2. Płeć × bój (klasy uśrednione)'],
    ['klasaTyp', '3. Klasa × typ boju (średnio z bojów)'],
    ['plecTyp', '4. Płeć × typ boju (średnio z bojów i klas)'],
  ].forEach(([t, title]) => {
    sh.getRange(row, 1).setValue(title).setFontWeight('bold');
    styleHeader_(sh.getRange(row + 1, 1, 1, head.length).setValues([head]).setWrap(true));
    sh.setRowHeight(row + 1, 36);
    const list = res.tables[t];
    if (!list.length) {
      sh.getRange(row + 2, 1).setValue('Brak danych.').setFontStyle('italic');
      row += 4;
      return;
    }
    const out = list.map(g => [g.key, g.n, g.bOfic, g.bNeutral,
      g.bnCI.lo === '' ? '' : fmtB(g.bnCI.lo) + ' … ' + fmtB(g.bnCI.hi), inCI(g.bOfic, g.bnCI),
      g.ofic, g.oficCI.lo === '' ? '' : fmt3_(g.oficCI.lo) + ' … ' + fmt3_(g.oficCI.hi), g.oficCI.p,
      g.sch, g.schCI.lo === '' ? '' : fmt3_(g.schCI.lo) + ' … ' + fmt3_(g.schCI.hi), g.schCI.p]);
    const r0 = row + 2;
    const rng = sh.getRange(r0, 1, out.length, head.length).setValues(out);
    rng.setBorder(true, true, true, true, true, true, '#BFBFBF', SpreadsheetApp.BorderStyle.SOLID);
    sh.getRange(r0, 2, out.length, head.length - 1).setHorizontalAlignment('center');
    sh.getRange(r0, 1, out.length, 1).setFontWeight('bold');
    sh.getRange(r0, 3, out.length, 2).setNumberFormat('0.00');
    sh.getRange(r0, 4, out.length, 1).setFontWeight('bold').setBackground('#FFF2CC');
    sh.getRange(r0, 7, out.length, 1).setNumberFormat('0.000');
    sh.getRange(r0, 9, out.length, 2).setNumberFormat('0.000');
    sh.getRange(r0, 12, out.length, 1).setNumberFormat('0.000');
    sh.getRange(r0, 7, out.length, 1).setBackgrounds(out.map(r => [typeof r[6] === 'number' ? divergingColor_(r[6]) : null]));
    sh.getRange(r0, 10, out.length, 1).setBackgrounds(out.map(r => [typeof r[9] === 'number' ? divergingColor_(r[9]) : null]));
    sh.getRange(r0, 6, out.length, 1).setFontColors(out.map(r => [r[5] === 'NIE' ? '#C00000' : (r[5] === 'TAK' ? '#38761D' : null)]))
      .setFontWeights(out.map(r => [r[5] ? 'bold' : null]));
    [9, 12].forEach(c => sh.getRange(r0, c, out.length, 1)
      .setFontColors(out.map(r => [typeof r[c - 1] === 'number' && r[c - 1] < 0.05 ? '#C00000' : null]))
      .setFontWeights(out.map(r => [typeof r[c - 1] === 'number' && r[c - 1] < 0.05 ? 'bold' : null])));
    for (let i = 1; i < out.length; i++) {
      if (String(out[i][0]).split(' | ')[0] !== String(out[i - 1][0]).split(' | ')[0]) {
        sh.getRange(r0 + i, 1, 1, head.length).setBorder(true, null, null, null, null, null, '#1F3A5F', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
      }
    }
    row = r0 + out.length + 2;
  });

  [
    'Bootstrap: losowanie zawodników ze zwracaniem (osobno K i M), wylosowany zawodnik wnosi wszystkie swoje wyniki (boje i lata); w każdym powtórzeniu cała symulacja klas liczona od nowa, z filtrem wartości skrajnych.',
    '95% CI = percentyle 2,5% i 97,5% z powtórzeń. p (bootstrap) = 2 × mniejsza z części powtórzeń z ρ ≤ 0 i ρ ≥ 0 — czy ρ różni się od 0.',
    'b ofic. w CI?: TAK = oficjalny współczynnik jest zgodny z danymi (mieści się w przedziale b neutralnego); NIE (czerwone) = dane wskazują inne b.',
    'n i b neutralne — z prawdziwych danych (jak w Korelacjach (wagi)); „< −1,00” / „> 2,00” = b neutralne poza zakresem szukania.',
    'Tabele 3–4: p i CI uwzględniają, że ci sami zawodnicy występują w kilku bojach (w Korelacjach (wagi) są tam puste).',
  ].forEach((t, i) => sh.getRange(row + i, 1).setValue(t).setFontStyle('italic').setFontColor(STYLE.noteFont));

  [180, 55, 75, 85, 140, 75, 65, 120, 65, 75, 120, 75].forEach((w, i) => sh.setColumnWidth(i + 1, w));
  sh.setFrozenColumns(1);
  orderSheets_(ss);
  ss.setActiveSheet(sh);
}

/** Etykiety klas wagowych dla płci, np. K → ['K 65', 'K +65']. */
function klasyDlaPlci_(plec) {
  const lim = KLASY_WAGOWE[plec];
  return lim ? [plec + ' ' + lim, plec + ' +' + lim] : [];
}

/** Statystyki jednej kategorii: r i ρ dla każdego algorytmu, b z regresji, b neutralne. */
function makeStratum_(rows, meta, algos, noNeutral) {
  const A = algos || ALGOS;
  const rec = Object.assign({ n: rows.length, r: [], rho: [], loglog: '', bNeutral: '' }, meta);
  if (rows.length < MIN_N) return rec;
  const w = rows.map(r => Number(r[W.waga - 1]));
  const c = rows.map(r => Number(r[W.ciezar - 1]));
  rec.r = A.map(a => pearson_(w, rows.map(r => Number(r[a.col - 1]))));
  rec.rho = A.map(a => spearman_(w, rows.map(r => Number(r[a.col - 1]))));
  rec.loglog = slope_(w.map(Math.log), c.map(Math.log));
  rec.w = w;
  rec.c = c;
  rec.bNeutral = noNeutral ? '' : neutralB_([rec]);   // noNeutral: liczone później w poolStrata_ (oszczędność czasu)
  return rec;
}

/**
 * Uśrednia kategorie (Fisher): ρ (główne, z p i 95% CI) i r dla każdego algorytmu,
 * b z regresji wewnątrz kategorii, b neutralne (ρ = 0), algorytm najbliżej 0.
 */
function poolStrata_(st, algos) {
  const A = algos || ALGOS;
  const used = st.filter(x => x.rho.length && x.rho.every(v => v !== '') && x.r.every(v => v !== ''));
  const res = { k: used.length, n: used.reduce((s, x) => s + x.n, 0), algos: [], within: '', bNeutral: '', closest: '' };
  if (!used.length) return res;
  A.forEach((a, i) => {
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
  res.closest = A[best].label;
  return res;
}

/** Współczynnik wariancji z = atanh(ρ) dla Spearmana (Fieller i in.): Var ≈ 1,06 / (n − 3). */
const SPEARMAN_VAR = 1.06;

/** Zakres i krok szukania b neutralnego. */
const B_SCAN = { min: -1, max: 2, coarse: 0.1 };

/**
 * b, przy którym uśrednione ρ(waga, ciężar / waga^b) = 0 w podanych kategoriach (interpolacja liniowa).
 * @param {Object[]} strata — obiekty z polami w (wagi), c (ciężary), n
 * @return {number|string} b albo „< −1” / „> 2”, gdy zero leży poza zakresem
 */
function neutralB_(strata) {
  const rhoAt = b => fisherPool_(strata.map(x => ({
    r: spearman_(x.w, x.c.map((c, j) => c / Math.pow(x.w[j], b))), n: x.n,
  })), SPEARMAN_VAR).r;
  // siatka co B_SCAN.coarse, a po zmianie znaku bisekcja (zgodne ze skanem co 0,01 z dokładnością < 0,01; ~8× szybciej)
  let prevB = B_SCAN.min, prev = rhoAt(prevB);
  if (prev === '') return '';
  for (let b = B_SCAN.min + B_SCAN.coarse; b <= B_SCAN.max + 1e-9; b += B_SCAN.coarse) {
    const cur = rhoAt(b);
    if (cur === '') return '';
    if (prev === 0) return prevB;
    if ((prev > 0 && cur <= 0) || (prev < 0 && cur >= 0)) {
      let lo = prevB, hi = b, flo = prev, fhi = cur;
      for (let i = 0; i < 6; i++) {
        const m = (lo + hi) / 2, fm = rhoAt(m);
        if (fm === '') break;
        if ((flo > 0 && fm > 0) || (flo < 0 && fm < 0)) { lo = m; flo = fm; } else { hi = m; fhi = fm; }
      }
      return flo === fhi ? (lo + hi) / 2 : lo + (hi - lo) * flo / (flo - fhi);
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
    klasa = (Math.round(Number(r[W.waga - 1]) * 100) >= lim * 100 ? '+' : '') + lim;   // waga równa granicy → klasa „+”
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
function writeKorKat_(ss, ctx, groups, classRes, strata, typeRes, rejectedList) {
  typeRes = typeRes || { klasy: [], plcie: [] };
  rejectedList = rejectedList || [];
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
  const need = 50 + groups.length + classRes.length + strata.length + typeRes.klasy.length + typeRes.plcie.length
    + rejectedList.length;
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

  // ---- Tabele 3–4: średnio z bojów danego typu
  row = writeTypeTables_(sh, ctx, row + 2, 3, typeRes, algoTitle, 'Klasa | typ boju');

  // ---- Tabela 5: szczegóły per kategoria
  const D0 = row + 3;
  sh.getRange(D0 - 2, 1).setValue('5. Szczegóły — ρ w każdej kategorii osobno (wg podziału z Ustawień, sekcja F)').setFontWeight('bold');
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

  // ---- Odrzucone w tej analizie
  writeRejectedTable_(sh, ctx, L0 + 8, '6. Odrzucone w tej analizie — wartości skrajne w każdej kategorii (wg podziału)',
    'Kategoria (' + ctx.podzial + ')', rejectedList);

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
function writeSummaryTable_(sh, ctx, top, title, labelHeader, items, algoTitle, skipEmpty, algos, countHeader) {
  const A = algos || ALGOS;
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
  hdr(HR, 2, 2, 1, countHeader || 'kategorii');
  hdr(HR, 3, 2, 1, 'n');
  hdr(HR, 4, 2, 1, 'odrzucono');
  hdr(HR, 5, 2, 1, 'b oficjalny');
  A.forEach((a, i) => {
    const c = FIX + 1 + i * 3;
    hdr(HR, c, 1, 3, algoTitle(a, i));
    hdr(SR, c, 1, 1, 'ρ', true);
    hdr(SR, c + 1, 1, 1, 'p', true);
    hdr(SR, c + 2, 1, 1, 'r', true);
  });
  const cx = FIX + 1 + A.length * 3;
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
    row.push(g.bNeutral, o.rho === '' || o.lo === '' ? '' : fmt3_(o.lo) + ' … ' + fmt3_(o.hi), g.within, g.closest);
    return row;
  });
  const rng = sh.getRange(R0, 1, out.length, nCols).setValues(out);
  rng.setBorder(true, true, true, true, true, true, '#BFBFBF', SpreadsheetApp.BorderStyle.SOLID);
  sh.getRange(R0, 2, out.length, nCols - 1).setHorizontalAlignment('center');
  sh.getRange(R0, 2, out.length, 3).setNumberFormat('0');
  sh.getRange(R0, FIX, out.length, 1).setNumberFormat('0.00');
  sh.getRange(R0, FIX + 1, out.length, A.length * 3).setNumberFormat('0.000');
  sh.getRange(R0, cx + 2, out.length, 1).setNumberFormat('0.00');
  colorBlocks_(sh, R0, out, FIX, 3, [0, 2], 1, A.length);
  sh.getRange(R0, cx, out.length, 1).setNumberFormat('0.00').setFontWeight('bold').setBackground('#FFF2CC');
  A.forEach((a, i) => sh.getRange(R0, FIX + 3 + i * 3, out.length, 1).setFontColor('#757575'));
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
function colorBlocks_(sh, r0, rows, fix, step, colorIdx, pIdx, nAlgos) {
  const nA = nAlgos || ALGOS.length;
  const nCols = rows[0].length;
  const bg = [], fc = [], fw = [];
  rows.forEach(row => {
    const b = [], f = [], w = [];
    for (let c = 0; c < nCols; c++) {
      const v = row[c], k = c - fix, inBlock = k >= 0 && k < nA * step, pos = k % step;
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
  // wybór bojów do analizy (Ustawienia, sekcja B, kolumna „Analizuj”) — brak kolumny = wszystkie
  const anRange = namedRange_(ss, 'B_ANALIZUJ');
  const analizuj = anRange ? anRange.getValues().map(v => v[0] === true) : boje.map(() => true);
  const bojeWybrane = boje.filter((b, i) => b && analizuj[i]);
  // typ boju (Ustawienia, sekcja B, kolumna „Typ”) — brak kolumny = Snatch wydolnościowy, reszta siłowe
  const typRange = namedRange_(ss, 'B_TYP');
  const typy = typRange ? typRange.getValues().map(v => String(v[0]).trim()) : [];
  const typBoju = {};
  boje.forEach((b, i) => { if (b) typBoju[b] = TYPY_BOJOW.indexOf(typy[i]) >= 0 ? typy[i] : typBojuStart_(b); });
  if (!bojeWybrane.length) {
    SpreadsheetApp.getUi().alert('Nie wybrano żadnego boju do analizy — zaznacz boje w Ustawieniach (sekcja B, kolumna „Analizuj”).');
    return null;
  }
  const groups = [];
  boje.forEach((b, i) => {
    if (!b || !analizuj[i]) return;
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
    boje: { wybrane: bojeWybrane, wszystkich: boje.filter(b => b).length },
    typBoju: typBoju,
    klasySym: klasySymFromValues_(namedRange_(ss, 'KLASY_SYM') ? namedRange_(ss, 'KLASY_SYM').getValues() : null),
    boot: {
      n: Math.max(20, Math.min(1000, Math.round(Number(opt('BOOT_N', BOOTSTRAP_START.n)) || BOOTSTRAP_START.n))),
      seed: Math.round(Number(opt('BOOT_SEED', BOOTSTRAP_START.seed)) || BOOTSTRAP_START.seed),
    },
    schematB: schematBFromValues_(namedRange_(ss, 'KLASY_SYM_B') ? namedRange_(ss, 'KLASY_SYM_B').getValues() : null),
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

/** Opis opcji powtórzeń (i wybranych bojów) do wiersza z ustawieniami (A2). @param {number} dropped — ile wierszy pominięto */
function powtorzeniaInfo_(ctx, dropped) {
  const b = ctx.boje;
  const boje = !b || b.wybrane.length === b.wszystkich ? 'wszystkie'
    : b.wybrane.join(', ') + ' (' + b.wybrane.length + ' z ' + b.wszystkich + ')';
  return ' | boje: ' + boje + ' | powtórzenia: ' + (ctx.powtorzenia && ctx.powtorzenia.najnowszy
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

/** Kolumna podpisu aktualności (ukryta) — za wszystkimi tabelami analiz (AN). */
const STALE_COL = 40;

/**
 * Wskaźnik aktualności: w ukrytej kolumnie STALE_COL zapisuje „podpis” Ustawień i danych z chwili obliczenia (wartość)
 * oraz ten sam podpis liczony na żywo (formuła). Komórka statusu porównuje oba.
 */
function writeStaleCheck_(sh, statusCell, action, extraSig) {
  const sig = '=FILTR_ZAWODY&"|"&FILTR_KATEGORIA&"|"&TEXTJOIN(";";FALSE;B_OFICJALNE_BOJE;B_OFICJALNE)'
    + '&"|"&B_TEST_1&"|"&B_TEST_2&"|"&B_TEST_3'
    + '&"|"&IFERROR(SKRAJNE_ODRZUCAJ&SKRAJNE_METODA&SKRAJNE_PROG;"")&"|"&IFERROR(PODZIAL_KATEGORII;"")&"|"&IFERROR(POWTORZENIA;"")&"|"&IFERROR(TEXTJOIN(";";FALSE;B_ANALIZUJ);"")&"|"&IFERROR(TEXTJOIN(";";FALSE;B_TYP);"")'
    + '&"|"&SUM(' + SHEET_WYNIKI + '!J2:J' + MAX_ROWS + ')&"|"&ROUND(SUM(' + SHEET_WYNIKI + '!H2:H' + MAX_ROWS + ');3)'
    + (extraSig || '');
  const C = STALE_COL;
  if (sh.getMaxColumns() < C) sh.insertColumnsAfter(sh.getMaxColumns(), C - sh.getMaxColumns());
  sh.showColumns(1, sh.getMaxColumns());          // dawniej podpis był w Z (kolumna 26) i ukrywał dane tabel
  const L = sh.getRange(1, C).getA1Notation().replace(/\d+$/, '');
  const live = sh.getRange(2, C);
  live.setFormula(sig);
  SpreadsheetApp.flush();
  sh.getRange(1, C).setValue(live.getDisplayValue());
  sh.getRange(statusCell)
    .setFormula('=IF(' + L + '1=' + L + '2;"✓ Aktualne";"⚠ Ustawienia lub dane zmienione od ostatniego obliczenia — kliknij ' + action + '")')
    .setFontWeight('bold');
  const rules = sh.getConditionalFormatRules();
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextStartsWith('⚠')
    .setFontColor('#C00000').setBackground('#FCE8E6').setRanges([sh.getRange(statusCell)]).build());
  sh.setConditionalFormatRules(rules);
  sh.hideColumns(C);
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

/**
 * Lista odrzuconych wartości skrajnych na dole zakładki analizy (Korelacje (kategorie) / Korelacje (wagi)).
 * Każda analiza szuka skrajnych we własnych grupach, więc listy różnią się od zakładki Odrzucone (analiza łączna).
 * @return {number} ostatni wiersz
 */
function writeRejectedTable_(sh, ctx, top, title, warstwaHeader, list) {
  sh.getRange(top, 1).setValue(title).setFontWeight('bold');
  if (!ctx.skrajne.on) {
    sh.getRange(top + 1, 1).setValue('Filtr wartości skrajnych jest wyłączony (Ustawienia, sekcja E).').setFontStyle('italic');
    return top + 1;
  }
  const head = ['Grupa', warstwaHeader, 'Zawody', 'Kategoria (zawody)', 'Zawodnik', 'Waga', 'Ciężar', 'Oczekiwany ciężar', 'Odchylenie', 'z'];
  styleHeader_(sh.getRange(top + 1, 1, 1, head.length).setValues([head]).setWrap(true));
  if (!list.length) {
    sh.getRange(top + 2, 1).setValue('Brak odrzuconych przy tym progu.').setFontStyle('italic');
    return top + 2;
  }
  list.sort((x, y) => x.grupa.localeCompare(y.grupa) || String(x.warstwa).localeCompare(String(y.warstwa)) || x.z - y.z);
  const rows = list.map(x => [x.grupa, x.warstwa, x.zawody, x.kategoria, x.zawodnik, x.waga, x.ciezar, x.oczekiwany, x.odchylenie, x.z]);
  const rng = sh.getRange(top + 2, 1, rows.length, head.length).setValues(rows);
  rng.setBorder(true, true, true, true, true, true, '#BFBFBF', SpreadsheetApp.BorderStyle.SOLID)
    .setWrap(true).setVerticalAlignment('middle');   // kolumny mają szerokości tabel analiz — długie nazwy się zawijają
  sh.getRange(top + 2, 6, rows.length, 3).setNumberFormat('0.0').setHorizontalAlignment('center');
  sh.getRange(top + 2, 9, rows.length, 1).setNumberFormat('+0%;-0%').setHorizontalAlignment('center');
  sh.getRange(top + 2, 10, rows.length, 1).setNumberFormat('0.00').setHorizontalAlignment('center');
  return top + 1 + rows.length;
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
    + ' — razem z 📊 Analiza → Oblicz korelacje. Dotyczy tylko analizy łącznej; '
    + 'odrzuconych w Korelacjach (kategorie) i Korelacjach (wagi) pokazuje lista na dole tamtych zakładek.').setFontColor(STYLE.noteFont);
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
