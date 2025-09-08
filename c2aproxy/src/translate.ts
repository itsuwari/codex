export interface OpenAIContentPartText {
  type: 'text';
  text: string;
}

export interface OpenAIContentPartImageUrl {
  type: 'image_url';
  image_url: {
    url: string;
  };
}

export interface OpenAIContentPartImageB64 {
  type: 'image_base64';
  image_base64: {
    data: string;
    media_type?: string;
    mime_type?: string;
  };
}

export type OpenAIContentPart =
  | OpenAIContentPartText
  | OpenAIContentPartImageUrl
  | OpenAIContentPartImageB64;

export interface OpenAIMessage {
  role: string;
  content: string | OpenAIContentPart[];
}

export interface OpenAIRequest {
  model: string;
  messages: OpenAIMessage[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  stop?: string | string[];
  stream?: boolean;
}

export interface AnthropicImageBlock {
  type: 'image';
  source: {
    type: 'base64';
    media_type: string;
    data: string;
  };
}

export interface AnthropicTextBlock {
  type: 'text';
  text: string;
}

export type AnthropicContentBlock = AnthropicImageBlock | AnthropicTextBlock;

export interface AnthropicMessage {
  role: string;
  content: AnthropicContentBlock[];
}

export interface AnthropicRequest {
  model: string;
  messages: AnthropicMessage[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  stop_sequences?: string[];
  stream?: boolean;
}

function parseDataUrl(url: string): { mediaType: string; data: string } | null {
  const match = url.match(/^data:(.*?);base64,(.*)$/);
  if (!match) return null;
  return { mediaType: match[1], data: match[2] };
}

async function fetchImage(url: string, fetchImpl: typeof fetch): Promise<{ mediaType: string; data: string }> {
  const res = await fetchImpl(url);
  const array = await res.arrayBuffer();
  const base64 = Buffer.from(array).toString('base64');
  const mediaType = res.headers.get('content-type') ?? 'application/octet-stream';
  return { mediaType, data: base64 };
}

async function convertPart(
  part: OpenAIContentPart,
  fetchImpl: typeof fetch,
): Promise<AnthropicContentBlock> {
  if (part.type === 'text') {
    return { type: 'text', text: part.text };
  }
  if (part.type === 'image_base64') {
    const mediaType = part.image_base64.media_type ?? part.image_base64.mime_type ?? 'application/octet-stream';
    return {
      type: 'image',
      source: { type: 'base64', media_type: mediaType, data: part.image_base64.data },
    };
  }
  const url = part.image_url.url;
  const parsed = parseDataUrl(url);
  const { mediaType, data } = parsed ?? (await fetchImage(url, fetchImpl));
  return { type: 'image', source: { type: 'base64', media_type: mediaType, data } };
}

async function convertMessage(msg: OpenAIMessage, fetchImpl: typeof fetch): Promise<AnthropicMessage> {
  if (typeof msg.content === 'string') {
    return { role: msg.role, content: [{ type: 'text', text: msg.content }] };
  }
  const content = await Promise.all(msg.content.map((p) => convertPart(p, fetchImpl)));
  return { role: msg.role, content };
}

export async function translateRequest(req: OpenAIRequest, fetchImpl: typeof fetch): Promise<AnthropicRequest> {
  const messages = await Promise.all(req.messages.map((m) => convertMessage(m, fetchImpl)));
  const out: AnthropicRequest = {
    model: req.model,
    messages,
  };
  if (req.max_tokens !== undefined) out.max_tokens = req.max_tokens;
  if (req.temperature !== undefined) out.temperature = req.temperature;
  if (req.top_p !== undefined) out.top_p = req.top_p;
  if (req.stop !== undefined) {
    out.stop_sequences = Array.isArray(req.stop) ? req.stop : [req.stop];
  }
  if (req.stream !== undefined) out.stream = req.stream;
  return out;
}
