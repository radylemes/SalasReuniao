import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { PostgresTenantRepository } from "./infrastructure/repositories/PostgresTenantRepository";
import { MsalTokenService } from "./infrastructure/auth/MsalTokenService";
import { GraphClientFactory } from "./infrastructure/graph/GraphClientFactory";
import { MicrosoftGraphRoomsGateway } from "./infrastructure/graph/MicrosoftGraphRoomsGateway";
import { ListRoomsUseCase } from "./application/use-cases/ListRoomsUseCase";
import { GetScheduleUseCase } from "./application/use-cases/GetScheduleUseCase";
import { BookRoomUseCase } from "./application/use-cases/BookRoomUseCase";
import { tenantResolverMiddleware } from "./presentation/middlewares/tenantResolver";
import { errorHandler } from "./presentation/middlewares/errorHandler";
import { correlationIdMiddleware } from "./presentation/middlewares/correlationId";
import { buildApiRoutes } from "./presentation/routes/apiRoutes";

dotenv.config();

export function createApp() {
  const app = express();
  const tenantRepository = new PostgresTenantRepository();
  const tokenService = new MsalTokenService();
  const graphFactory = new GraphClientFactory(tokenService);
  const graphGateway = new MicrosoftGraphRoomsGateway(graphFactory);

  const listRoomsUseCase = new ListRoomsUseCase(graphGateway);
  const getScheduleUseCase = new GetScheduleUseCase(graphGateway);
  const bookRoomUseCase = new BookRoomUseCase(graphGateway);

  app.use(cors());
  app.use(express.json({ limit: "1mb" }));
  app.use(correlationIdMiddleware);

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "salas-backend",
      timestamp: new Date().toISOString(),
    });
  });

  app.use("/api", tenantResolverMiddleware(tenantRepository), buildApiRoutes(listRoomsUseCase, getScheduleUseCase, bookRoomUseCase));
  app.use(errorHandler);

  return app;
}
