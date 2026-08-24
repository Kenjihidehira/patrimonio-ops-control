import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Há lockfiles acima desta pasta; fixar a raiz evita que o Turbopack escolha errado.
  turbopack: {
    root: import.meta.dirname,
  },
  images: {
    // Só imagens locais são servidas; nenhuma origem remota é permitida.
    remotePatterns: [],
  },
};

export default nextConfig;
