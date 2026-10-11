'use client';

import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Input, Typography, message, InputNumber, Checkbox } from 'antd';
import { PrinterOutlined, SearchOutlined } from '@ant-design/icons';

const { Text } = Typography;

function generateLabelHTML(product: any, index: number): string {
  const barcode = product.barcode || product.code || '';
  const barcodeId = `bc-${product.id}-${index}`;
  return `
    <div style="width:60mm;height:40mm;border:1px dashed #ccc;padding:3mm;display:inline-block;margin:1mm;box-sizing:border-box;vertical-align:top;overflow:hidden;">
      <div style="font-weight:bold;font-size:10pt;margin-bottom:1mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${product.name || '-'}</div>
      <div style="font-size:8pt;color:#666;margin-bottom:2mm;">编码: ${product.code || '-'}</div>
      <div style="text-align:center;margin-bottom:1mm;"><svg id="${barcodeId}"></svg></div>
      <div style="font-size:7pt;color:#999;text-align:center;">${barcode}</div>
    </div>
  `;
}

export default function LabelsPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [selected, setSelected] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [copies, setCopies] = useState(1);
  const [isMobile, setIsMobile] = useState(false);
  const [jsLoaded, setJsLoaded] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // 加载JsBarcode
  useEffect(() => {
    if ((window as any).JsBarcode) { setJsLoaded(true); return; }
    const s = document.createElement('script');
    s.src = '/jsbarcode.min.js';
    s.onload = () => setJsLoaded(true);
    s.onerror = () => message.error('条码库加载失败');
    document.head.appendChild(s);
  }, []);

  // 渲染预览条码
  useEffect(() => {
    if (!jsLoaded || !(window as any).JsBarcode) return;
    setTimeout(() => {
      document.querySelectorAll('svg[id^="preview-bc-"]').forEach((el) => {
        const val = el.getAttribute('data-value');
        if (val) {
          try { (window as any).JsBarcode(el, val, { format: 'CODE128', width: 1.5, height: 30, displayValue: false, margin: 0 }); } catch {}
        }
      });
    }, 100);
  }, [jsLoaded, products, selected]);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (keyword) params.set('keyword', keyword);
      params.set('pageSize', '500');
      const res = await fetch(`/api/products?${params}`);
      const json = await res.json();
      if (json.success) setProducts(json.data?.items || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { loadProducts(); }, [keyword]);

  const handlePrint = () => {
    if (selected.length === 0) { message.warning('请先选择商品'); return; }
    let allLabels = '';
    selected.forEach((p) => {
      for (let i = 0; i < copies; i++) {
        allLabels += generateLabelHTML(p, i);
      }
    });

    const totalLabels = selected.length * copies;
    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>条码标签 - ${new Date().toLocaleDateString('zh-CN')}</title>
<style>
  @page { margin: 10mm; }
  body { font-family: 'SimSun','Microsoft YaHei',sans-serif; margin:0; padding:10mm; background:#fff; }
  .header { text-align:center; margin-bottom:10mm; padding-bottom:5mm; border-bottom:2px solid #333; }
  .header h1 { margin:0; font-size:18pt; }
  .header p { margin:2mm 0 0; font-size:9pt; color:#666; }
  .labels { display:flex; flex-wrap:wrap; gap:2mm; justify-content:flex-start; }
  .footer { margin-top:10mm; padding-top:5mm; border-top:1px solid #ccc; font-size:8pt; color:#999; text-align:center; }
  @media print { body{padding:5mm;} .no-print{display:none;} }
</style>
<script src="/jsbarcode.min.js"><\/script>
</head>
<body>
<div class="header">
  <h1>商品条码标签</h1>
  <p>生成时间: ${new Date().toLocaleString('zh-CN')} | 共 ${selected.length} 种商品 ${totalLabels} 个标签</p>
</div>
<div class="no-print" style="text-align:center;margin-bottom:10mm;">
  <button onclick="window.print()" style="padding:8px 24px;font-size:14px;cursor:pointer;background:#2563EB;color:#fff;border:none;border-radius:6px;">打印标签</button>
  <button onclick="window.close()" style="padding:8px 24px;font-size:14px;cursor:pointer;margin-left:10px;border:1px solid #d9d9d9;border-radius:6px;background:#fff;">关闭</button>
</div>
<div class="labels">${allLabels}</div>
<div class="footer">
  <p>共 ${selected.length} 种商品 | 每种 ${copies} 个标签 | 共 ${totalLabels} 个标签</p>
</div>
<script>
document.querySelectorAll("svg[id^='bc-']").forEach(function(el){
  try{JsBarcode(el, el.id.split("-")[1], {format:"CODE128",width:2,height:40,displayValue:false,margin:0});}catch(e){}
});
<\/script>
</body>
</html>`;

    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); }
  };

  const columns = [
    { title: '商品名称', dataIndex: 'name', key: 'name', ellipsis: true },
    { title: '编码', dataIndex: 'code', key: 'code', width: 100 },
    { title: '条码', dataIndex: 'barcode', key: 'barcode', width: 130, render: (t: string) => t || '-' },
    {
      title: '条码预览', key: 'preview', width: 180,
      render: (_: any, record: any) => {
        const val = record.barcode || record.code || '';
        return val ? <svg id={`preview-bc-${record.id}`} data-value={val} /> : '-';
      },
    },
    {
      title: '操作', key: 'action', width: 80,
      render: (_: any, record: any) => (
        <Checkbox
          checked={selected.some((s) => s.id === record.id)}
          onChange={(e) => {
            if (e.target.checked) setSelected([...selected, record]);
            else setSelected(selected.filter((s) => s.id !== record.id));
          }}
        />
      ),
    },
  ];

  return (
    <div style={{ padding: isMobile ? 12 : 24 }}>
      <h4 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 600, color: '#0F172A', whiteSpace: 'nowrap' }}>条码打印</h4>
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <Input
            placeholder="搜索商品名称/SKU/条码"
            prefix={<SearchOutlined />}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            style={{ width: isMobile ? '100%' : 300 }}
            allowClear
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Text>每种打印</Text>
            <InputNumber min={1} max={99} value={copies} onChange={(v) => setCopies(v || 1)} style={{ width: 60 }} />
            <Text>份</Text>
          </div>
          <Button onClick={() => setSelected(selected.length === products.length ? [] : [...products])}>
            {selected.length === products.length ? '取消全选' : '全选'}
          </Button>
          <Button type="primary" icon={<PrinterOutlined />} onClick={handlePrint} disabled={selected.length === 0}>
            打印 ({selected.length})
          </Button>
        </div>
      </Card>
      <Card>
        <Table
          dataSource={products}
          columns={columns}
          rowKey="id"
          loading={loading}
          size="small"
          pagination={{ pageSize: 20 }}
          scroll={{ x: 600 }}
          rowSelection={{
            selectedRowKeys: selected.map((s) => s.id),
            onChange: (keys) => setSelected(products.filter((p) => keys.includes(p.id))),
          }}
        />
      </Card>
    </div>
  );
}
