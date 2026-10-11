'use client';

import React, { useRef } from 'react';
import { Button, Modal } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';

interface LabelData {
  /** SKU编码 */
  sku: string;
  /** 商品名称 */
  name: string;
  /** 批次号 */
  batchNo?: string;
  /** 条形码 */
  barcode?: string;
  /** 库位 */
  location?: string;
  /** 数量 */
  quantity?: number;
  /** 生产日期 */
  productionDate?: string;
  /** 有效期 */
  expiryDate?: string;
}

interface PrintLabelProps {
  open: boolean;
  data: LabelData;
  onClose: () => void;
}

/** 标签打印组件 */
const PrintLabel: React.FC<PrintLabelProps> = ({ open, data, onClose }) => {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (printWindow && printRef.current) {
      printWindow.document.write(`
        <html>
          <head>
            <title>标签打印</title>
            <style>
              @page { size: 100mm 60mm; margin: 2mm; }
              body { font-family: 'Microsoft YaHei', sans-serif; margin: 0; padding: 0; }
              .label {
                width: 96mm;
                height: 56mm;
                border: 1px solid #ccc;
                padding: 3mm;
                box-sizing: border-box;
              }
              .label-title {
                font-size: 14px;
                font-weight: bold;
                margin-bottom: 2mm;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
              }
              .label-info {
                font-size: 11px;
                line-height: 1.6;
                color: #333;
              }
              .barcode {
                text-align: center;
                margin-top: 2mm;
                font-size: 12px;
                font-family: monospace;
                letter-spacing: 2px;
              }
            </style>
          </head>
          <body>
            <div class="label">
              <div class="label-title">${data.name}</div>
              <div class="label-info">
                <div>SKU: ${data.sku}</div>
                ${data.batchNo ? `<div>批次: ${data.batchNo}</div>` : ''}
                ${data.location ? `<div>库位: ${data.location}</div>` : ''}
                ${data.quantity !== undefined ? `<div>数量: ${data.quantity}</div>` : ''}
                ${data.productionDate ? `<div>生产日期: ${data.productionDate}</div>` : ''}
                ${data.expiryDate ? `<div>有效期: ${data.expiryDate}</div>` : ''}
              </div>
              ${data.barcode ? `<div class="barcode">${data.barcode}</div>` : ''}
            </div>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    }
  };

  return (
    <Modal
      title="标签打印预览"
      open={open}
      onCancel={onClose}
      width={400}
      footer={[
        <Button key="cancel" onClick={onClose}>
          取消
        </Button>,
        <Button
          key="print"
          type="primary"
          icon={<PrinterOutlined />}
          onClick={handlePrint}
        >
          打印
        </Button>,
      ]}
    >
      <div
        ref={printRef}
        style={{
          border: '1px solid #E8ECEF',
          borderRadius: 4,
          padding: 16,
          fontFamily: "'Microsoft YaHei', sans-serif",
        }}
      >
        <div
          style={{
            fontSize: 16,
            fontWeight: 'bold',
            marginBottom: 12,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {data.name}
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.8, color: '#333' }}>
          <div>SKU: {data.sku}</div>
          {data.batchNo && <div>批次: {data.batchNo}</div>}
          {data.location && <div>库位: {data.location}</div>}
          {data.quantity !== undefined && <div>数量: {data.quantity}</div>}
          {data.productionDate && <div>生产日期: {data.productionDate}</div>}
          {data.expiryDate && <div>有效期: {data.expiryDate}</div>}
        </div>
        {data.barcode && (
          <div
            style={{
              textAlign: 'center',
              marginTop: 12,
              fontSize: 14,
              fontFamily: 'monospace',
              letterSpacing: 2,
            }}
          >
            {data.barcode}
          </div>
        )}
      </div>
    </Modal>
  );
};

export default PrintLabel;
