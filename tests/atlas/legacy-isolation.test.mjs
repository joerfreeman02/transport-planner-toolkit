import { assertLegacyIsolation, LEGACY_BASELINE, PROTECTED_LEGACY_OBJECTS } from './legacy-isolation-guard.mjs';

assertLegacyIsolation();
console.log(`PASS Legacy isolation — ${Object.keys(PROTECTED_LEGACY_OBJECTS).length} protected path groups match canonical baseline ${LEGACY_BASELINE.slice(0, 7)}.`);
