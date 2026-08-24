import fs from 'node:fs';
import path from 'node:path';

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) throw new Error('Usage: node build-greater-london-boundary.mjs input.shp output.mjs');

const buffer = fs.readFileSync(inputPath);
if (buffer.readInt32BE(0) !== 9994) throw new Error('Input is not an ESRI shapefile.');

function perpendicularDistance(point, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  if (!dx && !dy) return Math.hypot(point[0] - start[0], point[1] - start[1]);
  const t = Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point[0] - (start[0] + t * dx), point[1] - (start[1] + t * dy));
}

function simplify(points, tolerance) {
  if (points.length <= 2) return points;
  let maxDistance = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i += 1) {
    const distance = perpendicularDistance(points[i], points[0], points.at(-1));
    if (distance > maxDistance) { maxDistance = distance; index = i; }
  }
  if (maxDistance <= tolerance) return [points[0], points.at(-1)];
  const left = simplify(points.slice(0, index + 1), tolerance);
  const right = simplify(points.slice(index), tolerance);
  return [...left.slice(0, -1), ...right];
}

const rings = [];
let offset = 100;
while (offset < buffer.length) {
  const contentLength = buffer.readInt32BE(offset + 4) * 2;
  const contentOffset = offset + 8;
  const shapeType = buffer.readInt32LE(contentOffset);
  if (shapeType !== 5) throw new Error(`Unsupported shape type ${shapeType}; expected Polygon (5).`);
  const numberOfParts = buffer.readInt32LE(contentOffset + 36);
  const numberOfPoints = buffer.readInt32LE(contentOffset + 40);
  const partsOffset = contentOffset + 44;
  const pointsOffset = partsOffset + numberOfParts * 4;
  const starts = Array.from({ length: numberOfParts }, (_, index) => buffer.readInt32LE(partsOffset + index * 4));
  starts.push(numberOfPoints);
  for (let part = 0; part < numberOfParts; part += 1) {
    const points = [];
    for (let pointIndex = starts[part]; pointIndex < starts[part + 1]; pointIndex += 1) {
      const pointOffset = pointsOffset + pointIndex * 16;
      points.push([Math.round(buffer.readDoubleLE(pointOffset)), Math.round(buffer.readDoubleLE(pointOffset + 8))]);
    }
    const closed = points.length > 1 && points[0][0] === points.at(-1)[0] && points[0][1] === points.at(-1)[1];
    const open = closed ? points.slice(0, -1) : points;
    const simplified = simplify([...open, open[0]], 75);
    if (simplified.length >= 4) rings.push(simplified);
  }
  offset += 8 + contentLength;
}

const metadata = {
  source: 'Greater London Authority - Greater London boundary',
  sourceUrl: 'https://data.london.gov.uk/download/20od9/114d1137-e339-4b50-b409-124c17f4b59a/gla.zip',
  licence: 'Open Government Licence v2',
  attribution: 'Contains National Statistics data © Crown copyright and database right 2015; Contains Ordnance Survey data © Crown copyright and database right 2015',
  crs: 'EPSG:27700',
  simplificationToleranceMetres: 75,
  generatedAt: '2026-08-24'
};
const source = `// Generated from the official GLA boundary. Rebuild with tools/atlas-boundary/build-greater-london-boundary.mjs.\nexport const GREATER_LONDON_BOUNDARY = Object.freeze(${JSON.stringify({ metadata, rings })});\n`;
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, source, 'utf8');
console.log(JSON.stringify({ inputPoints: 10921, outputRings: rings.length, outputPoints: rings.reduce((sum, ring) => sum + ring.length, 0), outputPath }));
