#!/usr/bin/env node
/**
 * test_analiza.js — uruchamia logikę arkusza (Template.js, Code.js, Analiza.js) lokalnie w Node,
 * na plikach CSV z folderu dane/, bez Google Sheets. Do sprawdzania obliczeń i szybkich analiz.
 *
 * Użycie (z folderu projektu):
 *   node tools/test_analiza.js [--dane dane] [--zawody "MP 2026 Bochnia"] [--kategoria "AMATOR KOBIET +65 KG"]
 *                              [--podzial 0|1|2] [--skrajne MAD:3|SD:3|off] [--testy 0.5,0.67,0.75]
 *                              [--powtorzenia wszystkie|najnowszy] [--klasy "K:58,65,72;M:75,85,95"]
 *                              [--boje "TGU,SSP,2KBSQ"] [--schemat "K:,0.25;M:,0"]
 *
 *   --podzial: 0 = Klasa wagowa (domyślnie), 1 = Klasa wagowa × poziom, 2 = Zawody × kategoria
 *   --powtorzenia: wszystkie starty (domyślnie) albo tylko najnowszy start zawodnika w każdym boju (Ustawienia, sekcja G)
 *   --klasy: granice symulacji klas wagowych (Ustawienia, sekcja H), do 3 na płeć; domyślnie "K:65;M:85"
 *   --schemat: b dla klas symulacji (klasa 1 = najlżejsza; puste = b oficjalny), algorytm „Schemat” w Korelacje (wagi)
 *   --boje: boje do analizy (Ustawienia, sekcja B, kolumna „Analizuj”); domyślnie wszystkie
 *
 * Co robi:
 *  1. wczytuje CSV parserem importu (parseImportCsv_ — te same zasady co 📥 Dane → Importuj CSV),
 *  2. liczy wagę jak „Policz wagi” (fillWeights_),
 *  3. buduje wiersze zakładki Wyniki tak jak formuły ARRAYFORMULA (ciężar, b oficjalny, W analizie, wyniki dla b),
 *  4. uruchamia computeCorrelations() i computeCorrelationsByCategory() z podmienionym zapisem do arkusza
 *     i wypisuje tabele w konsoli.
 * Statystyki zostały zweryfikowane względem scipy (Pearson, Spearman, p-value, Fisher, b neutralne).
 */
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };
const root = path.resolve(__dirname, '..');
const daneDir = path.resolve(root, opt('dane', 'dane'));
const filtrZawody = opt('zawody', 'WSZYSTKIE');
const filtrKategoria = opt('kategoria', 'WSZYSTKIE');
const podzialIdx = Number(opt('podzial', '0'));
const skrajneArg = opt('skrajne', 'MAD:3');
const testy = opt('testy', '0.5,0.67,0.75').split(',').map(Number);
const powtArg = opt('powtorzenia', 'wszystkie');
if (['wszystkie', 'najnowszy'].indexOf(powtArg) < 0) { console.error('--powtorzenia: wszystkie albo najnowszy'); process.exit(1); }
const najnowszy = powtArg === 'najnowszy';
// granice symulacji klas wagowych (Ustawienia, sekcja H), np. "K:58,65,72;M:75,85,95"
const klasyArg = opt('klasy', 'K:65;M:85');
const klasyVals = [[], [], []];
klasyArg.split(';').forEach(part => {
  const [p, list] = part.split(':');
  const j = ['K', 'M'].indexOf(p.trim());
  if (j < 0) { console.error('--klasy: format "K:58,65,72;M:75,85,95"'); process.exit(1); }
  (list || '').split(',').filter(s => s.trim() !== '').slice(0, 3).forEach((v, i) => { klasyVals[i][j] = Number(v); });
});
klasyVals.forEach(r => { if (r[0] === undefined) r[0] = ''; if (r[1] === undefined) r[1] = ''; });
// schemat b dla klas symulacji (sekcja H, „b w schemacie”), klasa 1…4, puste = b oficjalny, np. "K:,0.25;M:,0"
const schematArg = opt('schemat', '');
const schematVals = [['', ''], ['', ''], ['', ''], ['', '']];
schematArg.split(';').filter(x => x).forEach(part => {
  const [p, list] = part.split(':');
  const j = ['K', 'M'].indexOf(p.trim());
  if (j < 0) { console.error('--schemat: format "K:,0.25;M:,0"'); process.exit(1); }
  (list || '').split(',').slice(0, 4).forEach((v, i) => { schematVals[i][j] = v.trim() === '' ? '' : Number(v); });
});

// --- atrapy Apps Script
global.Utilities = {
  parseCsv: (t, d) => t.split(/\r?\n/).filter((l, i, a) => !(i === a.length - 1 && l === '')).map(l => l.split(d)),
  formatDate: () => '',
};
global.SpreadsheetApp = { getActiveSpreadsheet: () => ({ getRangeByName: () => null, toast: () => {} }) };

