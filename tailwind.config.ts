import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          50: "#e6f4ff",
          100: "#bae0ff",
          200: "#91caff",
          300: "#69b1ff",
          400: "#4096ff",
          500: "#1677ff",
          600: "#0958d9",
          700: "#003eb3",
          800: "#002c8c",
          900: "#001d66",
        },
        // 与 globals.css / AntdRegistry appleTheme 共用同一套色板
        ink: {
          DEFAULT: "#0B1220",
          secondary: "#5B6779",
          muted: "#93A0B4",
        },
        mist: {
          bg: "#F6F8FB",
          border: "#E7EBF0",
          borderLight: "#F0F3F7",
        },
      },
      // 苹果风圆角：卡片 20-24px、按钮/输入 12-14px、弹窗 24px
      borderRadius: {
        xs: "10px",
        sm: "12px",
        md: "14px",
        lg: "20px",
        card: "22px",
        modal: "24px",
      },
      // 柔和阴影：低扩散、低透明度，悬停才加深
      boxShadow: {
        soft: "0 1px 2px rgba(16, 24, 40, 0.04)",
        card: "0 1px 2px rgba(16, 24, 40, 0.04), 0 4px 16px rgba(16, 24, 40, 0.04)",
        "card-hover":
          "0 2px 6px rgba(16, 24, 40, 0.05), 0 16px 32px -12px rgba(16, 24, 40, 0.16)",
        popover: "0 12px 32px -12px rgba(16, 24, 40, 0.22)",
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "'SF Pro Text'",
          "'Helvetica Neue'",
          "'PingFang SC'",
          "'Microsoft YaHei'",
          "sans-serif",
        ],
      },
      // 卡片入场：淡入 + 上移（配合 globals.css 的 .yc-stagger 交错延迟）
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.5s cubic-bezier(0.16, 1, 0.3, 1) both",
      },
    },
  },
  plugins: [],
};
export default config;
