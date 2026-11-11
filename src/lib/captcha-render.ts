import zlib from 'zlib';
import { glyphBitmap } from './captcha-font';

/**
 * 验证码光栅化（M6）
 *
 * v1.2.0 的做法是「把字符画成 SVG 里的像素方块 path」，但路径坐标是确定性的：
 * 同一个字符每次生成的 d 属性完全一样，攻击者只要把 d 前缀与字符建一张表，
 * 就能 100% 还原答案（报告里的求解器 8/8 全对）。
 *
 * 这里换成服务端直接渲染 PNG：
 *  - 输出里没有任何矢量/文本结构，只有像素，无法按「路径指纹」查表；
 *  - 每个字符整体随机旋转/斜切/缩放，且**逐像素**再做位置、尺寸、颜色抖动，
 *    同一字符两次渲染的像素图都不同，模板匹配必须先做抗形变对齐；
 *  - 叠加 3 条曲线干扰线 + 噪点 + 背景渐变，进一步压低 OCR 命中率。
 *
 * 仍然只用标准库（zlib）编码 PNG，不引入新依赖。
 */

const SS = 3; // 超采样倍率：先在 3 倍画布上画，再降采样得到抗锯齿边缘
const W = 150;
const H = 52;

type RGB = [number, number, number];

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

/** 极简画布：RGB 浮点缓冲 + alpha 混合 */
class Canvas {
  readonly w: number;
  readonly h: number;
  readonly buf: Float32Array;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.buf = new Float32Array(w * h * 3);
  }

  fill(color: RGB) {
    for (let i = 0; i < this.w * this.h; i++) {
      this.buf[i * 3] = color[0];
      this.buf[i * 3 + 1] = color[1];
      this.buf[i * 3 + 2] = color[2];
    }
  }

  blend(x: number, y: number, color: RGB, alpha: number) {
    if (alpha <= 0 || x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const a = alpha > 1 ? 1 : alpha;
    const i = (y * this.w + x) * 3;
    this.buf[i] = this.buf[i] * (1 - a) + color[0] * a;
    this.buf[i + 1] = this.buf[i + 1] * (1 - a) + color[1] * a;
    this.buf[i + 2] = this.buf[i + 2] * (1 - a) + color[2] * a;
  }

  /** 画一个旋转后的实心方块（中心、半边长、旋转角、斜切） */
  rotatedSquare(cx: number, cy: number, half: number, angle: number, shear: number, color: RGB, alpha: number) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const reach = half * (1 + Math.abs(shear)) + 2;
    const x0 = Math.floor(cx - reach);
    const x1 = Math.ceil(cx + reach);
    const y0 = Math.floor(cy - reach);
    const y1 = Math.ceil(cy + reach);

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        // 逆变换：先平移，再反旋转得到未旋转坐标
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        const rx = dx * cos + dy * sin;
        const ry = -dx * sin + dy * cos;
        // 再反斜切
        const gx = rx - shear * ry;
        if (Math.abs(gx) <= half && Math.abs(ry) <= half) {
          this.blend(x, y, color, alpha);
        }
      }
    }
  }

  /** 折线（带半透明），用于干扰线 */
  polyline(points: Array<[number, number]>, color: RGB, alpha: number, width: number) {
    for (let i = 0; i < points.length - 1; i++) {
      const [x1, y1] = points[i];
      const [x2, y2] = points[i + 1];
      const steps = Math.ceil(Math.hypot(x2 - x1, y2 - y1) * 2) + 1;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const x = x1 + (x2 - x1) * t;
        const y = y1 + (y2 - y1) * t;
        const r = width / 2;
        for (let oy = -Math.ceil(r); oy <= Math.ceil(r); oy++) {
          for (let ox = -Math.ceil(r); ox <= Math.ceil(r); ox++) {
            const d = Math.hypot(ox, oy);
            if (d <= r) this.blend(Math.round(x) + ox, Math.round(y) + oy, color, alpha * (1 - d / (r + 0.6)));
          }
        }
      }
    }
  }

  /** 降采样到目标尺寸，返回 RGB 字节 */
  downsample(targetW: number, targetH: number, scale: number): Buffer {
    const out = Buffer.alloc(targetW * targetH * 3);
    for (let y = 0; y < targetH; y++) {
      for (let x = 0; x < targetW; x++) {
        let r = 0, g = 0, b = 0;
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            const px = x * scale + sx;
            const py = y * scale + sy;
            const i = (py * this.w + px) * 3;
            r += this.buf[i];
            g += this.buf[i + 1];
            b += this.buf[i + 2];
          }
        }
        const n = scale * scale;
        const o = (y * targetW + x) * 3;
        out[o] = clamp255(Math.round(r / n));
        out[o + 1] = clamp255(Math.round(g / n));
        out[o + 2] = clamp255(Math.round(b / n));
      }
    }
    return out;
  }
}

