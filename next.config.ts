import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    // Expose dev mode flag to the browser so the UI can show a "Test Mode" banner
    NEXT_PUBLIC_WHATSAPP_DEV_MODE: process.env.WHATSAPP_DEV_MODE ?? 'false',
  },
};

export default nextConfig;
