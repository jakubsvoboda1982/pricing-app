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
  if (!priceWithoutVat) {
    return <span className={className}>N/A</span>
  }

  // Vypočítej cenu s DPH
  const vatMultiplier = vatRate ? 1 + vatRate / 100 : 1
  const priceWithVat = parseFloat((priceWithoutVat * vatMultiplier).toFixed(2))
  const vatAmount = parseFloat((priceWithoutVat * (vatRate || 0) / 100).toFixed(2))

  // Třída pro velikost
  const sizeClass =
    size === 'sm'
      ? 'text-sm'
      : size === 'lg'
        ? 'text-lg'
        : 'text-base'

  if (showBreakdown && vatRate && vatRate > 0) {
    return (
      <div className={`${sizeClass} ${className}`}>
        <div className="text-gray-600">
          {priceWithoutVat.toFixed(2)} {currency}
          <span className="text-xs text-gray-500 ml-1">(bez DPH)</span>
        </div>
        <div className="text-gray-600 text-sm">
          + {vatAmount.toFixed(2)} {currency}
          <span className="text-xs text-gray-500 ml-1">(DPH {vatRate}%)</span>
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
      {vatRate && vatRate > 0 ? (
        <span className="text-xs text-gray-500 ml-1">(s DPH)</span>
      ) : (
        <span className="text-xs text-gray-500 ml-1">(bez DPH)</span>
      )}
    </span>
  )
}
