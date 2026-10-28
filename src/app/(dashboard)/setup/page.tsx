'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { App, Button, Card, Col, Empty, Progress, Row, Space, Table, Tag, Typography } from 'antd';
import {
  CheckCircleFilled, CloseCircleFilled, ReloadOutlined, RocketOutlined, RightOutlined,
} from '@ant-design/icons';
import { LogoMark } from '@/components/brand/Logo';

const { Text } = Typography;

async function readJson(res: Response) {
  const raw = await res.text();
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}

/** 初始化向导（v1.3）：新环境装完就告诉用户「还差什么、点哪里」 */
export default function SetupPage() {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState<any>({
    units: 0, categories: 0, warehouses: 0, locations: 0, products: 0,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [units, categories, warehouses, products] = await Promise.all([
        fetch('/api/products/units', { cache: 'no-store' }).then(readJson).catch(() => null),
        fetch('/api/products/categories', { cache: 'no-store' }).then(readJson).catch(() => null),
        fetch('/api/warehouse', { cache: 'no-store' }).then(readJson).catch(() => null),
        fetch('/api/products?page=1&pageSize=1', { cache: 'no-store' }).then(readJson).catch(() => null),
      ]);
      const whList = warehouses?.success ? warehouses.data || [] : [];
      setState({
        units: units?.success ? (units.data || []).length : 0,
        categories: categories?.success ? (categories.data || []).length : 0,
        warehouses: whList.length,
        locations: whList.reduce((s: number, w: any) => s + Number(w.locationCount || 0), 0),
        products: products?.success ? Number(products.data?.total || 0) : 0,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const steps = [
    {
      key: 'units',
      title: '配置计量单位',
      desc: '系统已预置「个 / 件 / 箱 / 千克…」等 10 个常用单位，可在此基础上增删',
      done: state.units > 0,
      detail: `已有 ${state.units} 个单位`,
      href: '/products',
      action: '去商品管理',
    },
    {
      key: 'categories',
      title: '规划商品分类',
      desc: '已预置电子元件 / 五金配件 / 包装材料等 6 类，可按业务调整',
      done: state.categories > 0,
      detail: `已有 ${state.categories} 个分类`,
      href: '/products',
      action: '去商品管理',
    },
    {
      key: 'warehouse',
      title: '建第一个仓库',
      desc: '新建仓库会自动生成 A–Z 26 个货架、每架 100 个货位（四段编码 A-01-01-01）',
      done: state.warehouses > 0,
      detail: state.warehouses > 0 ? `${state.warehouses} 个仓库 / ${state.locations} 个货位` : '还没有仓库',
      href: '/warehouse',
      action: '去建仓库',
    },
    {
      key: 'products',
      title: '商品建档',
      desc: '手工新建，或用 Excel 模板批量导入（模板会按有没有仓库自动增减列）',
      done: state.products > 0,
      detail: state.products > 0 ? `已有 ${state.products} 个商品` : '还没有商品',
      href: '/products/io',
      action: '批量导入',
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  const percent = Math.round((doneCount / steps.length) * 100);

  return (
    <div>
      <div className="yc-page-head">
        <div>
          <h2 className="yc-page-title">初始化向导</h2>
          <p className="yc-page-desc">四步把系统跑起来：单位 → 分类 → 仓库 → 商品</p>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} loading={loading} onClick={load}>重新检测</Button>
          <Button type="primary" icon={<RocketOutlined />} onClick={() => (window.location.href = '/')}>回车台</Button>
        </Space>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <LogoMark size={48} />
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
              {percent === 100 ? '环境已就绪，可以开始使用了' : `完成度 ${percent}%（${doneCount}/${steps.length}）`}
            </div>
            <Progress percent={percent} showInfo={false} strokeColor="#2563EB" />
          </div>
        </div>
      </Card>

      <Row gutter={[16, 16]}>
        {steps.map((s, i) => (
          <Col xs={24} lg={12} key={s.key}>
            <Card>
              <div style={{ display: 'flex', gap: 14 }}>
                <div style={{ fontSize: 22, lineHeight: '28px' }}>
                  {s.done ? <CheckCircleFilled style={{ color: '#16A34A' }} /> : <CloseCircleFilled style={{ color: '#CBD5E1' }} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Space size={8}>
                    <Text strong>{i + 1}. {s.title}</Text>
                    <Tag bordered={false} color={s.done ? 'success' : 'default'}>{s.done ? '已完成' : '待完成'}</Tag>
                  </Space>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '6px 0 10px' }}>{s.desc}</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>{s.detail}</Text>
                    <Link href={s.href}>
                      <Button type="link" size="small">{s.action} <RightOutlined /></Button>
                    </Link>
                  </div>
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      <Card title="常用模板一键导入" style={{ marginTop: 16 }}>
        <Table
          size="small"
          pagination={false}
          rowKey="key"
          dataSource={[
            { key: 'units', name: '计量单位模板', desc: '个 / 件 / 箱 / 套 / 千克 / 克 / 米 / 卷 / 瓶 / 袋', action: '已随初始化写入，无需导入' },
            { key: 'categories', name: '商品分类模板', desc: '电子元件 / 五金配件 / 包装材料 / 办公用品 / 劳保用品 / 原材料', action: '已随初始化写入，无需导入' },
            { key: 'products', name: '商品导入模板', desc: '按「有无仓库」动态生成列，含仓库与货位编码', action: '去「商品导入导出」下载' },
          ]}
          columns={[
            { title: '模板', dataIndex: 'name', width: 160 },
            { title: '内容', dataIndex: 'desc' },
            { title: '', dataIndex: 'action', width: 240, render: (v: string) => <Text type="secondary" style={{ fontSize: 12 }}>{v}</Text> },
          ]}
        />
        <div style={{ marginTop: 12 }}>
          <Link href="/products/io"><Button type="primary" ghost>打开商品导入导出</Button></Link>
        </div>
      </Card>
    </div>
  );
}
