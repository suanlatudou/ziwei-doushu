/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,

  images: {
    unoptimized: true,
  },

  transpilePackages: ['lunar-javascript'],
};

module.exports = nextConfig;