// --- kod projektu (wspólna przestrzeń nazw jak w Apps Script)
const src = ['Template.js', 'Code.js', 'Analiza.js'].map(f => fs.readFileSync(path.join(root, f), 'utf8')).join('\n');
eval(src.replace(/^const /gm, 'var '));   // eslint-disable-line no-eval

// --- 1. Dane
let dane = [];
fs.readdirSync(daneDir).filter(f => f.endsWith('.csv')).sort().forEach(f => {
  const r = parseImportCsv_(fs.readFileSync(path.join(daneDir, f), 'utf8'));
  if (r.errors.length) { console.error(f, r.errors.slice(0, 3)); process.exit(1); }
  dane = dane.concat(r.rows);
});

// --- 2. Wagi (jak „Policz wagi”)
const sheet = {
  getRange: (row, col, nr, nc) => ({
    getValues: () => dane.slice(row - 2, row - 2 + nr).map(r => {
      const o = r.slice(col - 1, col - 1 + nc); while (o.length < nc) o.push(''); return o.map(v => v === undefined ? '' : v);
    }),
    setValues: v => v.forEach((x, i) => x.forEach((y, j) => { dane[row - 2 + i][col - 1 + j] = y; })),
  }),
};
const wagi = fillWeights_(sheet, 2, dane.length);

// --- 3. Wyniki (jak formuły w zakładce Wyniki)
const bOf = {};
B_OFICJALNE_START.forEach(r => { bOf[r[0]] = { K: r[1], M: r[2] }; });
const wyniki = dane.map(r => {
  const boj = r[D.boj - 1], pl = r[D.plec - 1], wynik = r[D.wynik - 1], waga = r[D.waga - 1];
  const c = isPullUp_(boj) ? waga + wynik : wynik;
  const b = (bOf[boj] || {})[pl];
  const ok = typeof waga === 'number' && waga > 0 && wynik > 0 && typeof b === 'number';
  const inA = ok && (filtrZawody === 'WSZYSTKIE' || r[0] === filtrZawody)
    && (filtrKategoria === 'WSZYSTKIE' || r[1] === filtrKategoria) ? 1 : 0;
  return [r[0], r[1], boj, pl, r[D.imie - 1] + ' ' + r[D.nazwisko - 1], wynik, waga, c, b, inA,
    inA ? boj + ' | ' + pl : '', c, c / waga, c / Math.pow(waga, b),
    c / Math.pow(waga, testy[0]), c / Math.pow(waga, testy[1]), c / Math.pow(waga, testy[2])];
});

// --- 4. Analiza
const groups = [];
const bojeArg = opt('boje', '');
const bojeWybrane = bojeArg ? bojeArg.split(',').map(s => s.trim()) : B_OFICJALNE_START.map(r => r[0]);
B_OFICJALNE_START.filter(r => bojeWybrane.indexOf(r[0]) >= 0)
  .forEach(r => PLCIE.forEach((p, j) => groups.push({ key: r[0] + ' | ' + p, boj: r[0], plec: p, bOfic: r[1 + j] })));
if (!groups.length) { console.error('--boje: brak znanych bojów (np. "TGU,SSP,2KBSQ")'); process.exit(1); }
const [met, prog] = skrajneArg === 'off' ? ['MAD', 3] : skrajneArg.split(':');
// powtarzający się zawodnicy — jak w analysisContext_ (po filtrze Zawody, przed wartościami skrajnymi)
const rowsAll = wyniki.filter(r => r[W.wAnalizie - 1] === 1);
const validAll = wyniki.filter(r => typeof r[W.ciezar - 1] === 'number' && r[W.waga - 1] > 0 && r[W.wynik - 1] > 0
  && (filtrZawody === 'WSZYSTKIE' || r[0] === filtrZawody));
