import { loadStagingConfig, verifyStagingDatabase } from "./staging-safety.mjs";

const config = loadStagingConfig();
const { client, report } = await verifyStagingDatabase(config);
await client.end();
console.log(JSON.stringify({ ok: true, ...report, providers: config.providerMode, auth: "staging-only secret configured" }));
