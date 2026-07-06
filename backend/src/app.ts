import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "node:path";
import { EnvTenantRepository } from "./infrastructure/repositories/EnvTenantRepository";
import { FileKioskSettingsRepository } from "./infrastructure/repositories/FileKioskSettingsRepository";
import { FileUiConfigRepository } from "./infrastructure/repositories/FileUiConfigRepository";
import { MsalTokenService } from "./infrastructure/auth/MsalTokenService";
import { GraphClientFactory } from "./infrastructure/graph/GraphClientFactory";
import { MicrosoftGraphRoomsGateway } from "./infrastructure/graph/MicrosoftGraphRoomsGateway";
import { ListRoomsUseCase } from "./application/use-cases/ListRoomsUseCase";
import { GetScheduleUseCase } from "./application/use-cases/GetScheduleUseCase";
import { GetAvailabilityPreviewUseCase } from "./application/use-cases/GetAvailabilityPreviewUseCase";
import { BookRoomUseCase } from "./application/use-cases/BookRoomUseCase";
import { ListBookingsUseCase } from "./application/use-cases/ListBookingsUseCase";
import { CancelBookingUseCase } from "./application/use-cases/CancelBookingUseCase";
import { CheckInBookingUseCase } from "./application/use-cases/CheckInBookingUseCase";
import { GetRoomKioskSettingsUseCase } from "./application/use-cases/GetRoomKioskSettingsUseCase";
import { SaveRoomKioskSettingsUseCase } from "./application/use-cases/SaveRoomKioskSettingsUseCase";
import { ProcessNoShowBookingsUseCase } from "./application/use-cases/ProcessNoShowBookingsUseCase";
import { SearchDirectoryUsersUseCase } from "./application/use-cases/SearchDirectoryUsersUseCase";
import { GetUiConfigUseCase, SaveUiConfigUseCase } from "./application/use-cases/UiConfigUseCases";
import { TabLogoUseCases } from "./application/use-cases/TabLogoUseCases";
import { ListAllRoomsForAdminUseCase } from "./application/use-cases/ListAllRoomsForAdminUseCase";
import { buildAdminRoutes, buildPublicUiConfigRoute } from "./presentation/routes/adminRoutes";
import { tenantResolverMiddleware } from "./presentation/middlewares/tenantResolver";
import { errorHandler } from "./presentation/middlewares/errorHandler";
import { correlationIdMiddleware } from "./presentation/middlewares/correlationId";
import { buildApiRoutes } from "./presentation/routes/apiRoutes";

dotenv.config();

const NO_SHOW_INTERVAL_MS = 60_000;

const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});

export function createApp() {
  const app = express();
  app.use(helmet());
  const tenantRepository = new EnvTenantRepository();
  const kioskSettingsRepository = new FileKioskSettingsRepository();
  const uiConfigRepository = new FileUiConfigRepository();
  const tokenService = new MsalTokenService();
  const graphFactory = new GraphClientFactory(tokenService);
  const graphGateway = new MicrosoftGraphRoomsGateway(graphFactory, uiConfigRepository);

  const listRoomsUseCase = new ListRoomsUseCase(graphGateway);
  const getScheduleUseCase = new GetScheduleUseCase(graphGateway);
  const getAvailabilityPreviewUseCase = new GetAvailabilityPreviewUseCase(
    graphGateway,
    tenantRepository,
    uiConfigRepository,
  );
  const bookRoomUseCase = new BookRoomUseCase(
    graphGateway,
    getAvailabilityPreviewUseCase,
    kioskSettingsRepository,
  );
  const listBookingsUseCase = new ListBookingsUseCase(graphGateway);
  const cancelBookingUseCase = new CancelBookingUseCase(graphGateway);
  const checkInBookingUseCase = new CheckInBookingUseCase(graphGateway, kioskSettingsRepository);
  const getRoomKioskSettingsUseCase = new GetRoomKioskSettingsUseCase(kioskSettingsRepository);
  const saveRoomKioskSettingsUseCase = new SaveRoomKioskSettingsUseCase(kioskSettingsRepository);
  const processNoShowBookingsUseCase = new ProcessNoShowBookingsUseCase(
    kioskSettingsRepository,
    tenantRepository,
    graphGateway,
  );
  const searchDirectoryUsersUseCase = new SearchDirectoryUsersUseCase(graphGateway);
  const getUiConfigUseCase = new GetUiConfigUseCase(uiConfigRepository);
  const saveUiConfigUseCase = new SaveUiConfigUseCase(uiConfigRepository);
  const listAllRoomsForAdminUseCase = new ListAllRoomsForAdminUseCase(
    graphGateway,
    tenantRepository,
    uiConfigRepository,
  );
  const tabLogoUseCases = new TabLogoUseCases(uiConfigRepository);

  const corsAllowedOrigins = process.env.CORS_ALLOWED_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (corsAllowedOrigins?.length) {
    app.use(cors({ origin: corsAllowedOrigins }));
  } else {
    console.warn(
      "[cors] CORS_ALLOWED_ORIGINS não definido; aceitando qualquer origem. Configure a variável para restringir em produção.",
    );
    app.use(cors());
  }
  app.use(express.json({ limit: "1mb" }));
  app.use(correlationIdMiddleware);

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "salas-backend",
      timestamp: new Date().toISOString(),
    });
  });

  app.use("/api", apiRateLimiter);
  app.use("/api/logos", express.static(path.join(process.cwd(), "data", "logos")));

  app.use("/api", buildPublicUiConfigRoute(getUiConfigUseCase));
  app.use(
    "/api/admin",
    buildAdminRoutes(
      getUiConfigUseCase,
      saveUiConfigUseCase,
      listAllRoomsForAdminUseCase,
      tabLogoUseCases,
    ),
  );

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
      checkInBookingUseCase,
      getRoomKioskSettingsUseCase,
      saveRoomKioskSettingsUseCase,
      searchDirectoryUsersUseCase,
    ),
  );
  app.use(errorHandler);

  const startNoShowJob = () => {
    const run = () => {
      void processNoShowBookingsUseCase.execute().catch((error: unknown) => {
        console.error("[no-show] Falha ao processar reservas sem check-in:", error);
      });
    };
    run();
    return setInterval(run, NO_SHOW_INTERVAL_MS);
  };

  return { app, startNoShowJob };
}
