import fs from 'fs/promises';
import path from 'path';
import os from 'os';

interface AuthFile {
  tokens?: {
    access_token?: string;
  };
}

export async function readAccessToken(): Promise<string | null> {
  const codexHome = process.env.CODEX_HOME ?? path.join(os.homedir(), '.config', 'codex');
  const authPath = path.join(codexHome, 'auth.json');
  try {
    const text = await fs.readFile(authPath, 'utf8');
    const data = JSON.parse(text) as AuthFile;
    return data.tokens?.access_token ?? null;
  } catch {
    return null;
  }
}
