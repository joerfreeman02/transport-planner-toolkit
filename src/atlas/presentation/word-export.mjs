import * as legacyWord from '../../../assets/js/word-export.js';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const cell = value => escapeHtml(value).replace(/\r?\n/g, '<br>');
const xml = escapeHtml;

export const EAS_WORD_THEME = legacyWord.EAS_WORD_THEME;

export function buildEasTable({ caption, headers, rows, widths = [], beforeTableNotes = [] }) {
  const cols = widths.length === headers.length ? `<colgroup>${widths.map(width => `<col style="width:${Number(width)}%">`).join('')}</colgroup>` : '';
  const notes = beforeTableNotes.map(note => `<p class="eas-table-note">${cell(note)}</p>`).join('');
  const head = headers.map(value => `<th>${cell(value)}</th>`).join('');
  let dataIndex = 0;
  const body = rows.map(row => {
    if (!Array.isArray(row)) {
      const kind = row.kind === 'section' ? 'section' : 'summary';
      return `<tr class="${kind}"><td colspan="${headers.length}">${cell(row.text)}</td></tr>`;
    }
    const html = `<tr class="${dataIndex % 2 ? 'band' : ''}">${row.map(value => `<td>${cell(value)}</td>`).join('')}</tr>`;
    dataIndex += 1;
    return html;
  }).join('');
  return `<section class="eas-export"><p class="eas-caption">${cell(caption)}</p>${notes}<table class="eas-table">${cols}<thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></section>`;
}

export function plainTables(tables) {
  return tables.map(({ caption, headers, rows, beforeTableNotes = [] }) => [caption, ...beforeTableNotes, headers.join('\t'), ...rows.map(row => Array.isArray(row) ? row.join('\t') : row.text)].join('\n')).join('\n\n');
}

export function wordFragment(tables) {
  return `<div class="eas-word-export">${tables.map(buildEasTable).join('')}</div>`;
}

export function wordDocument(title, tables) {
  return `<!doctype html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><meta name="ProgId" content="Word.Document"><title>${escapeHtml(title)}</title><style>body{font-family:Roboto,Arial,sans-serif;font-size:11pt;color:#000}.eas-export{margin:0 0 14pt;page-break-inside:avoid}.eas-caption{margin:11pt 0 6pt;color:#B3B3B3;font-style:italic;font-size:9pt}.eas-table-note{margin:0 0 6pt;font-size:9pt;line-height:1.35}.eas-table{border-collapse:collapse;table-layout:fixed;width:100%;font-size:9pt}.eas-table th,.eas-table td{border:.5pt solid #000;padding:3pt 4pt;vertical-align:middle;overflow-wrap:anywhere}.eas-table th{background:#D95300;color:#FFF;font-weight:600;text-align:center}.eas-table td{text-align:center}.eas-table td:first-child,.eas-table tr.section td,.eas-table tr.summary td{text-align:left}.eas-table tr.band td,.eas-table tr.summary td{background:#EFEFEF}</style></head><body>${wordFragment(tables)}</body></html>`;
}

function readStoredZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries = {};
  let offset = 0;
  while (offset + 30 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const dataLength = view.getUint32(offset + 18, true);
    const nameStart = offset + 30;
    const name = new TextDecoder().decode(bytes.slice(nameStart, nameStart + nameLength));
    const dataStart = nameStart + nameLength + extraLength;
    entries[name] = bytes.slice(dataStart, dataStart + dataLength);
    offset = dataStart + dataLength;
  }
  return entries;
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let value = n;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[n] = value >>> 0;
  }
  return table;
})();
function crc32(bytes) { let value = 0xffffffff; for (const byte of bytes) value = crcTable[(value ^ byte) & 255] ^ (value >>> 8); return (value ^ 0xffffffff) >>> 0; }
function u16(value) { const bytes = new Uint8Array(2); new DataView(bytes.buffer).setUint16(0, value, true); return bytes; }
function u32(value) { const bytes = new Uint8Array(4); new DataView(bytes.buffer).setUint32(0, value, true); return bytes; }
function join(parts) { const output = new Uint8Array(parts.reduce((length, part) => length + part.length, 0)); let offset = 0; for (const part of parts) { output.set(part, offset); offset += part.length; } return output; }
function storedZip(entries) {
  const encoder = new TextEncoder();
  const files = [], central = [];
  let offset = 0;
  for (const [name, data] of Object.entries(entries)) {
    const nameBytes = encoder.encode(name), crc = crc32(data);
    const local = join([u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0), nameBytes, data]);
    files.push(local);
    central.push(join([u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), nameBytes]));
    offset += local.length;
  }
  const directory = join(central);
  return new Blob([join([...files, directory, join([u32(0x06054b50), u16(0), u16(0), u16(central.length), u16(central.length), u32(directory.length), u32(offset), u16(0)])])], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

function noteParagraph(note) {
  return `<w:p><w:pPr><w:keepNext/><w:spacing w:after="120"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Roboto" w:hAnsi="Roboto"/><w:sz w:val="18"/></w:rPr><w:t xml:space="preserve">${xml(note)}</w:t></w:r></w:p>`;
}

export function docxBlob(title, tables, wording = '') {
  const base = legacyWord.docxBlob(title, tables, wording);
  return {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    async arrayBuffer() {
      const entries = readStoredZip(new Uint8Array(await base.arrayBuffer()));
      let document = new TextDecoder().decode(entries['word/document.xml']);
      for (const table of tables) {
        const captionIndex = document.indexOf(`<w:t>${xml(table.caption)}</w:t>`);
        if (captionIndex < 0 || !table.beforeTableNotes?.length) continue;
        const paragraphEnd = document.indexOf('</w:p>', captionIndex);
        const tableStart = document.indexOf('<w:tbl>', paragraphEnd);
        if (paragraphEnd < 0 || tableStart < 0) continue;
        document = `${document.slice(0, paragraphEnd + 6)}${table.beforeTableNotes.map(noteParagraph).join('')}${document.slice(paragraphEnd + 6)}`;
      }
      entries['word/document.xml'] = new TextEncoder().encode(document);
      return (await storedZip(entries).arrayBuffer());
    }
  };
}

export async function copyWordTables(tables) {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw Error('Rich clipboard access is unavailable in this browser.');
  await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([wordFragment(tables)], { type: 'text/html' }), 'text/plain': new Blob([plainTables(tables)], { type: 'text/plain' }) })]);
}

export function downloadWordDocument(filename, title, tables, wording = '') {
  docxBlob(title, tables, wording).arrayBuffer().then(bytes => { const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })), link = document.createElement('a'); link.href = url; link.download = filename.replace(/\.doc$/i, '.docx'); link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); });
}
