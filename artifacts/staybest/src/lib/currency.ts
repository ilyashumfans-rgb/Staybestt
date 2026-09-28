export function formatMinorINR(amountMinor: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

export function parseINRToMinor(rupees: number | string): number {
  const num = typeof rupees === 'string' ? parseFloat(rupees) : rupees;
  if (isNaN(num)) return 0;
  return Math.round(num * 100);
}

export function formatBpsToPercent(bps: number): string {
  return (bps / 100).toString() + '%';
}

export function parsePercentToBps(percent: number | string): number {
  const num = typeof percent === 'string' ? parseFloat(percent) : percent;
  if (isNaN(num)) return 0;
  return Math.round(num * 100);
}
