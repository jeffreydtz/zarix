import { fromBuffer } from 'yauzl';
import { ApiError } from '@/lib/api-handler';

export const XLSX_LIMITS = { entries: 256, expandedBytes: 32 * 1024 * 1024, entryBytes: 8 * 1024 * 1024 };

/** Validate actual decompressed bytes before ExcelJS materializes XML/cells in memory. */
export function validateXlsxArchive(buffer: ArrayBuffer): Promise<void> {
  return new Promise((resolve, reject) => {
    fromBuffer(Buffer.from(buffer), { lazyEntries: true, validateEntrySizes: true }, (error, zip) => {
      if (error || !zip) return reject(new ApiError('El archivo Excel no es un ZIP válido.', 400));
      let entries = 0;
      let expanded = 0;
      let settled = false;
      const fail = () => {
        if (settled) return;
        settled = true;
        zip.close();
        reject(new ApiError('El Excel está dañado o supera los límites de contenido. Dividilo en archivos más chicos.', 413));
      };
      zip.on('error', fail);
      zip.on('end', () => { if (!settled) { settled = true; resolve(); } });
      zip.on('entry', entry => {
        if (settled) return;
        entries++;
        if (entries > XLSX_LIMITS.entries || entry.uncompressedSize > XLSX_LIMITS.entryBytes || expanded + entry.uncompressedSize > XLSX_LIMITS.expandedBytes) return fail();
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) return fail();
          let size = 0;
          stream.on('error', fail);
          stream.on('data', (chunk: Buffer) => {
            size += chunk.length;
            expanded += chunk.length;
            if (size > XLSX_LIMITS.entryBytes || expanded > XLSX_LIMITS.expandedBytes) {
              stream.destroy();
              fail();
            }
          });
          stream.on('end', () => { if (!settled) zip.readEntry(); });
        });
      });
      zip.readEntry();
    });
  });
}