// ---------- PNG 编码（标准库 zlib） ----------
let crcTable: number[] | null = null;
function crc32(buf: Buffer): number {
  if (!crcTable) {
    crcTable = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(width: number, height: number, rgb: Buffer): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 3;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/** 渲染 4 字符验证码为 PNG */
export function renderCaptchaPng(text: string): Buffer {
  const canvas = new Canvas(W * SS, H * SS);

  // 背景：浅蓝白渐变 + 轻微随机色偏
  const baseR = rand(238, 248);
  const baseG = rand(244, 250);
  const baseB = 255;
  for (let y = 0; y < canvas.h; y++) {
    const t = y / canvas.h;
    const color: RGB = [
      clamp255(baseR + t * 8),
      clamp255(baseG + t * 4),
      clamp255(baseB),
    ];
    for (let x = 0; x < canvas.w; x++) canvas.blend(x, y, color, 1);
  }

  const chars = text.split('');
  const slot = (W * SS - 16 * SS) / Math.max(1, chars.length);
  const palette: RGB[] = [
    [22, 93, 255],
    [29, 78, 216],
    [37, 99, 235],
    [30, 64, 175],
    [17, 85, 204],
  ];

  chars.forEach((ch, index) => {
    const bitmap = glyphBitmap(ch);
    if (!bitmap) return;

    const pixel = rand(6.2, 7.6) * SS * 0.5; // 单像素边长（超采样空间）
    const glyphW = 5 * pixel;
    const cx = 16 * SS + slot * (index + 0.5) - glyphW / 2 + glyphW / 2;
    const cy = canvas.h / 2 + rand(-2, 2) * SS;

    const angle = rand(-0.32, 0.32);
    const shear = rand(-0.18, 0.18);
    const color = palette[Math.floor(rand(0, palette.length))];

    for (let gy = 0; gy < bitmap.length; gy++) {
      for (let gx = 0; gx < bitmap[gy].length; gx++) {
        if (bitmap[gy][gx] !== '1') continue;
        // 3% 的像素直接丢弃，破坏「逐像素等距网格」这一强特征
        if (Math.random() < 0.03) continue;

        const localX = (gx - 2) * pixel + rand(-0.22, 0.22) * pixel;
        const localY = (gy - 3) * pixel + rand(-0.22, 0.22) * pixel;

        const rx = localX * Math.cos(angle) - localY * Math.sin(angle);
        const ry = localX * Math.sin(angle) + localY * Math.cos(angle);
        const px = cx + rx + shear * ry + rand(-0.35, 0.35) * SS;
        const py = cy + ry + rand(-0.35, 0.35) * SS;

        const half = pixel * 0.5 * rand(0.78, 1.02);
        const jitterColor: RGB = [
          clamp255(color[0] + rand(-18, 18)),
          clamp255(color[1] + rand(-18, 18)),
          clamp255(color[2] + rand(-18, 18)),
        ];
        canvas.rotatedSquare(px, py, half, angle + rand(-0.05, 0.05), shear, jitterColor, rand(0.88, 1));
      }
    }

    // 每个字符再叠 2 个随机噪点方块，打散连通域
    for (let i = 0; i < 2; i++) {
      canvas.rotatedSquare(
        cx + rand(-glyphW, glyphW),
        cy + rand(-4 * SS, 4 * SS),
        pixel * rand(0.25, 0.5),
        rand(0, Math.PI),
        0,
        color,
        rand(0.25, 0.5)
      );
    }
  });

  // 干扰线：3 条随机曲线，穿字而过但不至于糊成一片
  for (let i = 0; i < 3; i++) {
    const startY = rand(0, canvas.h);
    const points: Array<[number, number]> = [];
    const steps = 6;
    for (let s = 0; s <= steps; s++) {
      const y = startY + Math.sin(s * 1.2 + i) * rand(4, 12) * SS;
      points.push([
        (canvas.w / steps) * s,
        Math.max(0, Math.min(canvas.h - 1, y)),
      ]);
    }
    canvas.polyline(
      points,
      [rand(120, 170), rand(150, 190), rand(200, 235)],
      rand(0.18, 0.3),
      Math.max(1, rand(0.8, 1.6) * SS)
    );
  }

  // 噪点
  const dots = 90;
  for (let i = 0; i < dots; i++) {
    const x = Math.floor(rand(0, canvas.w));
    const y = Math.floor(rand(0, canvas.h));
    canvas.blend(x, y, [rand(120, 200), rand(140, 205), rand(190, 240)], rand(0.2, 0.5));
  }

  const rgb = canvas.downsample(W, H, SS);
  return encodePng(W, H, rgb);
}
