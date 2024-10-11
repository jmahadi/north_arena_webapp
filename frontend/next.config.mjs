/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone', // Useful for Docker deployments
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL}/api/:path*`,
      },
    ]
  },
  images: {
    domains: ['your-image-domain.com'], // Add this if you're using Next.js Image with external URLs
  },
};

export default nextConfig;