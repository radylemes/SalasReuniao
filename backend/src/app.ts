import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { EnvTenantRepository } from "./infrastructure/repositories/EnvTenantRepository";
import { MsalTokenService } from "./infrastructure/auth/MsalTokenService";
import { GraphClientFactory } from "./infrastructure/graph/GraphClientFactory";
import { MicrosoftGraphRoomsGateway } from "./infrastructure/graph/MicrosoftGraphRoomsGateway";
import { ListRoomsUseCase } from "./application/use-cases/ListRoomsUseCase";
import { GetScheduleUseCase } from "./application/use-cases/GetScheduleUseCase";
import { GetAvailabilityPreviewUseCase } from "./application/use-cases/GetAvailabilityPreviewUseCase";
import { BookRoomUseCase } from "./application/use-cases/BookRoomUseCase";
import { ListBookingsUseCase } from "./application/use-cases/ListBookingsUseCase";
import { CancelBookingUseCase } from "./application/use-cases/CancelBookingUseCase";
import { SearchDirectoryUsersUseCase } from "./application/use-cases/SearchDirectoryUsersUseCase";
import { tenantResolverMiddleware } from "./presentation/middlewares/tenantResolver";
import { errorHandler } from "./presentation/middlewares/errorHandler";
import { correlationIdMiddleware } from "./presentation/middlewares/correlationId";
import { buildApiRoutes } from "./presentation/routes/apiRoutes";

dotenv.config();

export function createApp() {
  const app = express();
  const tenantRepository = new EnvTenantRepository();
  const tokenService = new MsalTokenService();
  const graphFactory = new GraphClientFactory(tokenService);
  const graphGateway = new MicrosoftGraphRoomsGateway(graphFactory);

  const listRoomsUseCase = new ListRoomsUseCase(graphGateway);
  const getScheduleUseCase = new GetScheduleUseCase(graphGateway);
  const getAvailabilityPreviewUseCase = new GetAvailabilityPreviewUseCase(graphGateway, tenantRepository);
  const bookRoomUseCase = new BookRoomUseCase(graphGateway);
  const listBookingsUseCase = new ListBookingsUseCase(graphGateway);
  const cancelBookingUseCase = new CancelBookingUseCase(graphGateway);
  const searchDirectoryUsersUseCase = new SearchDirectoryUsersUseCase(graphGateway);

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

  app.use(
    "/api",
    tenantResolverMiddleware(tenantRepository),
    buildApiRoutes(
      listRoomsUseCase,
      getScheduleUseCase,
      getAvailabilityPreviewUseCase,
      bookRoomUseCase,
      listBookingsUseCase,
      cancelBookingUseCase,
      searchDirectoryUsersUseCase,
    ),
  );
  app.use(errorHandler);

  return app;
}
