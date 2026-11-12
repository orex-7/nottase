/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Gera `.next/standalone/server.js` (servidor Node autocontido) usado pelo
  // app desktop (Electron). O build web padrão (`next start`) continua igual.
  output: "standalone",
};

export default nextConfig;
