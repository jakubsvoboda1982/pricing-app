import React from 'react'
import { Globe } from 'lucide-react'
import { useMarketStore, Market } from '@/store/market'

export default function MarketSelector() {
  const selectedMarket = useMarketStore((state) => state.selectedMarket)
  const setMarket = useMarketStore((state) => state.setMarket)
  const getMarketLabel = useMarketStore((state) => state.getMarketLabel)

  const markets: { value: Market; label: string; flag: string }[] = [
    { value: 'CZ', label: 'Česko', flag: '🇨🇿' },
    { value: 'SK', label: 'Slovensko', flag: '🇸🇰' },
    { value: 'ALL', label: 'Všechny trhy', flag: '🌍' },
  ]

  return (
    <div className="flex items-center space-x-2">
      <Globe size={18} className="text-gray-600" />
      <div className="flex items-center bg-white border border-gray-200 rounded-lg">
        {markets.map((market) => (
          <button
            key={market.value}
            onClick={() => setMarket(market.value)}
            className={`px-4 py-2 text-sm font-medium transition whitespace-nowrap
              ${
                selectedMarket === market.value
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-700 hover:bg-gray-100'
              }
              ${market.value !== 'ALL' && 'border-r border-gray-200 last:border-r-0'}
            `}
            title={`Vyfiltruj ${market.label}`}
          >
            <span className="mr-2">{market.flag}</span>
            {market.label}
          </button>
        ))}
      </div>
    </div>
  )
}
