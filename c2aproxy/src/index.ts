import { createApp } from './app.js';
import { readAccessToken } from './auth.js';

async function main() {
  const token = await readAccessToken();
  const app = createApp(token);
  const port = Number(process.env.PORT ?? 8080);
  app.listen(port, () => {
    console.log(`c2aproxy listening on ${port}`);
  });
}

main();
