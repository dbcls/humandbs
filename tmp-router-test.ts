import { getRouter } from './apps/frontend/src/router';

const routerPromise = getRouter();

async function test(path: string) {
  const router = await routerPromise;
  try {
    await router.loadRoute({ to: path });
  } catch (error) {
    console.error('loadRoute error', error);
  }
  const matches = router.state.matches;
  console.log('path', path);
  console.log(matches.map((m) => ({ id: m.routeId, full: m.fullPath, params: m.params })));
}

await test('/data-usage/researches/foo');
await test('/ja/data-usage/researches/foo');
await test('/en/data-usage/researches/foo');
