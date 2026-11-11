/**
 * 字典中心种子（v1.2.3）
 *
 * 用法：
 *   npx ts-node --compiler-options {"module":"CommonJS"} prisma/seed-dicts.ts
 *
 * 说明：
 *   1) 写入 5 个系统内置字典（isSystem=true），页面里不允许删除；
 *   2) 全部使用 upsert，重复执行幂等：已存在的类型/字典项只做覆盖更新，不会重复插入；
 *   3) 只覆盖 label/sort/status/isDefault/remark，不动用户自建的其它字典与字典项。
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type DictItemSeed = {
  value: string;
  label: string;
  sort: number;
  isDefault?: boolean;
  remark?: string;
};

type DictSeed = {
  code: string;
  name: string;
  remark: string;
  items: DictItemSeed[];
};

const DICTS: DictSeed[] = [
  {
    code: "stock_in_type",
    name: "入库类型",
    remark: "入库单的来货类型，决定成本与对账口径",
    items: [
      { value: "PURCHASE", label: "采购入库", sort: 10 },
      { value: "RETURN", label: "退货入库", sort: 20 },
      { value: "PRODUCTION", label: "生产入库", sort: 30 },
      { value: "OTHER", label: "其他入库", sort: 90 },
    ],
  },
  {
    code: "stock_out_type",
    name: "出库类型",
    remark: "出库单的发货类型，影响出库审核链路",
    items: [
      { value: "SALE", label: "销售出库", sort: 10 },
      { value: "PICK", label: "领用出库", sort: 20 },
      { value: "TRANSFER", label: "调拨出库", sort: 30 },
      { value: "OTHER", label: "其他出库", sort: 90 },
    ],
  },
  {
    code: "order_status",
    name: "单据状态",
    remark: "出入库单据的通用状态流转",
    items: [
      { value: "DRAFT", label: "草稿", sort: 10 },
      { value: "POSTED", label: "已过账", sort: 20 },
      { value: "CANCELLED", label: "已取消", sort: 90 },
    ],
  },
  {
    code: "stocktake_status",
    name: "盘点状态",
    remark: "盘点单状态：草稿 → 盘点中 → 已结算",
    items: [
      { value: "DRAFT", label: "草稿", sort: 10 },
      { value: "COUNTING", label: "盘点中", sort: 20 },
      { value: "SETTLED", label: "已结算", sort: 30 },
      { value: "CANCELLED", label: "已取消", sort: 90 },
    ],
  },
  {
    code: "transfer_status",
    name: "调拨状态",
    remark: "调拨单状态：草稿 → 已审核 → 已完成",
    items: [
      { value: "DRAFT", label: "草稿", sort: 10 },
      { value: "APPROVED", label: "已审核", sort: 20 },
      { value: "COMPLETED", label: "已完成", sort: 30 },
      { value: "CANCELLED", label: "已取消", sort: 90 },
    ],
  },
];

async function main() {
  let typeCount = 0;
  let itemCount = 0;

  for (const dict of DICTS) {
    await prisma.dictType.upsert({
      where: { code: dict.code },
      update: {
        name: dict.name,
        status: 1,
        isSystem: true,
        remark: dict.remark,
      },
      create: {
        code: dict.code,
        name: dict.name,
        status: 1,
        isSystem: true,
        remark: dict.remark,
      },
    });
    typeCount += 1;

    for (const item of dict.items) {
      await prisma.dictData.upsert({
        where: { typeCode_value: { typeCode: dict.code, value: item.value } },
        update: {
          label: item.label,
          sort: item.sort,
          status: 1,
          isDefault: item.isDefault ?? false,
          remark: item.remark ?? null,
        },
        create: {
          typeCode: dict.code,
          label: item.label,
          value: item.value,
          sort: item.sort,
          status: 1,
          isDefault: item.isDefault ?? false,
          remark: item.remark ?? null,
        },
      });
      itemCount += 1;
    }

    console.log(`[dict] ${dict.code} ${dict.name}：${dict.items.length} 项已就绪`);
  }

  console.log(`[dict] 完成：字典类型 ${typeCount} 个，字典项 ${itemCount} 条（幂等）`);
}

main()
  .catch((error) => {
    console.error("[dict] 字典种子写入失败：", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
