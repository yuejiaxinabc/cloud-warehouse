export function serializeBigInt(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'bigint') return obj.toString();
  // Handle Date objects
  if (obj instanceof Date) return obj.toISOString();
  // Handle Prisma Decimal objects {s, e, d}
  if (obj && typeof obj === 'object' && 's' in obj && 'e' in obj && 'd' in obj && Array.isArray(obj.d)) {
    return Number(obj.toString());
  }
  if (Array.isArray(obj)) return obj.map(serializeBigInt);
  if (typeof obj === 'object') {
    const result: any = {};
    for (const key of Object.keys(obj)) {
      result[key] = serializeBigInt(obj[key]);
    }
    return result;
  }
  return obj;
}
