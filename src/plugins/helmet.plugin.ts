import helmet from '@fastify/helmet';
import type { FastifyInstance } from 'fastify';

export async function registerHelmet(app: FastifyInstance): Promise<void> {
  await app.register(helmet, {
    global: true,
    // HTTP until certbot. HSTS + upgrade-insecure-requests make the browser
    // rewrite /api fetches to HTTPS and show "API offline" / Failed to fetch.
    hsts: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'"],
        upgradeInsecureRequests: null,
      },
    },
  });
}
