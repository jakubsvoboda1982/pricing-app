import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Market = 'CZ' | 'SK' | 'ALL'

interface MarketStore {
  selectedMarket: Market
  setMarket: (market: Market) => void
  getMarketLabel: () => string
}

export const useMarketStore = create<MarketStore>()(
  persist(
    (set, get) => ({
      selectedMarket: 'ALL' as Market,

      setMarket: (market: Market) => {
        set({ selectedMarket: market })
      },

      getMarketLabel: () => {
        const market = get().selectedMarket
        switch (market) {
          case 'CZ':
            return 'Česko'
          case 'SK':
            return 'Slovensko'
          case 'ALL':
            return 'Všechny trhy'
          default:
            return 'Všechny trhy'
        }
      },
    }),
    {
      name: 'market-store',
      partialize: (state) => ({ selectedMarket: state.selectedMarket }),
    }
  )
)

// Helper function pro filtrování podle trhu
export function shouldShowMarket(
  itemMarket: string | undefined,
  selectedMarket: Market
): boolean {
  if (selectedMarket === 'ALL') {
    return true
  }
  return itemMarket === selectedMarket
}
