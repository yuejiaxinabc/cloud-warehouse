'use client';

import React from 'react';
import { Table } from 'antd';
import type { TableProps } from 'antd';

interface DataTableProps<T> extends Omit<TableProps<T>, 'pagination'> {
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
  ...rest
}: DataTableProps<T>) {
  /** 序号列 */
  const indexColumn = showIndex
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

  return (
    <Table<T>
      columns={[...indexColumn, ...(columns || [])]}
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
      scroll={{ x: 'max-content' }}
      {...rest}
    />
  );
}

export default DataTable;
