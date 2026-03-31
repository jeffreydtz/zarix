'use client';

interface QuotesWidgetProps {
  quotes: {
    dolar: Record<
      string,
      {
        type: string;
        buy: number;
        sell: number;
      }
    >;
    crypto: {
      btc: { priceUSD: number; change24h: number };
      eth: { priceUSD: number; change24h: number };
      usdt: { priceUSD: number };
    };
  };
}

export default function QuotesWidget({ quotes }: QuotesWidgetProps) {
  return (
    <div className="card">
      <h3 className="text-lg font-semibold mb-3">Cotizaciones</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <div className="text-xs text-gray-500 mb-1">💵 Dólar Blue</div>
          <div className="text-xl font-bold">
            ${quotes.dolar.blue.sell.toFixed(2)}
          </div>
        </div>

        <div>
          <div className="text-xs text-gray-500 mb-1">📊 MEP</div>
          <div className="text-xl font-bold">
            ${quotes.dolar.mep.sell.toFixed(2)}
          </div>
        </div>

        <div>
          <div className="text-xs text-gray-500 mb-1">₿ Bitcoin</div>
          <div className="text-xl font-bold">
            ${quotes.crypto.btc.priceUSD.toLocaleString('en-US', { maximumFractionDigits: 0 })}
          </div>
          <div
            className={`text-xs ${
              quotes.crypto.btc.change24h >= 0 ? 'text-green-600' : 'text-red-600'
            }`}
          >
            {quotes.crypto.btc.change24h >= 0 ? '+' : ''}
            {quotes.crypto.btc.change24h.toFixed(2)}%
          </div>
        </div>

        <div>
          <div className="text-xs text-gray-500 mb-1">💎 Ethereum</div>
          <div className="text-xl font-bold">
            ${quotes.crypto.eth.priceUSD.toLocaleString('en-US', { maximumFractionDigits: 0 })}
          </div>
          <div
            className={`text-xs ${
              quotes.crypto.eth.change24h >= 0 ? 'text-green-600' : 'text-red-600'
            }`}
          >
            {quotes.crypto.eth.change24h >= 0 ? '+' : ''}
            {quotes.crypto.eth.change24h.toFixed(2)}%
          </div>
        </div>
      </div>
    </div>
  );
}
