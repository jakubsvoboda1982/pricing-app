import React from 'react'

interface PriceDisplayProps {
  priceWithoutVat: number | null | undefined
  vatRate?: number | null
  currency?: string
  showBreakdown?: boolean
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

export default function PriceDisplay({
  priceWithoutVat,
  vatRate,
  currency = 'Kč',
  showBreakdown = false,
  className = '',
  size = 'md',
}: PriceDisplayProps) {
  // Převeď na number (API může vracet string z Decimal/Numeric sloupce)
  const price = priceWithoutVat != null ? Number(priceWithoutVat) : null
  const vat = vatRate != null ? Number(vatRate) : null

  if (!price || isNaN(price)) {
    return <span className={className}>N/A</span>
  }

  // Vypočítej cenu s DPH
  const vatMultiplier = vat ? 1 + vat / 100 : 1
  const priceWithVat = parseFloat((price * vatMultiplier).toFixed(2))
  const vatAmount = parseFloat((price * (vat || 0) / 100).toFixed(2))

  // Třída pro velikost
  const sizeClass =
    size === 'sm'
      ? 'text-sm'
      : size === 'lg'
        ? 'text-lg'
        : 'text-base'

  if (showBreakdown && vat && vat > 0) {
    return (
      <div className={`${sizeClass} ${className}`}>
        <div className="text-gray-600">
          {price.toFixed(2)} {currency}
          <span className="text-xs text-gray-500 ml-1">(bez DPH)</span>
        </div>
        <div className="text-gray-600 text-sm">
          + {vatAmount.toFixed(2)} {currency}
          <span className="text-xs text-gray-500 ml-1">(DPH {vat}%)</span>
        </div>
        <div className="font-semibold text-gray-900 border-t border-gray-200 pt-1">
          = {priceWithVat.toFixed(2)} {currency}
          <span className="text-xs text-gray-500 ml-1">(s DPH)</span>
        </div>
      </div>
    )
  }

  // Jednoduché zobrazení
  return (
    <span className={`${sizeClass} font-semibold ${className}`}>
      {priceWithVat.toFixed(2)} {currency}
      {vat && vat > 0 ? (
        <span className="text-xs text-gray-500 ml-1">(s DPH)</span>
      ) : (
        <span className="text-xs text-gray-500 ml-1">(bez DPH)</span>
      )}
    </span>
  )
}
