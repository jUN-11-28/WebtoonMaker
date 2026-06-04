import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      {
        // Supabase Storage (생성된 이미지)
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      {
        // Supabase Storage 커스텀 도메인 대비
        protocol: "https",
        hostname: "*.supabase.in",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  experimental: {
    serverActions: {
      // Codespace 포트 포워딩 도메인 허용
      allowedOrigins: [
        "localhost:3000",
        "localhost:3001",
        "*.app.github.dev",
        "*.preview.app.github.dev",
        "*.up.railway.app",
        ...(process.env.NEXT_PUBLIC_APP_URL
          ? [new URL(process.env.NEXT_PUBLIC_APP_URL).host]
          : []),
      ],
    },
  },
};

export default nextConfig;
