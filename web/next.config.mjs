/** @type {import('next').NextConfig} */

// The browser only ever talks to this origin; /api and /webhooks are proxied to the
// Express service.
//
// The alternative — calling the API host directly with CORS — fails on the thing that
// matters most: the session cookie. Railway gives each service its own
// *.up.railway.app hostname, and because railway.app sits on the Public Suffix List
// those count as different sites, so a SameSite=Lax cookie would simply not be sent.
// Relaxing it to SameSite=None to compensate would weaken the cookie for every user in
// order to work around a deployment detail. Proxying keeps the cookie first-party and
// removes CORS from the picture entirely.
const apiBase = process.env.API_BASE_URL || 'http://localhost:4000';

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${apiBase}/api/:path*` },
      { source: '/webhooks/:path*', destination: `${apiBase}/webhooks/:path*` },
    ];
  },
};

export default nextConfig;
