import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { ChatController } from "./chat/chat.controller";
import { AdminAuthController } from "./admin/auth/auth.controller";
import { AdminSettingsController } from "./admin/settings/settings.controller";
import { AdminKnowledgeController } from "./admin/knowledge/knowledge.controller";
import { AdminChatsController } from "./admin/chats/chats.controller";
import { AdminTicketsController } from "./admin/tickets/tickets.controller";
import { EcommerceController } from "./ecommerce/ecommerce.controller";

@Module({
  controllers: [
    AppController,
    ChatController,
    AdminAuthController,
    AdminSettingsController,
    AdminKnowledgeController,
    AdminChatsController,
    AdminTicketsController,
    EcommerceController
  ]
})
export class AppModule {}
