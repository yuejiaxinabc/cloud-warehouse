'use client';

import React from 'react';
import { Table } from 'antd';
import type { TableProps } from 'antd';
import { TableSkeleton } from './LoadingSkeleton';
import { EmptyState } from './EmptyState';

type BaseColumn<T extends object> = NonNullable<TableProps<T>['columns']>[number];

/**
 * 扩展列：hideOnMobile 的列在 <768px 时隐藏（关键列优先），
 * 其余列保留横滑查看。底层用 Antd 原生 `responsive` 实现，不改表格行为。
 */
export type DataTableColumn<T extends object> = BaseColumn<T> & {
  hideOnMobile?: boolean;
};

interface DataTableProps<T extends object> extends Omit<TableProps<T>, 'pagination' | 'columns'> {
  columns?: DataTableColumn<T>[];
  /** 当前页 */
  current?: number;
  /** 每页条数 */
  pageSize?: number;
  /** 总数 */
  total?: number;
  /** 页码变化回调 */
  onPageChange?: (page: number, pageSize: number) => void;
  /** 是否显示序号列 */
  showIndex?: boolean;
}

/** 封装 Ant Design Table，支持斑马纹、分页、排序、筛选 */
function DataTable<T extends object>({
  current = 1,
  pageSize = 20,
  total = 0,
  onPageChange,
  showIndex = false,
  columns,
  loading,
  dataSource,
  ...rest
}: DataTableProps<T>) {
  const data = dataSource ?? [];
  const isLoading = Boolean(loading);

  /** 序号列 */
  const indexColumn: DataTableColumn<T>[] = showIndex
    ? [
        {
          title: '序号',
          key: 'index',
          width: 60,
          render: (_: unknown, __: unknown, index: number) =>
            (current - 1) * pageSize + index + 1,
        },
      ]
    : [];

  // hideOnMobile -> Antd 原生 responsive: ['md']（仅 ≥768px 显示），并剥掉自定义字段
  const mergedColumns: BaseColumn<T>[] = [...indexColumn, ...(columns || [])].map((col) => {
    const { hideOnMobile, ...restCol } = col as DataTableColumn<T> & Record<string, unknown>;
    return hideOnMobile
      ? ({ ...restCol, responsive: ['md'] } as BaseColumn<T>)
      : (restCol as BaseColumn<T>);
  });

  // 要求 4：加载时一律骨架屏，禁止先闪“暂无数据”或 0 / 共 0 条。
  // 注意：loading 可能是 boolean 或 SpinProps，Boolean() 已在上面归一化。
  if (isLoading) {
    return (
      <div className="yc-table-wrap">
        <TableSkeleton rows={5} columns={Math.min(Math.max(mergedColumns.length, 3), 6)} />
      </div>
    );
  }

  return (
    <div className={data.length === 0 ? 'yc-table-wrap yc-table-wrap--empty' : 'yc-table-wrap'}>
      <Table<T>
        columns={mergedColumns}
        dataSource={data}
        rowKey={(record, index) => {
          const idKey = 'id' in record ? (record as Record<string, unknown>).id : undefined;
          return idKey !== undefined ? String(idKey) : String(index);
        }}
        pagination={{
          current,
          pageSize,
          total,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (t) => `共 ${t} 条`,
          onChange: onPageChange,
          pageSizeOptions: ['10', '20', '50', '100'],
        }}
        size="middle"
        {...rest}
        // 要求 4：空表不设横向滚动，避免多余滚动条；有数据时才横滑
        scroll={data.length > 0 ? { x: 'max-content' } : undefined}
        locale={{ emptyText: <EmptyState description="暂无数据" /> }}
      />
    </div>
  );
}

export default DataTable;
