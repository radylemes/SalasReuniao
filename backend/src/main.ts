import { createApp } from "./app";
import { EnvTenantRepository } from "./infrastructure/repositories/EnvTenantRepository";

try {
  EnvTenantRepository.assertAtLeastOneTenantConfigured();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const port = Number(process.env.PORT ?? 3000);
const { app, startNoShowJob } = createApp();

startNoShowJob();

app.listen(port, () => {
  console.log(`Backend online na porta ${port}`);
});
