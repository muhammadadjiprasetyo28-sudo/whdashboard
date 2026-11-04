import { parseToIsoDate, formatToDDMMYYYY, displayTanggalIndonesian } from '../src/lib/dateUtils';
import { parseMtsQuantity, getSmartQuantity } from '../src/lib/numberUtils';
import { AREAS, isValidArea, getGasUrlForArea } from '../src/config/areas';
import { computeUserPermissions, type UserRole } from '../src/config/permissions';

let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passedTests++;
  } else {
    console.error(`  ✗ FAIL: ${testName} ${detail ? `(${detail})` : ''}`);
    failedTests++;
  }
}

console.log('====================================================');
console.log('WH Command Center — Comprehensive Unit Test Suite');
console.log('====================================================\n');

// ----------------------------------------------------
// TEST GROUP 1: Date Parsing & Formats
// ----------------------------------------------------
console.log('--- 1. Testing Date Parsing & Indonesian Formats ---');

// DD/MM/YYYY
assert(parseToIsoDate('28/08/2026') === '2026-08-28', 'Parse DD/MM/YYYY (28/08/2026)');

// MM/DD/YYYY
assert(parseToIsoDate('08/28/2026') === '2026-08-28', 'Parse MM/DD/YYYY (08/28/2026)');

// YYYY-MM-DD
assert(parseToIsoDate('2026-08-28') === '2026-08-28', 'Parse YYYY-MM-DD (2026-08-28)');

// YYYY/MM/DD
assert(parseToIsoDate('2026/08/28') === '2026-08-28', 'Parse YYYY/MM/DD (2026/08/28)');

// Indonesian Month Name
assert(parseToIsoDate('28 Agustus 2026') === '2026-08-28', 'Parse Indonesian month "28 Agustus 2026"');
assert(parseToIsoDate('15 Jan 2025') === '2025-01-15', 'Parse short Indonesian month "15 Jan 2025"');
assert(parseToIsoDate('10-Okt-2026') === '2026-10-10', 'Parse hyphenated month "10-Okt-2026"');

// ISO Timestamp
assert(parseToIsoDate('2026-09-01T07:00:00.000Z') === '2026-09-01', 'Parse ISO Timestamp');

// Excel Serial Date (e.g. 45532 -> 2024-08-28)
const excelIso = parseToIsoDate('45532');
assert(Boolean(excelIso && excelIso.startsWith('2024-08')), 'Parse Excel Serial Date 45532');

// Empty / Null / #N/A / Invalid date
assert(parseToIsoDate('') === '', 'Empty string returns empty');
assert(parseToIsoDate(null) === '', 'null returns empty');
assert(parseToIsoDate(undefined) === '', 'undefined returns empty');
assert(parseToIsoDate('#N/A') === '', '#N/A returns empty');
assert(parseToIsoDate('-') === '', 'Hyphen placeholder returns empty');
assert(parseToIsoDate('random-nonsense') === '', 'Invalid text returns empty');
assert(parseToIsoDate('2026-02-31') === '', 'Calendar invalid date (Feb 31) returns empty');

// Formatting helpers
assert(formatToDDMMYYYY('2026-08-28') === '28/08/2026', 'formatToDDMMYYYY outputs 28/08/2026');
assert(displayTanggalIndonesian('2026-08-28') === '28 Agustus 2026', 'displayTanggalIndonesian outputs 28 Agustus 2026');

// ----------------------------------------------------
// TEST GROUP 2: Enterprise Quantity & MTS Parsing
// ----------------------------------------------------
console.log('\n--- 2. Testing Quantity & MTS Number Formats ---');

// 1.000 -> baseVal 1, thousandVal 1000
const q1 = parseMtsQuantity('1.000');
assert(q1.baseVal === 1 && q1.thousandVal === 1000, 'Parse "1.000" baseVal=1 thousandVal=1000');
assert(getSmartQuantity(q1, 1) === 1, 'Smart match "1.000" against physical 1 -> 1');

// 13.000 -> baseVal 13, thousandVal 13000
const q13 = parseMtsQuantity('13.000');
assert(getSmartQuantity(q13, 13000) === 13000, 'Smart match "13.000" against physical 13000 (Baut SS) -> 13000');

// 2.837.100 -> dots as thousand separators
const qBig = parseMtsQuantity('2.837.100');
assert(qBig.parsedVal === 2837100, 'Parse "2.837.100" -> 2837100');

// Comma decimals: 12,5 and 12,50
const qDec1 = parseMtsQuantity('12,5');
assert(qDec1.parsedVal === 12.5, 'Parse comma decimal "12,5" -> 12.5');
const qDec2 = parseMtsQuantity('12,50');
assert(qDec2.parsedVal === 12.5, 'Parse comma decimal "12,50" -> 12.5');

// Thousands with dot: 2.732 -> 2732
const qThous = parseMtsQuantity('2.732');
assert(qThous.parsedVal === 2732, 'Parse thousands "2.732" -> 2732');

// Negative quantity: -40.000
const qNeg = parseMtsQuantity('-40.000');
assert(qNeg.baseVal === -40, 'Parse negative "-40.000" -> baseVal -40');

// ----------------------------------------------------
// TEST GROUP 3: Permissions & Role Matrix
// ----------------------------------------------------
console.log('\n--- 3. Testing Role & Permission Matrix ---');

const superPerms = computeUserPermissions('SUPER_ADMIN', 'ALL');
assert(superPerms.canSwitchArea === true, 'Super Admin can switch areas');
assert(superPerms.canReconcile === true, 'Super Admin can reconcile');

const hqPerms = computeUserPermissions('HQ', 'All Cabang');
assert(hqPerms.canSwitchArea === true, 'HQ can switch areas');
assert(hqPerms.canWriteTransactions === false, 'HQ is aggregate read-only for writes');

const areaPerms = computeUserPermissions('ADMIN_AREA', 'Jakarta');
assert(areaPerms.canSwitchArea === false, 'Admin Jakarta cannot switch areas');
assert(areaPerms.canWriteTransactions === true, 'Admin Jakarta can write transactions');

const mpPerms = computeUserPermissions('MP', 'All Cabang', true);
assert(mpPerms.canWriteTransactions === false, 'MP is read-only');

const helperPerms = computeUserPermissions('HELPER', 'ALL');
assert(helperPerms.canReconcile === false, 'Helper cannot reconcile');
assert(helperPerms.canAccessC3 === true, 'Helper has access to C3');

// ----------------------------------------------------
// TEST GROUP 4: Area Validation
// ----------------------------------------------------
console.log('\n--- 4. Testing Area Configuration & Validation ---');

assert(isValidArea('Jakarta') === true, 'Jakarta is valid area');
assert(isValidArea('Karawang') === true, 'Karawang is valid area');
assert(isValidArea('All Cabang') === true, 'All Cabang is valid area');
assert(isValidArea('NonExistentCity') === false, 'NonExistentCity is invalid area');
assert(AREAS.length === 12, 'Total areas equals 12 (11 branches + All Cabang)');
assert(getGasUrlForArea('Jakarta').startsWith('https://script.google.com/'), 'Jakarta has valid GAS URL');
assert(getGasUrlForArea('All Cabang') === 'HQ', 'All Cabang returns HQ marker');

// ----------------------------------------------------
// SUMMARY
// ----------------------------------------------------
console.log('\n====================================================');
console.log(`Test Execution Finished: ${passedTests} PASSED, ${failedTests} FAILED`);
console.log('====================================================');

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
