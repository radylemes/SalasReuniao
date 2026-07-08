import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import swaggerUi from "swagger-ui-express";

const openApiPath = path.join(process.cwd(), "docs", "openapi.yaml");

export function buildDocsRoutes() {
  const router = Router();

  router.get("/openapi.yaml", (_req, res, next) => {
    fs.readFile(openApiPath, "utf8", (error, content) => {
      if (error) {
        next(error);
        return;
      }
      res.type("text/yaml").send(content);
    });
  });

  router.use("/", swaggerUi.serve);
  router.get(
    "/",
    swaggerUi.setup(undefined, {
      swaggerOptions: {
        url: "/api/docs/openapi.yaml",
      },
      customSiteTitle: "Salas de Reunião API",
    }),
  );

  return router;
}
