import express, { type Express, type Request, type Response } from 'express';
import { translateRequest, type OpenAIRequest } from './translate.js';

export function createApp(
  expectedToken: string | null,
  fetchImpl: typeof fetch = fetch,
): Express {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  app.post('/v1/messages', async (req: Request, res: Response) => {
    const auth = req.header('authorization');
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!expectedToken || token !== expectedToken) {
      return res.sendStatus(401);
    }

    try {
      const body = req.body as OpenAIRequest;
      const anthropicReq = await translateRequest(body, fetchImpl);
      const upstream = await fetchImpl('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': expectedToken,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(anthropicReq),
      });
      const data = await upstream.json();
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.get('/v1/models', (req: Request, res: Response) => {
    const auth = req.header('authorization');
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!expectedToken || token !== expectedToken) {
      return res.sendStatus(401);
    }

    res.json({
      data: [
        { id: 'claude-3-haiku', context_length: 200000 },
        { id: 'claude-3-sonnet', context_length: 200000 },
        { id: 'claude-3-opus', context_length: 200000 },
      ],
    });
  });

  return app;
}
