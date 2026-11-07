// Phase 7: Static Pricing Catalog (avoids $0.01/request AWS Cost Explorer fees)
export const AWS_STATIC_PRICING_USD_MONTHLY: Record<string, number> = {
  't3.micro': 7.59,
  't3.small': 15.18,
  't3.medium': 30.37,
  't3.large': 60.74,
  'm5.large': 70.08,
  'c6i.large': 62.05,
  'gp3_per_gb': 0.08,
  'gp2_per_gb': 0.10,
  'public_ipv4': 3.65,
};

export function estimateEc2MonthlyCost(instanceType: string, hasPublicIp = true): number {
  const base = AWS_STATIC_PRICING_USD_MONTHLY[instanceType] ?? 20.0;
  return Number((base + (hasPublicIp ? AWS_STATIC_PRICING_USD_MONTHLY.public_ipv4 : 0)).toFixed(2));
}

export function estimateEbsMonthlyCost(volumeType: string, sizeGb: number): number {
  const rate = volumeType === 'gp2' ? AWS_STATIC_PRICING_USD_MONTHLY.gp2_per_gb : AWS_STATIC_PRICING_USD_MONTHLY.gp3_per_gb;
  return Number((rate * sizeGb).toFixed(2));
}
