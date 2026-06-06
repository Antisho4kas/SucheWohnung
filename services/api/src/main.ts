import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import helmet from "helmet";
import { AppModule } from "./app.module.js";
import { AllExceptionsFilter } from "./common/errors.filter.js";
import { isSwaggerEnabled, loadConfig } from "./config/configuration.js";

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  app.use(helmet());
  app.enableCors({ origin: config.WEB_BASE_URL, credentials: true });
  app.useGlobalFilters(new AllExceptionsFilter());

  if (isSwaggerEnabled(config)) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle("SucheWohnung API")
      .setDescription("Aggregator for German apartment listings (§08 API Specification)")
      .setVersion("1.0")
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup("api/docs", app, document);
  }

  await app.listen(config.API_PORT, "0.0.0.0");
  new Logger("Bootstrap").log(
    `API listening on :${config.API_PORT} (docs: ${isSwaggerEnabled(config) ? "/api/docs" : "disabled"})`,
  );
}

void bootstrap();
