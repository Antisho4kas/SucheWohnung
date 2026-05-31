import { Module } from "@nestjs/common";
import { ProfilesService } from "./profiles.service.js";
import { ProfilesController } from "./profiles.controller.js";

@Module({
  providers: [ProfilesService],
  controllers: [ProfilesController],
})
export class ProfilesModule {}