const dedup = x => najnowszy ? dedupNewest_(x) : { kept: x, dropped: [], conflicts: [] };
const dRows = dedup(rowsAll), dValid = dedup(validAll);
const conflicts = unique_(dRows.conflicts.concat(dValid.conflicts));
if (conflicts.length) { console.error('Konflikty powtórzeń:\n  ' + conflicts.join('\n  ')); process.exit(1); }
const ctx = {
  rows: dRows.kept,
  valid: dValid.kept,
  powtorzenia: { najnowszy: najnowszy, pominietoRows: dRows.dropped.length, pominietoValid: dValid.dropped.length },
  groups: groups,
  podzial: PODZIALY[podzialIdx] || PODZIALY[0],
  skrajne: { on: skrajneArg !== 'off', metoda: met, prog: Number(prog) },
  filtrZawody: filtrZawody, filtrKategoria: filtrKategoria, tests: testy,
  klasySym: klasySymFromValues_(klasyVals),
  schematB: schematBFromValues_(schematVals),
  typBoju: B_OFICJALNE_START.reduce((o, r) => { o[r[0]] = typBojuStart_(r[0]); return o; }, {}),
  boje: { wybrane: B_OFICJALNE_START.map(r => r[0]).filter(b => bojeWybrane.indexOf(b) >= 0), wszystkich: B_OFICJALNE_START.length },
};
analysisContext_ = () => ctx;
writeOdrzucone_ = () => {};
let kor, kat;
writeKorelacje_ = (ss, c, g) => { kor = g; };
writeKorKat_ = (ss, c, g, cl, st, ty) => { kat = { g: g, cl: cl, st: st, ty: ty }; };
let wag;
writeKorWagi_ = (ss, c, r) => { wag = r; };
computeCorrelations();
computeCorrelationsByCategory();
computeCorrelationsByWeightClass();

// --- wydruk
const f3 = v => typeof v === 'number' ? (v >= 0 ? ' ' : '') + v.toFixed(3) : String(v).padStart(6);
const f2 = v => typeof v === 'number' ? v.toFixed(2) : String(v);
console.log(`Dane: ${dane.length} wierszy, policzono wag: ${wagi.filled} | zawody = ${filtrZawody}, kategoria = ${filtrKategoria}`
  + ` | skrajne: ${skrajneArg} | podział: ${ctx.podzial} | testy b: ${testy.join(', ')}`
  + ` | boje: ${bojeArg || 'wszystkie'} | powtórzenia: ${powtArg}` + (najnowszy ? ` (pominięto: łącznie ${dRows.dropped.length}, w kategoriach ${dValid.dropped.length})` : ''));
console.log('\n== Korelacje (łącznie) — r Pearsona: b=0, b=1, b ofic. | ρ ofic.');
kor.filter(g => g.algos.length).forEach(g => console.log(`  ${g.key.padEnd(14)} n=${String(g.n).padStart(3)}  r: ${f3(g.algos[0].r)} ${f3(g.algos[1].r)} ${f3(g.algos[2].r)} | ρ ofic ${f3(g.algos[2].rho)}`));
const line = g => `  ${g.key.padEnd(18)} n=${String(g.n).padStart(3)}  ρ: b=0 ${f3(g.algos[0].rho)}  b=1 ${f3(g.algos[1].rho)}  ofic ${f3(g.algos[2].rho)} (p ${f2(g.algos[2].p)})`
  + (g.algos[6] ? `  schemat ${f3(g.algos[6].rho)} (p ${f2(g.algos[6].p)})` : '') + `  | b neutralne ${f2(g.bNeutral)} | ${g.closest}`;
console.log('\n== Korelacje (kategorie) — tabela 1: wg płci');
kat.g.filter(g => g.k).forEach(g => console.log(line(g)));
console.log('\n== Korelacje (kategorie) — tabela 2: wg klas wagowych');
kat.cl.filter(g => g.k).forEach(g => console.log(line(g)));
const lineT = g => `  ${g.key.padEnd(30)} bojów ${g.k} n=${String(g.n).padStart(4)}  ρ: b=0 ${f3(g.algos[0].rho)}  b=1 ${f3(g.algos[1].rho)}  ofic ${f3(g.algos[2].rho)}`
  + (g.algos[6] ? `  schemat ${f3(g.algos[6].rho)}` : '') + `  | b neutralne ${f2(g.bNeutral)} | b ofic ${f2(g.bOfic)}`;
console.log('\n== Korelacje (kategorie) — średnio z bojów: klasa × typ, płeć × typ');
kat.ty.klasy.concat(kat.ty.plcie).filter(g => g.k).forEach(g => console.log(lineT(g)));
console.log(`\n== Korelacje (wagi) — symulacja klas: ${klasyArg} | schemat: ${schematArg || 'oficjalny'}`);
wag.overview.forEach(o => console.log(`  ${o.klasa.padEnd(12)} startów ${String(o.starty).padStart(3)}  waga ${f2(o.min)} / ${f2(o.med)} / ${f2(o.max)}  b schematu ${f2(o.bSchematu)}`));
console.log('  -- klasa × bój');
wag.classRes.filter(g => g.k).forEach(g => console.log(line(g)));
console.log('  -- płeć × bój (Fisher z klas)');
wag.sexRes.filter(g => g.k).forEach(g => console.log(line(g)));
console.log('  -- średnio z bojów: klasa × typ, płeć × typ');
wag.typeRes.klasy.concat(wag.typeRes.plcie).filter(g => g.k).forEach(g => console.log(lineT(g)));
