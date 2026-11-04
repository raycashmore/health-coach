import { replayAll } from './investigation/replay.mjs';
console.log(JSON.stringify(await replayAll(), null, 2));
