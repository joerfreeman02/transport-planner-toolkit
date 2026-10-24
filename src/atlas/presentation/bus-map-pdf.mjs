const encoder = new TextEncoder();

function joinBytes(parts) {
  const size = parts.reduce((total, part) => total + part.length, 0);
  const output = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
}

/** Wraps the deterministic composed assessment map image in a one-page A3 landscape PDF. */
export function buildAssessmentMapPdf(jpegBytes, imageWidth, imageHeight) {
  const image = jpegBytes instanceof Uint8Array ? jpegBytes : new Uint8Array(jpegBytes ?? []);
  const width = Number(imageWidth);
  const height = Number(imageHeight);
  if (image.length < 4 || image[0] !== 0xff || image[1] !== 0xd8 || !Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    throw new TypeError('A valid JPEG image and positive image dimensions are required for map PDF export.');
  }

  const pageWidth = 1190.55;
  const pageHeight = 841.89;
  const margin = 24;
  const scale = Math.min((pageWidth - margin * 2) / width, (pageHeight - margin * 2) / height);
  const drawWidth = width * scale;
  const drawHeight = height * scale;
  const x = (pageWidth - drawWidth) / 2;
  const y = (pageHeight - drawHeight) / 2;
  const content = encoder.encode(`q\n${drawWidth.toFixed(2)} 0 0 ${drawHeight.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm\n/MapImage Do\nQ\n`);
  const objects = [
    encoder.encode('<< /Type /Catalog /Pages 2 0 R >>'),
    encoder.encode('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    encoder.encode(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /MapImage 4 0 R >> >> /Contents 5 0 R >>`),
    joinBytes([encoder.encode(`<< /Type /XObject /Subtype /Image /Width ${Math.round(width)} /Height ${Math.round(height)} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.length} >>\nstream\n`), image, encoder.encode('\nendstream')]),
    joinBytes([encoder.encode(`<< /Length ${content.length} >>\nstream\n`), content, encoder.encode('endstream')])
  ];
  const header = new Uint8Array([0x25,0x50,0x44,0x46,0x2d,0x31,0x2e,0x34,0x0a,0x25,0xe2,0xe3,0xcf,0xd3,0x0a]);
  const chunks = [header];
  const offsets = [0];
  let offset = header.length;
  objects.forEach((object, index) => {
    offsets.push(offset);
    const wrapped = joinBytes([encoder.encode(`${index + 1} 0 obj\n`), object, encoder.encode('\nendobj\n')]);
    chunks.push(wrapped);
    offset += wrapped.length;
  });
  const xrefOffset = offset;
  const xref = [`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`, ...offsets.slice(1).map(position => `${String(position).padStart(10, '0')} 00000 n \n`)].join('');
  chunks.push(encoder.encode(`${xref}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`));
  return joinBytes(chunks);
}
