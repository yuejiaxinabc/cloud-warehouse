'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, Select, Button, Space, Typography, Tag, Tooltip, Modal, Descriptions, Spin, Empty, Badge, message, Progress } from 'antd';
import { 
  AppstoreOutlined, EnvironmentOutlined, InboxOutlined, 
  ZoomInOutlined, ZoomOutOutlined, InfoCircleOutlined, ShopOutlined,
  BoxPlotOutlined, StopOutlined
} from '@ant-design/icons';

const { Title, Text } = Typography;
const { Option } = Select;

// 颜色映射 - 根据货位占用数
const getColorByBoxes = (usedBoxes: number): string => {
  if (usedBoxes === 0) return '#f0f0f0'; // 空
  if (usedBoxes <= 3) return '#d4edda'; // 1-3个货位 - 浅绿
  if (usedBoxes <= 6) return '#fff3cd'; // 4-6个货位 - 浅黄
  if (usedBoxes <= 8) return '#ffe0b2'; // 7-8个货位 - 浅橙
  return '#f8d7da'; // 9-10个货位 - 浅红
};

const getStatusByBoxes = (usedBoxes: number) => {
  if (usedBoxes === 0) return <Tag color="default">空置</Tag>;
  if (usedBoxes <= 3) return <Tag color="green">低占用</Tag>;
  if (usedBoxes <= 6) return <Tag color="gold">中占用</Tag>;
  if (usedBoxes <= 8) return <Tag color="orange">高占用</Tag>;
  return <Tag color="red">已满</Tag>;
};

interface BoxData {
  boxCode: string; // 如 A-1-1-1
  locationCode: string; // 如 A-1-1
  productName?: string;
  productCode?: string;
  quantity?: number;
  lotNumber?: string;
  occupied: boolean;
  deactivated?: boolean; // 已停用
}

interface LocationData {
  id?: string;
  code: string; // 如 A-1-1
  name: string;
  zoneCode: string;
  boxes: BoxData[]; // 10个货位
  usedBoxes: number;
  status?: number; // 1-启用 0-停用
  deactivatedBoxes?: { id: string; code: string }[];
}

interface ZoneData {
  id: string;
  name: string;
  code: string;
  locationCount: number;
}

