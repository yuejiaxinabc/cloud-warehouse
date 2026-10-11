"use client";

import React, { useEffect, useRef, useState } from "react";
import { Button, message } from "antd";
import { CameraOutlined } from "@ant-design/icons";

interface Props {
  onScan: (code: string) => void;
  onClose: () => void;
}

export default function BarcodeScanner({ onScan, onClose }: Props) {
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const scannerRef = useRef<any>(null);
  const trackRef = useRef<any>(null);
  const doneRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    const loadScript = (): Promise<void> => {
      return new Promise((resolve, reject) => {
        if ((window as any).Html5Qrcode) { resolve(); return; }
        const s = document.createElement("script");
        s.src = "/html5-qrcode.min.js";
        s.onload = () => resolve();
        s.onerror = () => reject(new Error("加载扫码库失败"));
        document.head.appendChild(s);
      });
    };

    const start = async () => {
      try {
        await loadScript();
        if (!mounted) return;

        const { Html5Qrcode } = (window as any);
        const scanner = new Html5Qrcode("barcode-reader", { verbose: false });
        scannerRef.current = scanner;

        const config = {
          fps: 30,
          qrbox: { width: 260, height: 160 },
          aspectRatio: 1.5,
          disableFlip: false,
          videoConstraints: {
            facingMode: "environment",
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            focusMode: "continuous",
            zoom: { ideal: 1.5 },
          },
        };

        await scanner.start(
          { facingMode: "environment" },
          config,
          (decodedText: string) => {
            if (doneRef.current) return;
            doneRef.current = true;
            message.success(`扫码成功: ${decodedText}`);
            try { scanner.stop(); } catch {}
            onScan(decodedText);
          },
          () => {}
        );

        // 获取视频轨道用于手电筒/对焦控制
        try {
          const videoEl = document.querySelector("#barcode-reader video") as HTMLVideoElement;
          if (videoEl && videoEl.srcObject) {
            const stream = videoEl.srcObject as MediaStream;
            const track = stream.getVideoTracks()[0];
            trackRef.current = track;
            
            // 尝试开启连续自动对焦
            const capabilities = (track as any).getCapabilities?.();
            if (capabilities) {
              const constraints: any = {};
              if (capabilities.focusMode?.includes("continuous")) {
                constraints.focusMode = "continuous";
              }
              if (capabilities.zoom && capabilities.zoom.max > 1) {
                constraints.zoom = Math.min(2, capabilities.zoom.max);
              }
              if (Object.keys(constraints).length > 0) {
                await track.applyConstraints({ advanced: [constraints] }).catch(() => {});
              }
            }
          }
        } catch (e) {
          console.log("Camera track control failed:", e);
        }

        if (mounted) setReady(true);
      } catch (e: any) {
        console.error("Scanner error:", e);
        if (mounted) setError(e.message || "无法访问摄像头");
      }
    };

    start();

    return () => {
      mounted = false;
      if (scannerRef.current) {
        try { scannerRef.current.stop(); } catch {}
        try { scannerRef.current.clear(); } catch {}
      }
    };
  }, [onScan]);

  const toggleTorch = async () => {
    const track = trackRef.current;
    if (!track) return;
    try {
      const capabilities = (track as any).getCapabilities?.();
      if (capabilities?.torch) {
        await track.applyConstraints({ advanced: [{ torch: !torchOn }] });
        setTorchOn(!torchOn);
      } else {
        message.info("当前设备不支持手电筒");
      }
    } catch {
      message.info("当前设备不支持手电筒");
    }
  };

  return (
    <div style={{ position: "relative", width: "100%", borderRadius: 8, overflow: "hidden" }}>
      {error ? (
        <div style={{ padding: 40, textAlign: "center", background: "#000" }}>
          <CameraOutlined style={{ fontSize: 48, marginBottom: 16, opacity: 0.5, color: "#fff" }} />
          <p style={{ color: "#ff4d4f", marginBottom: 16 }}>{error}</p>
          <Button onClick={() => window.location.reload()} type="primary">重试</Button>
        </div>
      ) : (
        <>
          <div id="barcode-reader" style={{ width: "100%", minHeight: 280, background: "#000" }} />
          {ready && (
            <>
              <div style={{
                position: "absolute", top: "50%", left: "50%",
                transform: "translate(-50%, -50%)",
                width: 260, height: 160,
                border: "2px solid rgba(37,99,235,0.8)",
                borderRadius: 12,
                boxShadow: "0 0 0 9999px rgba(0,0,0,0.25)",
                pointerEvents: "none",
              }}>
                <div style={{
                  position: "absolute", top: 0, left: 0, right: 0, height: 2,
                  background: "#2563EB",
                  animation: "scanLine 2s linear infinite",
                }} />
              </div>
              <div style={{
                position: "absolute", bottom: 12, left: 0, right: 0,
                display: "flex", justifyContent: "center", gap: 12,
              }}>
                <Button size="small" onClick={toggleTorch}
                  style={{ background: "rgba(0,0,0,0.5)", color: "#fff", border: "none" }}>
                  {torchOn ? "关闭闪光灯" : "打开闪光灯"}
                </Button>
              </div>
            </>
          )}
          {!ready && (
            <div style={{ padding: 60, textAlign: "center", background: "#000" }}>
              <CameraOutlined style={{ fontSize: 48, marginBottom: 16, opacity: 0.5, color: "#fff" }} />
              <p style={{ color: "#fff" }}>正在启动摄像头...</p>
            </div>
          )}
        </>
      )}
      <style>{`
        @keyframes scanLine {
          0% { top: 0; }
          100% { top: 100%; }
        }
      `}</style>
    </div>
  );
}
