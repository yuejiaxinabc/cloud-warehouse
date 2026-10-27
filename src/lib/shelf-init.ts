/**
 * 货架初始化（FIX-2026-1014）
 *
 * 原来新建仓库只建到「A-M 13 个货架」，且货位编码是不补零的三段 A-1-1，
 * 与四段规则冲突。现在统一为：
 *   - 每个仓库固定 26 个货架 A-Z
 *   - 每个货架 10 列 × 10 位 = 100 个货位（默认 1 排）
 *   - 货位编码四段补零：区-排-列-位，如 A-01-03-07
 * 幂等：已存在的货架/货位不会重复创建。
 */

export const SHELF_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export type ShelfOptions = {
  aisles?: number;   // 排数，默认 1
  cols?: number;     // 列数，默认 10
  layers?: number;   // 层数，默认 10
  withBoxes?: boolean;
};

export function locationCode(letter: string, aisle: number, col: number, layer: number): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${letter}-${p(aisle)}-${p(col)}-${p(layer)}`;
}

/**
 * 确保某仓库拥有完整的 26 货架 + 货位。
 * 返回本次实际创建的数量，便于回报。
 */
export async function ensureShelves(
  tx: any,
  warehouseId: bigint,
  options: ShelfOptions = {}
): Promise<{ zonesCreated: number; locationsCreated: number }> {
  const aisles = options.aisles ?? 1;
  const cols = options.cols ?? 10;
  const layers = options.layers ?? 10;

  let zonesCreated = 0;
  let locationsCreated = 0;

  for (const letter of SHELF_LETTERS) {
    let zone = await tx.zone.findFirst({
      where: { warehouseId, code: letter },
      select: { id: true },
    });

    if (!zone) {
      zone = await tx.zone.create({
        data: {
          name: `${letter}货架`,
          code: letter,
          warehouseId,
          type: 'storage',
          status: 1,
        },
        select: { id: true },
      });
      zonesCreated++;
    }

    const existing = await tx.location.findMany({
      where: { zoneId: zone.id },
      select: { code: true },
    });
    const have = new Set<string>(existing.map((l: any) => l.code));

    const toCreate: any[] = [];
    for (let a = 1; a <= aisles; a++) {
      for (let c = 1; c <= cols; c++) {
        for (let l = 1; l <= layers; l++) {
          const code = locationCode(letter, a, c, l);
          if (have.has(code)) continue;
          toCreate.push({
            name: `${letter}区${c}列${l}位`,
            code,
            zoneId: zone.id,
            type: 'shelf',
            capacity: 10,
            status: 1,
          });
        }
      }
    }

    // 分批写入，避免单次 createMany 过大
    for (let i = 0; i < toCreate.length; i += 500) {
      const chunk = toCreate.slice(i, i + 500);
      await tx.location.createMany({ data: chunk, skipDuplicates: true });
      locationsCreated += chunk.length;
    }
  }

  return { zonesCreated, locationsCreated };
}