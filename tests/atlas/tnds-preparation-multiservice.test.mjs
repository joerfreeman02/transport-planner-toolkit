import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { prepareTnds } from '../../tools/atlas-bus-data/prepare_tnds.mjs';

const xml = `<TransXChange SchemaVersion="2.5"><Operators><Operator id="OPA"><OperatorCode>OPA</OperatorCode><TradingName>Operator A</TradingName></Operator><Operator id="OPB"><OperatorCode>OPB</OperatorCode><TradingName>Operator B</TradingName></Operator></Operators><Services><Service id="SA"><ServiceCode>SA</ServiceCode><LineName>A1</LineName><RegisteredOperatorRef>OPA</RegisteredOperatorRef><StandardService><JourneyPattern id="JPA"><JourneyPatternSectionRefs>JSA</JourneyPatternSectionRefs></JourneyPattern></StandardService></Service><Service id="SB"><ServiceCode>SB</ServiceCode><LineName>B1</LineName><RegisteredOperatorRef>OPB</RegisteredOperatorRef><StandardService><JourneyPattern id="JPB"><JourneyPatternSectionRefs>JSB</JourneyPatternSectionRefs></JourneyPattern></StandardService></Service></Services><StopPoints><AnnotatedStopPointRef><StopPointRef>A1</StopPointRef><CommonName>A origin</CommonName></AnnotatedStopPointRef><AnnotatedStopPointRef><StopPointRef>A2</StopPointRef><CommonName>A terminal</CommonName></AnnotatedStopPointRef><AnnotatedStopPointRef><StopPointRef>B1</StopPointRef><CommonName>B origin</CommonName></AnnotatedStopPointRef><AnnotatedStopPointRef><StopPointRef>B2</StopPointRef><CommonName>B terminal</CommonName></AnnotatedStopPointRef></StopPoints><JourneyPatternSections><JourneyPatternSection id="JSA"><JourneyPatternTimingLink><From><StopPointRef>A1</StopPointRef></From><To><StopPointRef>A2</StopPointRef></To><RunTime>PT10M</RunTime></JourneyPatternTimingLink></JourneyPatternSection><JourneyPatternSection id="JSB"><JourneyPatternTimingLink><From><StopPointRef>B1</StopPointRef></From><To><StopPointRef>B2</StopPointRef></To><RunTime>PT12M</RunTime></JourneyPatternTimingLink></JourneyPatternSection></JourneyPatternSections><VehicleJourneys><VehicleJourney><ServiceRef>SA</ServiceRef><JourneyPatternRef>JPA</JourneyPatternRef><DepartureTime>08:00:00</DepartureTime><OperatingProfile><MondayToFriday>true</MondayToFriday></OperatingProfile></VehicleJourney><VehicleJourney><ServiceRef>SB</ServiceRef><JourneyPatternRef>JPB</JourneyPatternRef><DepartureTime>09:00:00</DepartureTime><OperatingProfile><MondayToFriday>true</MondayToFriday></OperatingProfile></VehicleJourney></VehicleJourneys></TransXChange>`;

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-tnds-preparation-'));
const input = path.join(root, 'TNDS-SE-v2.5');
const output = path.join(root, 'prepared');
await fs.mkdir(input, { recursive: true });
await fs.writeFile(path.join(input, 'multi-service.xml'), xml);
const result = await prepareTnds({ input, output, preparedAt: '2026-09-07T00:00:00.000Z' });
assert.equal(result.services, 2);
const manifest = JSON.parse(await fs.readFile(path.join(output, 'manifest.json'), 'utf8'));
assert.equal(manifest.services.length, 2);
assert.equal(new Set(manifest.services).size, 2);
const prepared = await Promise.all(manifest.services.map(relative => fs.readFile(path.join(output, relative), 'utf8').then(JSON.parse)));
assert.equal(new Set(prepared.map(service => service.id)).size, 2);
assert.deepEqual(Object.keys(prepared[0].stopSchedules).sort(), ['A1', 'A2']);
assert.deepEqual(Object.keys(prepared[1].stopSchedules).sort(), ['B1', 'B2']);
assert.deepEqual(prepared.map(service => service.operator).sort(), ['Operator A', 'Operator B']);
assert.deepEqual(prepared[0].stopSchedules.A2.monday, [490]);
assert.deepEqual(prepared[1].stopSchedules.B2.monday, [552]);

const duplicate = xml.replace('<Service id="SB"><ServiceCode>SB</ServiceCode>', '<Service id="SA"><ServiceCode>SA</ServiceCode>');
await fs.writeFile(path.join(input, 'duplicate.xml'), duplicate);
await assert.rejects(() => prepareTnds({ input, output: path.join(root, 'duplicate-output') }), /duplicate Service identity SA/);

const quarantineInput = path.join(root, 'TNDS-SE-v2.5-quarantine');
const quarantineOutput = path.join(root, 'quarantine-output');
await fs.mkdir(quarantineInput, { recursive: true });
await fs.writeFile(path.join(quarantineInput, 'mixed.xml'), xml.replace('<RunTime>PT12M</RunTime>', ''));
const quarantineResult = await prepareTnds({ input: quarantineInput, output: quarantineOutput, preparedAt: '2026-09-07T00:00:00.000Z' });
assert.equal(quarantineResult.services, 2);
assert.equal(quarantineResult.quarantinedPatterns, 1);
const quarantineManifest = JSON.parse(await fs.readFile(path.join(quarantineOutput, 'manifest.json'), 'utf8'));
const quarantineServices = await Promise.all(quarantineManifest.services.map(relative => fs.readFile(path.join(quarantineOutput, relative), 'utf8').then(JSON.parse)));
const quarantinedService = quarantineServices.find(service => service.source.serviceCode === 'SB');
assert.ok(quarantinedService);
assert.equal(quarantineServices.find(service => service.source.serviceCode === 'SA').tndsQuarantine, null);
assert.deepEqual(quarantinedService.stopSchedules, {});
assert.equal(quarantinedService.tndsQuarantine.serviceQuarantined, true);
assert.deepEqual(quarantinedService.tndsQuarantine.affectedStopIds.sort(), ['B1', 'B2']);
const unknownScope = xml.replace('<RunTime>PT12M</RunTime>', '').replace('<JourneyPatternSectionRefs>JSB</JourneyPatternSectionRefs>', '<JourneyPatternSectionRefs>MISSING</JourneyPatternSectionRefs>');
await fs.writeFile(path.join(quarantineInput, 'unknown.xml'), unknownScope);
await assert.rejects(() => prepareTnds({ input: quarantineInput, output: path.join(root, 'unknown-output') }), /no deterministically identifiable affected StopPoint IDs/);
console.log('PASS TNDS preparation multi-Service output and collision tests.');
