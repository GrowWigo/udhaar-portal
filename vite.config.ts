import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
          thankYouQualified: path.resolve(__dirname, 'thank-you-qualified.html'),
          thankYouStandard: path.resolve(__dirname, 'thank-you-standard.html'),
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    plugins: [
      {
        name: 'otp-api-dev-middleware',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (req.url === '/api/send-otp' || req.url === '/api/verify-otp') {
              let body = '';
              req.on('data', (chunk) => {
                body += chunk;
              });
              req.on('end', async () => {
                try {
                  const parsedBody = body ? JSON.parse(body) : {};
                  const mockRes = {
                    setHeader(k, v) {
                      res.setHeader(k, v);
                    },
                    status(code) {
                      res.statusCode = code;
                      return this;
                    },
                    json(data) {
                      res.setHeader('Content-Type', 'application/json');
                      res.end(JSON.stringify(data));
                    },
                    end() {
                      res.end();
                    },
                  };
                  const mockReq = {
                    method: req.method,
                    headers: req.headers,
                    body: parsedBody,
                    socket: req.socket,
                  };

                  if (req.url === '/api/send-otp') {
                    const { default: handler } = await import('./api/send-otp.js');
                    await handler(mockReq, mockRes);
                  } else {
                    const { default: handler } = await import('./api/verify-otp.js');
                    await handler(mockReq, mockRes);
                  }
                } catch (e) {
                  res.statusCode = 500;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ status: 'error', message: e.message }));
                }
              });
              return;
            }
            next();
          });
        },
      },
    ],
  };
});
