'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  App, Avatar, Button, Card, Col, Drawer, Empty, Form, Input, InputNumber,
  List, Modal, Popconfirm, Row, Select, Space, Table, Tag, Tooltip, Typography, Upload,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  AppstoreOutlined, DeleteOutlined, EditOutlined, FileExcelOutlined,
  HistoryOutlined, PlusOutlined, ReloadOutlined, SearchOutlined, UploadOutlined,
} from '@ant-design/icons';

const { Text } = Typography;
const { Option } = Select;

/** 统一解析响应：500 空 body 时不再只显示「操作失败」 */
async function readJson(res: Response) {
  const raw = await res.text();
  let data: any = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }
  if (!data) {
    throw new Error(`服务异常（HTTP ${res.status}），请稍后重试或联系管理员查看日志`);
  }
  return data;
}

type ProductRow = {
  id: string;
  code: string;
  name: string;
  barcode?: string;
  imageUrl?: string;
  status: number;
  totalStock?: number;
  unit?: { name?: string };
  category?: { name?: string };
  costMethod?: string;
};

export default function ProductsPage() {
  const { message } = App.useApp();

  const [rows, setRows] = useState<ProductRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [keyword, setKeyword] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | undefined>();
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  const [categories, setCategories] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);

  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  const [warehouseId, setWarehouseId] = useState<string | undefined>();
  const [locationCode, setLocationCode] = useState<string | undefined>();
  const [locations, setLocations] = useState<any[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [fileList, setFileList] = useState<any[]>([]);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<ProductRow | null>(null);
  const [priceHistory, setPriceHistory] = useState<any[]>([]);
  const [priceLoading, setPriceLoading] = useState(false);

  const [categoryModal, setCategoryModal] = useState(false);
  const [unitModal, setUnitModal] = useState(false);
  const [catForm] = Form.useForm();
  const [unitForm] = Form.useForm();

  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (keyword.trim()) params.set('keyword', keyword.trim());
      if (categoryFilter) params.set('categoryId', categoryFilter);
      if (statusFilter !== undefined && statusFilter !== '') params.set('status', statusFilter);
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));

      const res = await fetch(`/api/products?${params}`, { cache: 'no-store' });
      const data = await readJson(res);
      if (data.success) {
        setRows(data.data?.items || []);
        setTotal(data.data?.total || 0);
      } else {
        message.error(data.error || '加载商品列表失败');
      }
    } catch (e: any) {
      message.error(e?.message || '加载商品列表失败');
    } finally {
      setLoading(false);
    }
  }, [keyword, categoryFilter, statusFilter, page, pageSize, message]);

  const loadMeta = useCallback(async () => {
    try {
      const [cats, us, whs] = await Promise.all([
        fetch('/api/products/categories', { cache: 'no-store' }).then(readJson),
        fetch('/api/products/units', { cache: 'no-store' }).then(readJson),
        fetch('/api/warehouse', { cache: 'no-store' }).then(readJson),
      ]);
      if (cats.success) setCategories(cats.data || []);
      if (us.success) setUnits(us.data || []);
      if (whs.success) setWarehouses(whs.data || []);
    } catch (e: any) {
      message.error(e?.message || '基础数据加载失败');
    }
  }, [message]);

  useEffect(() => { loadProducts(); }, [loadProducts]);
  useEffect(() => { loadMeta(); }, [loadMeta]);

  /** 载入仓库下的空货位，供下拉选择（v1.1.1：不再让用户手打编码） */
  const loadLocations = useCallback(async (whId: string) => {
    setLocationsLoading(true);
    try {
      const res = await fetch(`/api/warehouse/locations?warehouseId=${whId}&empty=1&limit=400`, { cache: 'no-store' });
      const data = await readJson(res);
      if (data.success) setLocations(data.data || []);
      else message.error(data.error || '货位加载失败');
    } catch (e: any) {
      message.error(e?.message || '货位加载失败');
    } finally {
      setLocationsLoading(false);
    }
  }, [message]);

  const resetForm = useCallback(() => {
    form.resetFields();
    setEditId(null);
    setWarehouseId(undefined);
    setLocationCode(undefined);
    setLocations([]);
    setImageUrl('');
    setFileList([]);
  }, [form]);

  const openCreate = () => {
    resetForm();
    setFormOpen(true);
  };

  const openEdit = (record: ProductRow) => {
    resetForm();
    setEditId(record.id);
    form.setFieldsValue({
      code: record.code,
      name: record.name,
      barcode: record.barcode || undefined,
      categoryId: (record as any).categoryId || undefined,
      unitId: (record as any).unitId || undefined,
      costMethod: record.costMethod || 'WEIGHTED',
      status: record.status,
      safetyStock: (record as any).safetyStock ?? undefined,
      maxStock: (record as any).maxStock ?? undefined,
      spec: (record as any).spec || undefined,
      brand: (record as any).brand || undefined,
      model: (record as any).model || undefined,
      remark: (record as any).remark || undefined,
      salePrice: (record as any).salePrice ?? undefined,
      defaultCost: (record as any).defaultCost ?? undefined,
    });
    setImageUrl(record.imageUrl || '');
    setFileList(record.imageUrl ? [{ uid: '-1', name: 'cover.png', status: 'done', url: record.imageUrl }] : []);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    // v1.1.1：关闭即清空，避免上次填的仓库/货位/数量残留
    resetForm();
  };

  const submit = async () => {
    let values: any;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }

    if (!editId) {
      if (!warehouseId) { message.warning('请选择所属仓库'); return; }
      if (!locationCode) { message.warning('请选择存放货位'); return; }
      if (!values.initialStock || Number(values.initialStock) <= 0) {
        message.warning('请填写初始库存数量（大于 0）');
        return;
      }
    }

    setSubmitting(true);
    try {
      const body: any = { ...values, imageUrl: imageUrl || null };
      if (editId) body.id = editId;
      else {
        body.warehouseId = Number(warehouseId);
        body.locationCode = locationCode;
        body.initialStock = Number(values.initialStock);
        body.initialCost = Number(values.initialCost || 0);
      }

      const res = await fetch('/api/products', {
        method: editId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await readJson(res);

      if (data.success) {
        message.success(editId ? '商品已更新' : '商品创建成功');
        closeForm();
        loadProducts();
        loadMeta();
      } else {
        // 直接展示后端给出的具体原因
        message.error({ content: data.error || '保存失败', duration: 5 });
      }
    } catch (e: any) {
      message.error({ content: e?.message || '保存失败', duration: 5 });
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (id: string) => {
    try {
      const res = await fetch(`/api/products?id=${id}`, { method: 'DELETE' });
      const data = await readJson(res);
      if (data.success) {
        message.success('已删除');
        loadProducts();
      } else {
        message.error(data.error || '删除失败');
      }
    } catch (e: any) {
      message.error(e?.message || '删除失败');
    }
  };

  const openDetail = async (record: ProductRow) => {
    setDetail(record);
    setDetailOpen(true);
    setPriceLoading(true);
    try {
      const data = await fetch(`/api/products/${record.id}/price-history`, { cache: 'no-store' }).then(readJson);
      setPriceHistory(data.success ? data.data?.records || [] : []);
    } catch {
      setPriceHistory([]);
    } finally {
      setPriceLoading(false);
    }
  };

  const createCategory = async () => {
    try {
      const values = await catForm.validateFields();
      const data = await fetch('/api/products/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      }).then(readJson);
      if (data.success) {
        message.success('分类已创建');
        catForm.resetFields();
        loadMeta();
      } else message.error(data.error || '创建失败');
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.message || '创建失败');
    }
  };

  const createUnit = async () => {
    try {
      const values = await unitForm.validateFields();
      const data = await fetch('/api/products/units', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      }).then(readJson);
      if (data.success) {
        message.success('单位已创建');
        unitForm.resetFields();
        loadMeta();
      } else message.error(data.error || '创建失败');
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.message || '创建失败');
    }
  };

  const columns = useMemo<ColumnsType<ProductRow>>(() => [
    {
      title: '商品',
      key: 'product',
      width: 300,
      render: (_, r) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <Avatar shape="square" size={36} src={r.imageUrl || undefined} style={{ background: '#EFF6FF', color: '#2563EB', flexShrink: 0 }}>
            {(r.name || '?').slice(0, 1)}
          </Avatar>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {r.name}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
              {r.code}
            </div>
          </div>
        </div>
      ),
    },
    {
      title: '分类',
      key: 'category',
      width: 110,
      responsive: ['lg'],
      render: (_, r) => (r.category?.name ? <Tag bordered={false} color="blue">{r.category.name}</Tag> : <Text type="secondary">—</Text>),
    },
    {
      title: '单位',
      key: 'unit',
      width: 70,
      responsive: ['lg'],
      render: (_, r) => r.unit?.name || <Text type="secondary">—</Text>,
    },
    {
      title: '当前库存',
      dataIndex: 'totalStock',
      key: 'totalStock',
      width: 100,
      align: 'right',
      render: (v: number) => <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{Number(v || 0)}</span>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 88,
      render: (s: number) => (s === 1
        ? <Tag bordered={false} color="success">启用</Tag>
        : <Tag bordered={false}>停用</Tag>),
    },
    {
      title: '',
      key: 'action',
      width: 132,
      align: 'right',
      render: (_, r) => (
        <Space size={0}>
          <Tooltip title="详情与价格记录"><Button type="text" size="small" icon={<HistoryOutlined />} onClick={() => openDetail(r)} /></Tooltip>
          <Tooltip title="编辑"><Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} /></Tooltip>
          <Popconfirm title="删除该商品？" description="库存不为 0 时无法删除" okText="删除" cancelText="取消" onConfirm={() => remove(r.id)}>
            <Tooltip title="删除"><Button type="text" size="small" danger icon={<DeleteOutlined />} /></Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ], [loadMeta, loadProducts, message, detail]);

  return (
    <div>
      <div className="yc-page-head">
        <div>
          <h2 className="yc-page-title">商品管理</h2>
          <p className="yc-page-desc">商品主档、条码、计量单位与初始库存建档</p>
        </div>
        <Space wrap>
          <Button icon={<AppstoreOutlined />} onClick={() => setCategoryModal(true)}>分类</Button>
          <Button icon={<AppstoreOutlined />} onClick={() => setUnitModal(true)}>单位</Button>
          <Button icon={<FileExcelOutlined />} onClick={() => (window.location.href = '/products/io')}>导入导出</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建商品</Button>
        </Space>
      </div>

      <Card styles={{ body: { padding: 0 } }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', padding: '14px 16px' }}>
          <Input
            allowClear
            prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
            placeholder="搜索商品名称 / 编码 / 条码"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onPressEnter={() => { setPage(1); loadProducts(); }}
            style={{ width: 260 }}
          />
          <Select
            allowClear
            placeholder="全部分类"
            value={categoryFilter}
            onChange={(v) => { setCategoryFilter(v); setPage(1); }}
            style={{ width: 150 }}
            options={categories.map((c) => ({ value: String(c.id), label: c.name }))}
          />
          <Select
            allowClear
            placeholder="全部状态"
            value={statusFilter}
            onChange={(v) => { setStatusFilter(v); setPage(1); }}
            style={{ width: 120 }}
            options={[{ value: '1', label: '启用' }, { value: '0', label: '停用' }]}
          />
          <Button type="primary" ghost icon={<SearchOutlined />} onClick={() => { setPage(1); loadProducts(); }}>查询</Button>
          <Button icon={<ReloadOutlined />} onClick={() => { setKeyword(''); setCategoryFilter(undefined); setStatusFilter(undefined); setPage(1); }}>重置</Button>
          <div style={{ flex: 1 }} />
          <Text type="secondary" style={{ fontSize: 12 }}>共 {total} 个商品</Text>
        </div>

        <Table<ProductRow>
          rowKey="id"
          columns={columns}
          dataSource={rows}
          loading={loading}
          size="middle"
          scroll={{ x: 820 }}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={<span>还没有商品，先建一个吧</span>}
              >
                <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建商品</Button>
              </Empty>
            ),
          }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            pageSizeOptions: [15, 30, 50],
            showTotal: (t) => `共 ${t} 条`,
            onChange: (p, s) => { setPage(p); setPageSize(s); },
          }}
        />
      </Card>

      {/* 新建 / 编辑 */}
      <Drawer
        title={editId ? '编辑商品' : '新建商品'}
        open={formOpen}
        onClose={closeForm}
        width={640}
        destroyOnClose
        maskClosable={false}
        extra={
          <Space>
            <Button onClick={closeForm}>取消</Button>
            <Button type="primary" loading={submitting} onClick={submit}>保存</Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical" initialValues={{ status: 1, costMethod: 'WEIGHTED' }} preserve={false}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="code" label="商品编码" rules={[{ required: true, message: '请填写商品编码' }]}>
                <Input placeholder="如 SKU-001" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="name" label="商品名称" rules={[{ required: true, message: '请填写商品名称' }]}>
                <Input placeholder="请输入商品名称" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="unitId" label="计量单位" rules={[{ required: true, message: '请选择单位' }]}>
                <Select placeholder="选择单位" showSearch optionFilterProp="label"
                  options={units.map((u) => ({ value: String(u.id), label: u.name }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="categoryId" label="商品分类">
                <Select allowClear placeholder="选择分类"
                  options={categories.map((c) => ({ value: String(c.id), label: c.name }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="barcode" label="条码">
                <Input placeholder="扫码枪可直接扫入" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="costMethod" label="成本方法">
                <Select
                  options={[
                    { value: 'WEIGHTED', label: '移动加权' },
                    { value: 'FIFO', label: '先进先出' },
                    { value: 'MONTHLY', label: '月度加权' },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 12px' }}>
            <div style={{ width: 3, height: 14, borderRadius: 2, background: 'var(--primary)' }} />
            <Text strong style={{ fontSize: 13 }}>库存参数</Text>
          </div>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="safetyStock" label="安全库存">
                <InputNumber style={{ width: '100%' }} min={0} placeholder="低于此值预警" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="maxStock" label="库存上限">
                <InputNumber style={{ width: '100%' }} min={0} placeholder="高于此值预警" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="status" label="状态">
                <Select options={[{ value: 1, label: '启用' }, { value: 0, label: '停用' }]} />
              </Form.Item>
            </Col>
          </Row>

          {!editId && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 12px' }}>
                <div style={{ width: 3, height: 14, borderRadius: 2, background: 'var(--primary)' }} />
                <Text strong style={{ fontSize: 13 }}>初始入库</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>货位编码形如 A-01-01-01（区-排-列-位）</Text>
              </div>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item label="所属仓库" required>
                    <Select
                      placeholder="选择仓库"
                      value={warehouseId}
                      onChange={(v) => { setWarehouseId(v); setLocationCode(undefined); loadLocations(v); }}
                      options={warehouses.map((w) => ({ value: String(w.id), label: w.name }))}
                    />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="存放货位" required>
                    <Select
                      showSearch
                      placeholder={warehouseId ? '选择空货位' : '请先选择仓库'}
                      disabled={!warehouseId}
                      loading={locationsLoading}
                      value={locationCode}
                      onChange={setLocationCode}
                      optionFilterProp="label"
                      options={locations.map((l) => ({
                        value: l.code,
                        label: `${l.code} · ${l.name || ''}`,
                      }))}
                      notFoundContent={locationsLoading ? '加载中…' : '该仓库暂无空货位'}
                    />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="initialStock" label="初始数量" rules={[{ required: !editId, message: '请填写初始数量' }]}>
                    <InputNumber style={{ width: '100%' }} min={0} placeholder="入库数量" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="initialCost" label="初始成本单价">
                    <InputNumber style={{ width: '100%' }} min={0} precision={2} prefix="¥" placeholder="0.00" />
                  </Form.Item>
                </Col>
              </Row>
            </>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 12px' }}>
            <div style={{ width: 3, height: 14, borderRadius: 2, background: 'var(--primary)' }} />
            <Text strong style={{ fontSize: 13 }}>扩展信息</Text>
          </div>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="spec" label="规格"><Input placeholder="如 500ml/瓶" /></Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="brand" label="品牌"><Input placeholder="品牌" /></Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="model" label="型号"><Input placeholder="型号" /></Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="defaultCost" label="默认成本"><InputNumber style={{ width: '100%' }} min={0} precision={2} prefix="¥" /></Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="salePrice" label="销售价"><InputNumber style={{ width: '100%' }} min={0} precision={2} prefix="¥" /></Form.Item>
            </Col>
          </Row>

          <Form.Item label="商品主图">
            <Upload
              name="file"
              action="/api/upload"
              listType="picture-card"
              maxCount={1}
              accept="image/png,image/jpeg,image/webp,image/gif"
              fileList={fileList}
              onChange={({ fileList: list }) => {
                setFileList(list);
                const last = list[list.length - 1];
                if (last?.status === 'done') {
                  const url = (last.response as any)?.url;
                  if (url) { setImageUrl(url); message.success('图片已上传'); }
                  else message.error((last.response as any)?.error || '上传失败');
                } else if (last?.status === 'error') {
                  message.error((last.response as any)?.error || '上传失败');
                }
              }}
              onRemove={() => { setImageUrl(''); setFileList([]); }}
            >
              {fileList.length >= 1 ? null : (
                <div><PlusOutlined /><div style={{ marginTop: 6, fontSize: 12 }}>上传</div></div>
              )}
            </Upload>
          </Form.Item>

          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} placeholder="商品描述、规格说明等" />
          </Form.Item>
        </Form>
      </Drawer>

      {/* 详情 */}
      <Drawer title="商品详情" open={detailOpen} onClose={() => setDetailOpen(false)} width={520}>
        {detail && (
          <>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 18 }}>
              <Avatar shape="square" size={52} src={detail.imageUrl || undefined} style={{ background: '#EFF6FF', color: '#2563EB' }}>
                {(detail.name || '?').slice(0, 1)}
              </Avatar>
              <div>
                <div style={{ fontSize: 16, fontWeight: 650 }}>{detail.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'ui-monospace, monospace' }}>{detail.code}</div>
              </div>
            </div>
            <List
              size="small"
              split={false}
              dataSource={[
                ['分类', detail.category?.name || '—'],
                ['单位', detail.unit?.name || '—'],
                ['条码', detail.barcode || '—'],
                ['当前库存', String(detail.totalStock ?? 0)],
                ['状态', detail.status === 1 ? '启用' : '停用'],
              ]}
              renderItem={(item) => (
                <List.Item style={{ padding: '6px 0' }}>
                  <Text type="secondary" style={{ width: 84 }}>{item[0]}</Text>
                  <Text>{item[1]}</Text>
                </List.Item>
              )}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '16px 0 10px' }}>
              <HistoryOutlined style={{ color: 'var(--primary)' }} />
              <Text strong style={{ fontSize: 13 }}>价格记录</Text>
            </div>
            <Table
              size="small"
              rowKey={(r: any) => r.id}
              loading={priceLoading}
              dataSource={priceHistory}
              pagination={false}
              locale={{ emptyText: '还没有价格记录' }}
              columns={[
                { title: '类型', dataIndex: 'type', width: 70 },
                { title: '单号 / 批次', dataIndex: 'orderNo', ellipsis: true },
                { title: '数量', dataIndex: 'qty', width: 70, align: 'right' },
                { title: '单价', dataIndex: 'price', width: 90, align: 'right', render: (v: number) => `¥${Number(v || 0).toFixed(2)}` },
              ]}
            />
          </>
        )}
      </Drawer>

      {/* 分类管理 */}
      <Modal title="商品分类" open={categoryModal} onCancel={() => setCategoryModal(false)} footer={null} width={560}>
        <Form form={catForm} layout="inline" style={{ marginBottom: 12, rowGap: 8 }}>
          <Form.Item name="name" rules={[{ required: true, message: '名称' }]}><Input placeholder="分类名称" /></Form.Item>
          <Form.Item name="code" rules={[{ required: true, message: '编码' }]}><Input placeholder="编码" /></Form.Item>
          <Form.Item><Button type="primary" onClick={createCategory}>添加</Button></Form.Item>
        </Form>
        <List
          size="small"
          dataSource={categories}
          locale={{ emptyText: '暂无分类' }}
          renderItem={(c: any) => (
            <List.Item
              actions={[
                <Popconfirm key="d" title="删除该分类？" okText="删除" cancelText="取消"
                  onConfirm={async () => {
                    const data = await fetch(`/api/products/categories?id=${c.id}`, { method: 'DELETE' }).then(readJson);
                    if (data.success) { message.success('已删除'); loadMeta(); } else message.error(data.error || '删除失败');
                  }}>
                  <Button type="link" size="small" danger>删除</Button>
                </Popconfirm>,
              ]}
            >
              <Space><Tag bordered={false}>{c.code}</Tag>{c.name}</Space>
            </List.Item>
          )}
        />
      </Modal>

      {/* 单位管理 */}
      <Modal title="计量单位" open={unitModal} onCancel={() => setUnitModal(false)} footer={null} width={520}>
        <Form form={unitForm} layout="inline" style={{ marginBottom: 12, rowGap: 8 }}>
          <Form.Item name="name" rules={[{ required: true, message: '名称' }]}><Input placeholder="单位名称，如 个" /></Form.Item>
          <Form.Item name="code" rules={[{ required: true, message: '编码' }]}><Input placeholder="编码，如 PCS" /></Form.Item>
          <Form.Item><Button type="primary" onClick={createUnit}>添加</Button></Form.Item>
        </Form>
        <List
          size="small"
          dataSource={units}
          locale={{ emptyText: '暂无单位' }}
          renderItem={(u: any) => (
            <List.Item
              actions={[
                <Popconfirm key="d" title="删除该单位？" okText="删除" cancelText="取消"
                  onConfirm={async () => {
                    const data = await fetch(`/api/products/units?id=${u.id}`, { method: 'DELETE' }).then(readJson);
                    if (data.success) { message.success('已删除'); loadMeta(); } else message.error(data.error || '删除失败');
                  }}>
                  <Button type="link" size="small" danger>删除</Button>
                </Popconfirm>,
              ]}
            >
              <Space><Tag bordered={false}>{u.code}</Tag>{u.name}</Space>
            </List.Item>
          )}
        />
      </Modal>
    </div>
  );
}
