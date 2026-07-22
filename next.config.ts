import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/lane-check", destination: "/upload-kit", permanent: true },
      { source: "/lane-check/report", destination: "/upload-kit/report", permanent: true },
      { source: "/lane-check/history", destination: "/upload-kit/history", permanent: true },
    ];
  },
};

export default nextConfig;
