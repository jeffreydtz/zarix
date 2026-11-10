import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('PWA manifest screenshots', () => {
  const manifest = JSON.parse(
    readFileSync(join(process.cwd(), 'public/manifest.json'), 'utf8')
  ) as {
    screenshots?: Array<{ src: string; sizes: string; form_factor: string; type?: string }>;
  };

  it('declares wide and narrow screenshots with form_factor', () => {
    const shots = manifest.screenshots ?? [];
    expect(shots.some((s) => s.form_factor === 'wide' && /^\d+x\d+$/.test(s.sizes))).toBe(true);
    expect(shots.some((s) => s.form_factor === 'narrow' && /^\d+x\d+$/.test(s.sizes))).toBe(true);
    for (const shot of shots) {
      expect(shot.src.startsWith('/')).toBe(true);
      expect(shot.type).toBe('image/png');
      const bytes = readFileSync(join(process.cwd(), 'public', shot.src.replace(/^\//, '')));
      expect(bytes.subarray(0, 8)).toEqual(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      );
    }
  });
});
