"use client";

import { Typography } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import Link from "next/link";

const { Title, Paragraph, Text } = Typography;

export default function TermsPage() {
  return (
    <div style={{ minHeight: "100dvh", background: "#F8FAFC", padding: "40px 20px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", background: "#fff", borderRadius: 12, padding: "40px 36px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
        <Link href="/login" style={{ fontSize: 14, color: "#64748B", display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 24 }}>
          <ArrowLeftOutlined /> 返回登录
        </Link>
        <h2 style={{ marginBottom: 8 }}>服务协议</h2>
        <Text type="secondary">最后更新：2026年8月15日</Text>

        <div style={{ marginTop: 32, lineHeight: 2, color: "#334155", fontSize: 14 }}>
          <h4>1. 服务内容</h4>
          <Paragraph>云仓智能仓储管理平台（以下简称"本系统"）为用户提供仓储管理、库存管理、商品管理、出入库管理等信息化管理服务。系统管理员负责分配用户账号和权限。</Paragraph>

          <h4>2. 用户责任</h4>
          <Paragraph>
            用户应妥善保管账号密码，不得将账号借给他人使用。用户对使用其账号进行的所有操作承担法律责任。如发现账号被盗用，应立即通知管理员。<br/>
            用户不得利用本系统从事违法违规活动，不得尝试攻击、破解或破坏系统。
          </Paragraph>

          <h4>3. 数据安全</h4>
          <Paragraph>系统运营方将采取合理措施保护用户数据安全，包括但不限于数据加密、访问控制、定期备份等。但由于不可抗力或用户自身原因导致的数据丢失，系统运营方不承担责任。</Paragraph>

          <h4>4. 知识产权</h4>
          <Paragraph>本系统的软件、界面设计、文档等知识产权归系统运营方所有。未经授权，用户不得复制、修改、传播或逆向工程。</Paragraph>

          <h4>5. 服务变更与终止</h4>
          <Paragraph>系统运营方有权根据业务需要对系统功能进行更新、调整或停止。如涉及重大变更，将提前通知用户。</Paragraph>

          <h4>6. 免责声明</h4>
          <Paragraph>本系统按"现状"提供服务，不作任何明示或暗示的保证。系统运营方不对因使用本系统而产生的任何间接损失承担责任。</Paragraph>

          <h4>7. 争议解决</h4>
          <Paragraph>因本协议引起的争议，双方应友好协商解决。协商不成的，提交系统运营方所在地人民法院管辖。</Paragraph>
        </div>
      </div>
    </div>
  );
}