export default function ShelfMapPage() {
  const [warehouses, setWarehouses] = useState<any[]>([]);
  /**
   * 解析货位编码（FIX-2026-1013）
   *
   * 之前网格是靠「拼字符串」反查的：`${zone}-${col}-${row}` → A-1-1，
   * 而真实编码是四位补零的 A-01-01-01，永远匹配不上，
   * 于是「有货: 1/2 位」但格子全空。
   * 改为解析编码取 区/排/列/位，正向落位。
   */
  const parseLocationCode = (code: string): { zone: string; aisle: string | null; col: number; layer: number } | null => {
    const parts = String(code || '').split('-').map((s) => s.trim()).filter(Boolean);
    if (parts.length < 3) return null;
    const zone = parts[0];
    if (parts.length >= 4) {
      return { zone, aisle: parts[1], col: Number(parts[2]), layer: Number(parts[3]) };
    }
    // 三段旧格式：区-列-位
    return { zone, aisle: null, col: Number(parts[1]), layer: Number(parts[2]) };
  };

  const [selectedWarehouse, setSelectedWarehouse] = useState<number | null>(null);
  const [selectedAisle, setSelectedAisle] = useState<string>('');
  const [selectedZone, setSelectedZone] = useState<string>('');
  const [zones, setZones] = useState<ZoneData[]>([]);
  const [locations, setLocations] = useState<LocationData[]>([]);
  const [loading, setLoading] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<LocationData | null>(null);
  const [locationBoxes, setLocationBoxes] = useState<{ id: string; code: string; status: number; remark?: string | null }[]>([]);
  const [viewMode, setViewMode] = useState<'shelf' | 'overview'>('shelf');
  const [isMobile, setIsMobile] = useState(false);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // 加载仓库列表
  useEffect(() => {
    const loadWarehouses = async () => {
      try {
        const res = await fetch('/api/warehouse');
        const data = await res.json();
        if (data.success) {
          setWarehouses(data.data || []);
          if (data.data?.length > 0 && !selectedWarehouse) {
            setSelectedWarehouse(data.data[0].id);
          }
        }
      } catch (e) {
        console.error(e);
      }
    };
    loadWarehouses();
  }, []);

  // 加载库位数据
  useEffect(() => {
    if (!selectedWarehouse) return;
    // 切换仓库时先清空，避免拿上一个仓库的 A/B/C 去匹配新仓库的货架
    setSelectedZone('');
    setSelectedAisle('');
    setZones([]);
    loadLocationData();
  }, [selectedWarehouse]);

  const loadLocationData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/shelf-map?warehouseId=${selectedWarehouse}`, { cache: 'no-store' });
      const data = await res.json();
      if (data.success) {
        const locs = data.data || [];
        
        // 按货位分组，生成货位数据
        const locationMap: Record<string, LocationData> = {};
        
        locs.forEach((loc: any) => {
          const code = loc.code; // 如 A-1-1
          if (!locationMap[code]) {
            locationMap[code] = {
              id: loc.id,
              code,
              name: loc.name || code,
              zoneCode: loc.zoneCode || code.split('-')[0],
              boxes: [],
              usedBoxes: 0,
              status: loc.status,
              deactivatedBoxes: loc.deactivatedBoxes || [],
            };
          }
          
          // 如果有库存明细，每个商品/批次一个货位
          if (loc.items && loc.items.length > 0) {
            loc.items.forEach((it: any) => {
              locationMap[code].boxes.push({
                // FIX-2026-1017：不再给货位编码追加 -1/-2 序号。
                // 货位编码本身就是 货架-列-行-货位 四段（如 A-01-02-03），
                // 追加序号会变成五段，既不符合规则也看不出是什么货。
                boxCode: it.productCode || it.productName || '未知',
                locationCode: code,
                productName: it.productName,
                productCode: it.productCode,
                quantity: it.quantity,
                lotNumber: it.lotNumber,
                occupied: true,
              });
            });
            locationMap[code].usedBoxes = locationMap[code].boxes.length;
          } else if (loc.quantity > 0) {
            // 兼容旧数据：只有汇总数量
            locationMap[code].usedBoxes++;
            locationMap[code].boxes.push({
              boxCode: loc.productCode || loc.productName || '未知',
              locationCode: code,
              productName: loc.productName,
              productCode: loc.productCode,
              quantity: loc.quantity,
              occupied: true,
            });
          }
        });
        
        // 补全空货位（每个货位10个货位）
        // FIX-2026-1017：一个货位就是一条 Location，不再人为补 10 个「小货位」。
        // 货位里有什么货就列什么货，空就是空。
        
        setLocations(Object.values(locationMap));

        // FIX-2026-1014：区域列表直接用 shelf-map 接口自带的 zones，
        // 不再二次请求 /api/warehouse（少一次请求，也少一个失败点 ——
        // 之前那次请求一旦出错，整个货架视图就停在「暂无货架数据」）。
        const zoneList: ZoneData[] = (data.zones || []).map((z: any) => ({
          id: z.id,
          name: z.name,
          code: z.code,
          locationCount: z.locationCount ?? 0,
        }));

        setZones(zoneList);
        if (zoneList.length > 0) {
          setSelectedZone((prev) => (prev && zoneList.some(z => z.code === prev) ? prev : zoneList[0].code));
        }
      }
    } catch (e) {
      console.error(e);
      message.error('加载库位数据失败');
    } finally {
      setLoading(false);
    }
  };

  // 该区域下存在的「排」，用于多排货架切换
  const aisles = useMemo(() => {
    const set = new Set<string>();
    for (const loc of locations) {
      const p = parseLocationCode(loc.code);
      if (p && p.zone === selectedZone && p.aisle) set.add(p.aisle);
    }
    return Array.from(set).sort();
  }, [locations, selectedZone]);

  // 旧三段编码没有「排」的概念，用 __none__ 归组
  const effectiveAisle = aisles.length === 0
    ? '__none__'
    : (aisles.includes(selectedAisle) ? selectedAisle : aisles[0]);

  // 当前选中区域的货位矩阵（按 排 + 列 + 位 正确定位）
  const zoneMatrix = useMemo(() => {
    const COLS = 10;
    const ROWS = 10;

    const byPos = new Map<string, LocationData>();
    for (const loc of locations) {
      const p = parseLocationCode(loc.code);
      if (!p || p.zone !== selectedZone) continue;
      if ((p.aisle ?? '__none__') !== effectiveAisle) continue;
      // FIX-2026-1018：编码是 货架-列-行-货位。
      // 网格纵向放「行」，横向放「货位」，这样同一货架的所有货位
      // （含空位）都能对齐铺满，不会出现有货的挤在一列、空的看不见。
      byPos.set(`${p.layer}-${p.col}`, loc);
    }

    const matrix: (LocationData | null)[][] = [];
    for (let row = ROWS; row >= 1; row--) {
      const rowData: (LocationData | null)[] = [];
      for (let col = 1; col <= COLS; col++) {
        rowData.push(byPos.get(`${col}-${row}`) || null);
      }
      matrix.push(rowData);
    }
    return matrix;
  }, [selectedZone, effectiveAisle, locations]);

  // 区域统计
  const zoneStats = useMemo(() => {
    const stats: Record<string, { total: number; occupied: number; sealed: number }> = {};
    zones.forEach(z => {
      stats[z.code] = { total: 0, occupied: 0, sealed: 0 };
    });
    
    locations.forEach(loc => {
      if (stats[loc.zoneCode]) {
        stats[loc.zoneCode].total++;
        if (loc.status === 0) {
          stats[loc.zoneCode].sealed++;
        }
        if (loc.usedBoxes > 0) {
          stats[loc.zoneCode].occupied++;
        }
      }
    });
    
    return stats;
  }, [zones, locations]);

  const handleLocationClick = async (loc: LocationData) => {
    setSelectedLocation(loc);
    setDetailOpen(true);
    setLocationBoxes([]);
    // 加载该货位的真实货位数据（含停用状态）
    if (loc.id) {
      try {
        const res = await fetch(`/api/warehouse/boxes?locationId=${loc.id}`, { cache: 'no-store' });
        const data = await res.json();
        if (data.success) {
          setLocationBoxes(data.data || []);
        }
      } catch (e) {
        // 静默失败，使用前端虚拟货位
      }
    }
  };

  // 停用/恢复单个货位
  const toggleBox = async (box: { id: string; code: string; status: number }) => {
    const newStatus = box.status === 0 ? 1 : 0;
    const isDeactivating = newStatus === 0;
    if (isDeactivating) {
      // 检查货位是否有货
      const stockBox = selectedLocation?.boxes.find(b => b.boxCode === box.code);
      if (stockBox?.occupied) {
        Modal.confirm({
          title: '货位内还有库存',
          content: `货位 ${box.code} 内还有商品库存，停用后该位置不再分配新货，但已有库存仍保留。确定停用？`,
          okText: '确定停用',
          cancelText: '取消',
          onOk: async () => doToggleBox(box, newStatus),
        });
        return;
      }
    }
    doToggleBox(box, newStatus);
  };

  const doToggleBox = async (box: { id: string; code: string; status: number }, newStatus: number) => {
    try {
      const res = await fetch(`/api/warehouse/boxes/${box.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (data.success) {
        message.success(newStatus === 0 ? `货位 ${box.code} 已停用` : `货位 ${box.code} 已恢复使用`);
        // 刷新货位详情和地图
        if (selectedLocation?.id) {
          const res2 = await fetch(`/api/warehouse/boxes?locationId=${selectedLocation.id}`);
          const d2 = await res2.json();
          if (d2.success) setLocationBoxes(d2.data || []);
        }
        loadLocationData();
      } else {
        message.error(data.error || '操作失败');
      }
    } catch (e: any) {
      message.error('操作失败');
    }
  };

  // 停用/恢复整个货位
  const toggleLocation = async () => {
    if (!selectedLocation?.id) return;
    const newStatus = selectedLocation.status === 0 ? 1 : 0;
    const isDeactivating = newStatus === 0;
    const hasStock = (selectedLocation.usedBoxes || 0) > 0;
    const doIt = async () => {
      try {
        const res = await fetch(`/api/warehouse/locations/${selectedLocation.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus }),
        });
        const data = await res.json();
        if (data.success) {
          message.success(data.message || '操作成功');
          setDetailOpen(false);
          setSelectedLocation(null);
          loadLocationData();
        } else {
          message.error(data.error || '操作失败');
        }
      } catch (e: any) {
        message.error('操作失败');
      }
    };
    if (isDeactivating && hasStock) {
      Modal.confirm({
        title: '货位内还有库存',
        content: `货位 ${selectedLocation.code} 内还有 ${selectedLocation.usedBoxes} 个货位库存，停用后该货位不再分配新货，已有库存仍保留。确定停用整个货位？`,
        okText: '确定停用',
        cancelText: '取消',
        onOk: doIt,
      });
    } else {
      doIt();
    }
  };

  // 概览数据
  const overviewZones = useMemo(() => {
    return zones.map(z => {
      const stats = zoneStats[z.code] || { total: 0, occupied: 0, sealed: 0 };
      const active = stats.total - stats.sealed;
      return {
        ...z,
        ...stats,
        active,
        rate: active > 0 ? stats.occupied / active : 0,
      };
    });
  }, [zones, zoneStats]);

  const currentZoneStats = zoneStats[selectedZone] || { total: 0, occupied: 0, sealed: 0 };

  return (
    <div style={{ padding: isMobile ? 12 : 24 }}>
      <div style={{ 
        display: 'flex', 
        flexDirection: isMobile ? 'column' : 'row',
        justifyContent: 'space-between', 
        alignItems: isMobile ? 'stretch' : 'center',
        marginBottom: isMobile ? 12 : 24,
        gap: isMobile ? 12 : 0
      }}>
        <Title level={4} style={{ margin: 0 }}>
          <ShopOutlined style={{ marginRight: 8 }} />
          货架地图
        </Title>
        <Space direction={isMobile ? 'vertical' : 'horizontal'} style={{ width: isMobile ? '100%' : 'auto' }}>
          <Select
            placeholder="选择仓库"
            style={{ width: isMobile ? '100%' : 200 }}
            value={selectedWarehouse}
            onChange={setSelectedWarehouse}
          >
            {warehouses.map((w: any) => (
              <Option key={w.id} value={w.id}>{w.name}</Option>
            ))}
          </Select>
          <Button.Group>
            <Button 
              type={viewMode === 'shelf' ? 'primary' : 'default'}
              onClick={() => setViewMode('shelf')}
            >
              货架视图
            </Button>
            <Button 
              type={viewMode === 'overview' ? 'primary' : 'default'}
              onClick={() => setViewMode('overview')}
            >
              总览
            </Button>
          </Button.Group>
        </Space>
      </div>

      <Spin spinning={loading}>
        {zones.length === 0 ? (
          <Card>
            <Empty
              description={
                <span>
                  {!selectedWarehouse
                    ? '正在加载仓库…'
                    : loading
                      ? '正在加载货架数据…'
                      : '该仓库暂无货架数据'}
                  {selectedWarehouse && !loading && (
                    <>
                      <br />
                      <Text type="secondary">
                        系统会为每个仓库自动创建 A-Z 共 26 个货架，每个货架 10行 × 10位 货位
                      </Text>
                    </>
                  )}
                </span>
              }
            >
              <Button type="primary" onClick={() => window.location.href = '/warehouse'}>
                前往仓库管理
              </Button>
            </Empty>
          </Card>
        ) : viewMode === 'overview' ? (
          /* ========== 总览视图 ========== */
          <Card title="仓库货架总览">
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fill, minmax(160px, 1fr))',
              gap: 16 
            }}>
              {overviewZones.map(zone => (
                <Card
                  key={zone.code}
                  hoverable
                  size="small"
                  onClick={() => {
                    setSelectedZone(zone.code);
                    setViewMode('shelf');
                  }}
                  style={{ 
                    background: getColorByBoxes(zone.occupied),
                    cursor: 'pointer',
                    border: selectedZone === zone.code ? '2px solid #1677ff' : '1px solid #f0f0f0',
                  }}
                >
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 28, fontWeight: 700, color: '#1f2937' }}>
                      {zone.code}
                    </div>
                    <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                      {zone.name}
                    </div>
                    <div style={{ marginTop: 8 }}>
                      {getStatusByBoxes(zone.occupied)}
                    </div>
                    <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
                      {zone.sealed > 0 
                        ? `${zone.active}可用 / ${zone.sealed}停用`
                        : `${zone.occupied}/${zone.total} 位有货`
                      }
                    </div>
                  </div>
                </Card>
              ))}
            </div>
            
            <div style={{ 
              marginTop: 24, 
              padding: 16, 
              background: '#fafafa', 
              borderRadius: 8,
              display: 'flex',
              flexWrap: 'wrap',
              gap: 16,
              justifyContent: 'center'
            }}>
              <Space><div style={{ width: 16, height: 16, background: '#f0f0f0', borderRadius: 2 }} /> <Text type="secondary">空置</Text></Space>
              <Space><div style={{ width: 16, height: 16, background: '#d4edda', borderRadius: 2 }} /> <Text type="secondary">1-3个货位</Text></Space>
              <Space><div style={{ width: 16, height: 16, background: '#fff3cd', borderRadius: 2 }} /> <Text type="secondary">4-6个货位</Text></Space>
              <Space><div style={{ width: 16, height: 16, background: '#ffe0b2', borderRadius: 2 }} /> <Text type="secondary">7-8个货位</Text></Space>
              <Space><div style={{ width: 16, height: 16, background: '#f8d7da', borderRadius: 2 }} /> <Text type="secondary">9-10个货位</Text></Space>
            </div>
          </Card>
        ) : (
          /* ========== 货架视图 ========== */
          <>
            {/* 区域选择标签 */}
            <Card size="small" style={{ marginBottom: 16 }}>
              <div style={{ 
                display: 'flex', 
                overflowX: 'auto', 
                gap: 8,
                padding: '4px 0',
              }}>
                {zones.map(zone => {
                  const stats = zoneStats[zone.code] || { total: 0, occupied: 0 };
                  return (
                    <Button
                      key={zone.code}
                      type={selectedZone === zone.code ? 'primary' : 'default'}
                      onClick={() => setSelectedZone(zone.code)}
                      style={{ 
                        minWidth: isMobile ? 48 : 64,
                        flexShrink: 0,
                        background: selectedZone === zone.code ? undefined : getColorByBoxes(stats.occupied),
                      }}
                    >
                      {zone.code}
                      {stats.occupied > 8 && <Badge dot color="red" offset={[-4, 4]} />}
                    </Button>
                  );
                })}
              </div>
            </Card>

            {/* 货架信息 */}
            <Card size="small" style={{ marginBottom: 16 }}>
              <div style={{ 
                display: 'flex', 
                flexDirection: isMobile ? 'column' : 'row',
                justifyContent: 'space-between',
                alignItems: isMobile ? 'stretch' : 'center',
                gap: isMobile ? 8 : 0
              }}>
                <Space wrap>
                  <Text strong style={{ fontSize: 16 }}>
                    {selectedZone}货架{aisles.length > 0 ? ` · 第${effectiveAisle}列` : ''}
                  </Text>
                  {aisles.length > 1 && (
                    <Select
                      size="small"
                      value={effectiveAisle}
                      onChange={setSelectedAisle}
                      style={{ width: 110 }}
                      options={aisles.map(a => ({ value: a, label: `第 ${a} 列` }))}
                    />
                  )}
                  {getStatusByBoxes(currentZoneStats.occupied)}
                  <Text type="secondary">
                    {currentZoneStats.sealed > 0
                      ? `可用: ${currentZoneStats.total - currentZoneStats.sealed} / 停用: ${currentZoneStats.sealed}`
                      : `有货: ${currentZoneStats.occupied} / ${currentZoneStats.total} 位`
                    }
                  </Text>
                </Space>
                <Space>
                  <Tooltip title="放大">
                    <Button icon={<ZoomInOutlined />} size="small" onClick={() => setZoom(Math.min(zoom + 0.2, 2))} disabled={zoom >= 2} />
                  </Tooltip>
                  <Tooltip title="缩小">
                    <Button icon={<ZoomOutOutlined />} size="small" onClick={() => setZoom(Math.max(zoom - 0.2, 0.6))} disabled={zoom <= 0.6} />
                  </Tooltip>
                  <Tooltip title="重置">
                    <Button size="small" onClick={() => setZoom(1)}>1:1</Button>
                  </Tooltip>
                </Space>
              </div>
            </Card>

            {/* 货架网格 */}
            <Card 
              title={
                <Space>
                  <EnvironmentOutlined />
                  <span>{selectedZone}货架{aisles.length > 0 ? ` · 第${effectiveAisle}列` : ''} - 10行 × 10位</span>
                  <Tooltip title="点击格子查看该货位的10个小货位">
                    <InfoCircleOutlined style={{ color: '#999' }} />
                  </Tooltip>
                </Space>
              }
              style={{ overflow: 'auto' }}
            >
              {currentZoneStats.total === 0 ? (
                <Empty description="该货架暂无货位数据" />
              ) : (
                <>
                  <div style={{ overflow: 'auto', maxHeight: isMobile ? '60vh' : '70vh' }}>
                    <div style={{ 
                      transform: `scale(${zoom})`,
                      transformOrigin: 'top left',
                      transition: 'transform 0.2s',
                    }}>
                      {/* 列号 header */}
                      <div style={{ 
                        display: 'grid',
                        gridTemplateColumns: `40px repeat(10, 1fr)`,
                        gap: 2,
                        marginBottom: 4,
                        minWidth: isMobile ? 360 : 600,
                      }}>
                        <div style={{ padding: '4px 0', textAlign: 'center', fontSize: 11, color: '#999', fontWeight: 500 }}>
                          行╲货位
                        </div>
                        {Array.from({ length: 10 }, (_, i) => (
                          <div key={i} style={{ 
                            padding: '4px 0', textAlign: 'center', fontSize: 12, fontWeight: 600,
                            color: '#374151', background: '#f9fafb', borderRadius: 4,
                          }}>
                            {String(i + 1).padStart(2, '0')}位
                          </div>
                        ))}
                      </div>

                      {/* 行数据 */}
                      {zoneMatrix.map((row, rowIndex) => (
                        <div key={rowIndex} style={{ 
                          display: 'grid',
                          gridTemplateColumns: `40px repeat(10, 1fr)`,
                          gap: 2,
                          marginBottom: 2,
                          minWidth: isMobile ? 360 : 600,
                        }}>
                          <div style={{ 
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 12, fontWeight: 600, color: '#374151', background: '#f9fafb', borderRadius: 4,
                          }}>
                            {10 - rowIndex}行
                          </div>
                          {row.map((loc, colIndex) => {
                            const cellClick = () => {
                              if (loc) {
                                handleLocationClick(loc);
                              }
                            };
                            return (
                              <div
                                key={colIndex}
                                onClick={cellClick}
                                style={{
                                  background: loc ? (loc.status === 0 ? '#e0e0e0' : getColorByBoxes(loc.usedBoxes)) : '#fafafa',
                                  borderRadius: 4,
                                  padding: '6px 4px',
                                  textAlign: 'center',
                                  cursor: loc ? 'pointer' : 'default',
                                  border: '1px solid transparent',
                                  transition: 'all 0.2s',
                                  minHeight: isMobile ? 36 : 44,
                                  display: 'flex',
                                  flexDirection: 'column',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                                onMouseEnter={(e) => {
                                  if (loc) {
                                    e.currentTarget.style.border = '1px solid #1677ff';
                                    e.currentTarget.style.boxShadow = '0 2px 8px rgba(22,119,255,0.2)';
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.border = '1px solid transparent';
                                  e.currentTarget.style.boxShadow = 'none';
                                }}
                              >
                                <Tooltip
                                  title={
                                    loc ? (
                                      <div style={{ maxWidth: 300 }}>
                                        <div style={{ fontWeight: 600, marginBottom: 8, borderBottom: '1px solid #fff', paddingBottom: 4 }}>
                                          📦 {loc.code} - {loc.usedBoxes} 项货品
                                        </div>
                                        {loc.boxes.map((box, idx) => (
                                          <div 
                                            key={box.boxCode} 
                                            style={{ 
                                              padding: '2px 0', 
                                              fontSize: 11,
                                              background: box.occupied ? 'rgba(22,119,255,0.1)' : 'transparent',
                                              borderRadius: 2,
                                              paddingLeft: 4,
                                              marginBottom: 2,
                                              textDecoration: box.deactivated ? 'line-through' : 'none',
                                              opacity: box.deactivated ? 0.6 : 1,
                                            }}
                                          >
                                            <span style={{ color: '#d9d9d9' }}>[{idx + 1}]</span>{' '}
                                            {box.deactivated && <Tag color="default" style={{ margin: 0, fontSize: 9 }}>停用</Tag>}
                                            {box.occupied ? (
                                              <span>
                                                <span style={{ color: '#fff' }}>{box.productName}</span>
                                                {' '}
                                                <Tag color="green" style={{ margin: 0, fontSize: 10 }}>×{box.quantity}</Tag>
                                              </span>
                                            ) : (
                                              <span style={{ color: '#666' }}>空</span>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    ) : '空位'
                                  }
                                >
                                  <span style={{ pointerEvents: 'none' }}>
                                    {loc ? (
                                      loc.status === 0 ? (
                                        <>
                                          <StopOutlined style={{ fontSize: isMobile ? 12 : 14, color: '#999' }} />
                                          <div style={{ fontSize: 10, color: '#999', marginTop: 2 }}>已停用</div>
                                        </>
                                      ) : loc.usedBoxes > 0 ? (
                                        <>
                                          <BoxPlotOutlined style={{ fontSize: isMobile ? 12 : 14, color: '#1677ff' }} />
                                          <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>
                                            {loc.usedBoxes} 项
                                          </div>
                                        </>
                                      ) : (
                                        <div style={{ fontSize: 10, color: '#ccc' }}>空</div>
                                      )
                                    ) : (
                                      <div style={{ fontSize: 10, color: '#eee' }}>-</div>
                                    )}
                                  </span>
                                </Tooltip>
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 图例 */}
                  <div style={{ 
                    marginTop: 16, padding: 12, background: '#fafafa', borderRadius: 8,
                    display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center'
                  }}>
                    <Space size={4}><div style={{ width: 12, height: 12, background: '#f0f0f0', borderRadius: 2 }} /> <Text type="secondary" style={{ fontSize: 11 }}>空</Text></Space>
                    <Space size={4}><div style={{ width: 12, height: 12, background: '#d4edda', borderRadius: 2 }} /> <Text type="secondary" style={{ fontSize: 11 }}>1-3个货位</Text></Space>
                    <Space size={4}><div style={{ width: 12, height: 12, background: '#fff3cd', borderRadius: 2 }} /> <Text type="secondary" style={{ fontSize: 11 }}>4-6个货位</Text></Space>
                    <Space size={4}><div style={{ width: 12, height: 12, background: '#ffe0b2', borderRadius: 2 }} /> <Text type="secondary" style={{ fontSize: 11 }}>7-8个货位</Text></Space>
                                    <Space size={4}><div style={{ width: 12, height: 12, background: '#f8d7da', borderRadius: 2 }} /> <Text type="secondary" style={{ fontSize: 11 }}>9-10个货位</Text></Space>
                    <Space size={4}><div style={{ width: 12, height: 12, background: '#e0e0e0', borderRadius: 2 }} /> <Text type="secondary" style={{ fontSize: 11 }}>已停用</Text></Space>
                  </div>
                </>
              )}
            </Card>
          </>
        )}
      </Spin>

      {/* 货位详情弹窗 */}
      <Modal
        title={
          <Space>
            <BoxPlotOutlined />
            <span>货位详情 - {selectedLocation?.code}</span>
          </Space>
        }
        open={detailOpen}
        onCancel={() => { setDetailOpen(false); setSelectedLocation(null); }}
        footer={null}
        width={isMobile ? '95%' : 600}
      >
        {selectedLocation && (
          <>
            <Descriptions column={isMobile ? 1 : 2} bordered size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="货位编码">{selectedLocation.code}</Descriptions.Item>
              <Descriptions.Item label="所属货架">{selectedLocation.zoneCode}货架</Descriptions.Item>
              <Descriptions.Item label="状态">
                {selectedLocation.status === 0 ? <Tag color="default">已停用</Tag> : (selectedLocation.usedBoxes > 0 ? <Tag color="green">有货</Tag> : <Tag color="blue">使用中</Tag>)}
              </Descriptions.Item>
              <Descriptions.Item label="使用情况">
                <Progress 
                  percent={Math.round(selectedLocation.usedBoxes / 10 * 100)} 
                  size="small"
                  format={() => `${selectedLocation.usedBoxes} 项`}
                />
              </Descriptions.Item>
            </Descriptions>

            <div style={{ marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button 
                danger={selectedLocation.status !== 0}
                icon={<StopOutlined />}
                onClick={toggleLocation}
              >
                {selectedLocation.status === 0 ? '恢复使用整个货位' : '停止使用整个货位'}
              </Button>
              <Text type="secondary" style={{ fontSize: 12 }}>
                停用后该位置不再出现在新商品入库的可用货位中
              </Text>
            </div>

            {/* FIX-2026-1017：这里列的是「这个货位里有哪些货」，不是 10 个小货位 */}
            <Title level={5}>该货位内的货品 (共 {selectedLocation?.boxes.length || 0} 项)</Title>
            <div style={{ 
              display: 'grid',
              gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(5, 1fr)',
              gap: 8,
              marginTop: 8
            }}>
              {(locationBoxes.length > 0 ? locationBoxes : selectedLocation.boxes.map((b, i) => ({ id: '', code: b.boxCode, status: b.deactivated ? 0 : 1 }))).map((box, index) => {
                const stockBox = selectedLocation.boxes.find(b => b.boxCode === box.code);
                const isDeactivated = box.status === 0;
                return (
                  <Card
                    key={box.code || index}
                    size="small"
                    style={{ 
                      background: isDeactivated ? '#f0f0f0' : (stockBox?.occupied ? '#e6f4ff' : '#fafafa'),
                      border: isDeactivated ? '1px solid #d9d9d9' : (stockBox?.occupied ? '1px solid #91caff' : '1px solid #f0f0f0'),
                    }}
                  >
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: isDeactivated ? '#999' : '#1f2937' }}>
                        {stockBox?.productName || '空置'}
                      </div>
                      <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
                        {box.code}
                      </div>
                      {isDeactivated && (
                        <Tag color="default" style={{ marginTop: 4 }}>已停用</Tag>
                      )}
                      {stockBox?.occupied ? (
                        <div style={{ marginTop: 6 }}>
                          <div style={{ fontSize: 11, color: '#1677ff', fontWeight: 500 }}>
                            {stockBox.productName || '-'}
                          </div>
                          <div style={{ fontSize: 10, color: '#999' }}>
                            {stockBox.productCode || ''}
                          </div>
                          <Tag color="blue" style={{ marginTop: 4, fontSize: 11 }}>
                            数量: {stockBox.quantity || 0}
                          </Tag>
                        </div>
                      ) : (
                        !isDeactivated && (
                          <div style={{ marginTop: 6, color: '#ccc', fontSize: 11 }}>
                            空置
                          </div>
                        )
                      )}
                      {box.id && (
                        <Button 
                          size="small" 
                          type={isDeactivated ? 'primary' : 'default'}
                          danger={!isDeactivated}
                          style={{ marginTop: 8, fontSize: 11 }}
                          onClick={() => toggleBox(box)}
                        >
                          {isDeactivated ? '恢复' : '停用'}
                        </Button>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}