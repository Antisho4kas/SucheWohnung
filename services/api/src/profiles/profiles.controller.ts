import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { ProfilesService } from "./profiles.service.js";
import { CreateProfileDto, UpdateProfileDto } from "./dto.js";
import { JwtAuthGuard } from "../auth/guards.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { JwtPayload } from "../auth/jwt.strategy.js";

@ApiTags("profiles")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("api/v1/profiles")
export class ProfilesController {
  constructor(private readonly profiles: ProfilesService) {}

  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.profiles.list(user.sub).then((data) => ({ data }));
  }

  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateProfileDto) {
    return this.profiles.create(user.sub, dto).then((data) => ({ data }));
  }

  @Get(":id")
  get(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.profiles.get(user.sub, id).then((data) => ({ data }));
  }

  @Patch(":id")
  update(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.profiles.update(user.sub, id, dto).then((data) => ({ data }));
  }

  @Delete(":id")
  remove(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.profiles.remove(user.sub, id).then(() => ({ data: { ok: true } }));
  }

  @Post(":id/toggle")
  toggle(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.profiles.toggle(user.sub, id).then((data) => ({ data }));
  }

  @Get(":id/matches")
  matches(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.profiles.matches(user.sub, id).then((data) => ({ data }));
  }
}
