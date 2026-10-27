"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Card, Button, Upload, Table, Alert, Space, Typography, Tag, Spin, message, Descriptions, Divider,
} from "antd";
import {
  DownloadOutlined, UploadOutlined, FileExcelOutlined, CheckCircleOutlined,
  CloseCircleOutlined, MinusCircleOutlined, ReloadOutlined,
} from "@ant-design/icons";
import type { UploadProps } from "antd";

const { Title, Text, Paragraph } = Typography;

interface IoMeta {
  hasWarehouse: boolean;
  warehouseCount: number;
  warehouses: { id: string; name: string; code: string }[];
  productCount: number;
}

interface ImportRow {
  row: number;
  code: string;
  name: string;
  status: "ok" | "skip" | "error";
  message: string;
}

interface ImportSummary {
  total: number;
  created: number;
  skipped: number;
  failed: number;
  hasWarehouse: boolean;
  results: ImportRow[];
}

export default function ProductIoPage() {
  const [meta, setMeta] = useState<IoMeta | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [importing, setImporting] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const loadMeta = useCallback(async () => {
    setLoadingMeta(true);
    try {
      const res = await fetch("/api/products/io-meta", { cache: "no-store" });
      const j = await res.json();
      if (j.success) setMeta(j.data);
      else message.error(j.error || "读取系统状态失败");
    } catch {
      message.error("读取系统状态失败");
    } finally {
      setLoadingMeta(false);
    }
  }, []);

  useEffect(() => { loadMeta(); }, [loadMeta]);

  const downloadTemplate = () => {
    window.location.href = "/api/products/template";
  };

  const exportProducts = () => {
    window.location.href = "/api/products/export";
  };

  const uploadProps: UploadProps = {
    accept: ".xlsx,.xls",
    showUploadList: false,
    beforeUpload: async (file) => {
      setImporting(true);
      setSummary(null);
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/products/import", { method: "POST", body: fd });
        const j = await res.json();
        if (j.success) {
          setSummary(j.data);
          if (j.data.failed > 0) message.warning(`导入完成：成功 ${j.data.created}，跳过 ${j.data.skipped}，失败 ${j.data.failed}`);
          else message.success(`导入完成：成功 ${j.data.created}，跳过 ${j.data.skipped}`);
          loadMeta();
        } else {
          message.error(j.error || "导入失败");
        }
      } catch {
        message.error("导入失败，请检查文件格式");
      } finally {
        setImporting(false);
      }
      return false; // 阻止默认上传
    },
  };

  const columns = [
    { title: "行号", dataIndex: "row", width: 70 },
    { title: "商品编码", dataIndex: "code", width: 160 },
    { title: "商品名称", dataIndex: "name", width: 220 },
    {
      title: "结果",
      dataIndex: "status",
      width: 100,
      render: (s: string) =>
        s === "ok" ? <Tag icon={<CheckCircleOutlined />} color="success">成功</Tag>
        : s === "skip" ? <Tag icon={<MinusCircleOutlined />} color="warning">跳过</Tag>
        : <Tag icon={<CloseCircleOutlined />} color="error">失败</Tag>,
    },
    { title: "说明", dataIndex: "message", ellipsis: true },
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 4 }}>商品导入导出</Title>
      <Paragraph type="secondary" style={{ marginBottom: 16 }}>
        通过 Excel 模板批量导入商品，或把现有商品导出成同一格式。模板由系统即时生成，列结构随系统状态变化。
      </Paragraph>

      <Spin spinning={loadingMeta}>
        <Card title="当前系统状态" size="small" style={{ marginBottom: 16 }}>
          {meta ? (
            <Descriptions column={{ xs: 1, sm: 2, md: 3 }} size="small">
              <Descriptions.Item label="商品总数">{meta.productCount}</Descriptions.Item>
              <Descriptions.Item label="仓库数量">{meta.warehouseCount}</Descriptions.Item>
              <Descriptions.Item label="模板是否含仓库/货位列">
                {meta.hasWarehouse
                  ? <Tag color="blue">包含（必填）</Tag>
                  : <Tag>不包含</Tag>}
              </Descriptions.Item>
            </Descriptions>
          ) : <Text type="secondary">读取中…</Text>}
        </Card>
      </Spin>

      {meta && !meta.hasWarehouse && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="系统里还没有仓库"
          description="当前生成的模板不含「仓库」「货位编码」两列。商品导入后只会有基础信息，不会产生库存。建好仓库后重新下载模板，这两列就会出现并且必填。"
        />
      )}
      {meta && meta.hasWarehouse && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="商品必须绑定货位"
          description={
            <span>
              模板中的「仓库」「货位编码」为必填。货位编码为四段：<Text code>区-排-列-位</Text>，例如 <Text code>A-01-02-03</Text>。
              三段旧编码（<Text code>A-01-01</Text>）会自动补成四段。当前可用仓库：{meta.warehouses.map(w => w.name).join("、") || "—"}
            </span>
          }
        />
      )}

      <Card size="small">
        <Space wrap size="middle">
          <Button type="primary" icon={<DownloadOutlined />} onClick={downloadTemplate}>
            下载导入模板
          </Button>
          <Upload {...uploadProps}>
            <Button icon={<UploadOutlined />} loading={importing}>导入 Excel</Button>
          </Upload>
          <Button icon={<FileExcelOutlined />} onClick={exportProducts}>
            导出商品
          </Button>
          <Button icon={<ReloadOutlined />} onClick={loadMeta}>刷新状态</Button>
        </Space>
      </Card>

      {summary && (
        <>
          <Divider orientation="left">导入结果</Divider>
          <Space size="large" style={{ marginBottom: 12 }}>
            <Text>总计 <Text strong>{summary.total}</Text></Text>
            <Text type="success">成功 <Text strong>{summary.created}</Text></Text>
            <Text type="warning">跳过 <Text strong>{summary.skipped}</Text></Text>
            <Text type="danger">失败 <Text strong>{summary.failed}</Text></Text>
          </Space>
          <Table
            rowKey={(r: ImportRow) => r.row + "-" + r.code}
            size="small"
            columns={columns as any}
            dataSource={summary.results}
            pagination={{ pageSize: 20, showSizeChanger: false }}
            scroll={{ x: 700 }}
          />
        </>
      )}
    </div>
  );
}