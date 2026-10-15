function detectDelimiter(header: string): ',' | ';' {
  let commas = 0;
  let semis = 0;
  let quoted = false;
  for (let i = 0; i < header.length; i++) {
    const char = header[i];
    if (char === '"') {
      if (quoted && header[i + 1] === '"') i++;
      else quoted = !quoted;
    } else if (!quoted) {
      if (char === ',') commas++;
      if (char === ';') semis++;
    }
  }
  return semis > commas ? ';' : ',';
}

function parseRecord(record: string, delimiter: ',' | ';'): string[] {
  const values: string[] = [];
  let current = '';
  let quoted = false;
  let wasQuoted = false;
  const finish = () => {
    values.push(wasQuoted ? current : current.trim());
    current = '';
    wasQuoted = false;
  };
  for (let i = 0; i < record.length; i++) {
    const char = record[i];
    if (char === '"') {
      if (quoted && record[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        quoted = !quoted;
        wasQuoted = true;
      }
    } else if (char === delimiter && !quoted) {
      finish();
    } else {
      current += char;
    }
  }
  finish();
  return values;
}

/** RFC 4180: a newline inside a quoted cell is content, not another row. */
export function parseCSVFile(text: string): { headers: string[]; rows: string[][] } {
  const records: string[] = [];
  const source = text.replace(/^\uFEFF/, '');
  let record = '';
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === '"') {
      record += char;
      if (quoted && source[i + 1] === '"') {
        record += source[++i];
      } else {
        quoted = !quoted;
      }
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (record.trim()) records.push(record);
      record = '';
      if (char === '\r' && source[i + 1] === '\n') i++;
    } else {
      record += char;
    }
  }
  if (quoted) throw new Error('El CSV contiene una celda entre comillas sin cerrar.');
  if (record.trim()) records.push(record);
  if (records.length < 2) return { headers: [], rows: [] };
  const delimiter = detectDelimiter(records[0]);
  return {
    headers: parseRecord(records[0], delimiter),
    rows: records.slice(1).map((r) => parseRecord(r, delimiter)),
  };
}
