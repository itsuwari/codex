import { createApp } from '../src/app.js';
import request from 'supertest';
import assert from 'node:assert';
import { describe, it } from 'node:test';

describe('c2aproxy /v1/messages', () => {
  it('forwards translated text request', async () => {
    let calledBody: any = null;
    const fetchMock = async (_url: string, opts: any) => {
      calledBody = JSON.parse(opts.body);
      return {
        json: async () => ({ id: '1', role: 'assistant', content: [{ type: 'text', text: 'ok' }] })
      } as any;
    };
    const app = createApp('Access Token', fetchMock as any);
    const res = await request(app)
      .post('/v1/messages')
      .set('Authorization', 'Bearer Access Token')
      .send({ model: 'test', messages: [{ role: 'user', content: 'hello' }], stop: 'bye' });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(calledBody.stop_sequences[0], 'bye');
    assert.deepStrictEqual(calledBody.messages[0].content[0], { type: 'text', text: 'hello' });
  });

  it('translates image parts', async () => {
    const img = Buffer.from('img').toString('base64');
    let body: any = null;
    const fetchMock = async (_url: string, opts: any) => {
      body = JSON.parse(opts.body);
      return { json: async () => ({}) } as any;
    };
    const app = createApp('Access Token', fetchMock as any);
    const res = await request(app)
      .post('/v1/messages')
      .set('Authorization', 'Bearer Access Token')
      .send({
        model: 'test',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: `data:image/png;base64,${img}` } }
            ]
          }
        ]
      });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.messages[0].content[0].type, 'image');
    assert.strictEqual(body.messages[0].content[0].source.media_type, 'image/png');
    assert.strictEqual(body.messages[0].content[0].source.data, img);
  });

  it('translates raw base64 image parts', async () => {
    const img = Buffer.from('raw').toString('base64');
    let body: any = null;
    const fetchMock = async (_url: string, opts: any) => {
      body = JSON.parse(opts.body);
      return { json: async () => ({}) } as any;
    };
    const app = createApp('Access Token', fetchMock as any);
    const res = await request(app)
      .post('/v1/messages')
      .set('Authorization', 'Bearer Access Token')
      .send({
        model: 'test',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_base64',
                image_base64: { data: img, media_type: 'image/png' }
              }
            ]
          }
        ]
      });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.messages[0].content[0].type, 'image');
    assert.strictEqual(body.messages[0].content[0].source.media_type, 'image/png');
    assert.strictEqual(body.messages[0].content[0].source.data, img);
  });

  it('rejects missing token', async () => {
    const app = createApp('Access Token');
    const res = await request(app)
      .post('/v1/messages')
      .send({ model: 'test', messages: [] });
    assert.strictEqual(res.status, 401);
  });

  it('rejects wrong token', async () => {
    const app = createApp('Access Token');
    const res = await request(app)
      .post('/v1/messages')
      .set('Authorization', 'Bearer wrong')
      .send({ model: 'test', messages: [] });
    assert.strictEqual(res.status, 401);
  });
});

describe('c2aproxy /v1/models', () => {
  it('returns model info when authorized', async () => {
    const app = createApp('Access Token');
    const res = await request(app)
      .get('/v1/models')
      .set('Authorization', 'Bearer Access Token');
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.data));
    assert.strictEqual(res.body.data[0].context_length, 200000);
  });

  it('rejects missing token', async () => {
    const app = createApp('Access Token');
    const res = await request(app).get('/v1/models');
    assert.strictEqual(res.status, 401);
  });
});
