'use client';

import { useState } from 'react';
import type { InvestmentType } from '@/types/database';
import { initialsForAsset } from '@/lib/investments/asset-logo';

interface AssetLogoProps {
  type: InvestmentType;
  ticker: string | null;
  name: string;
  size?: number;
}

export default function AssetLogo({ type, ticker, name, size = 40 }: AssetLogoProps) {
  const [failed, setFailed] = useState(false);
  const initials = initialsForAsset(name, ticker);
  const src =
    ticker && !failed
      ? `/api/investments/logo?type=${encodeURIComponent(type)}&ticker=${encodeURIComponent(ticker)}`
      : null;

  return (
    <span
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-control bg-primary/10 text-primary font-semibold"
      style={{ width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.36)) }}
      aria-hidden
    >
      {src ? (
        // CSP img-src 'self': logos are proxied by our API.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          className="h-full w-full object-contain bg-card"
          onError={() => setFailed(true)}
        />
      ) : (
        initials
      )}
    </span>
  );
}
