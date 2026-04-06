import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { existsSync } from "fs";
import { resolve } from "path";
import { AppController } from "./modules/app.controller";
import { AdminAuthController } from "./modules/admin/auth/auth.controller";
import { AdminChatsController } from "./modules/admin/chats/chats.controller";
import { AdminKnowledgeController } from "./modules/admin/knowledge/knowledge.controller";
import { AdminSettingsController } from "./modules/admin/settings/settings.controller";
import { AdminTicketsController } from "./modules/admin/tickets/tickets.controller";
import { ChatController } from "./modules/chat/chat.controller";
import { EcommerceController } from "./modules/ecommerce/ecommerce.controller";
import { PdpController } from "./modules/pdp/pdp.controller";
import { TennisService } from "./modules/tennis/tennis.service";
import { PrismaService } from "./prisma/prisma.service";
import type { TennisSourceId } from "@runacademy/shared";
import type { PdpAnalyzeRequest, PdpGenerateImageRequest } from "@runacademy/shared";

function loadEnvironment() {
  const envLoader = (
    process as typeof process & {
      loadEnvFile?: (path?: string) => void;
    }
  ).loadEnvFile;

  if (!envLoader) {
    return;
  }

  const candidates = [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../../.env")];

  candidates.forEach((candidatePath) => {
    if (existsSync(candidatePath)) {
      envLoader(candidatePath);
    }
  });
}

loadEnvironment();

const appController = new AppController();
const chatController = new ChatController();
const adminAuthController = new AdminAuthController();
const adminSettingsController = new AdminSettingsController();
const adminKnowledgeController = new AdminKnowledgeController();
const adminChatsController = new AdminChatsController();
const adminTicketsController = new AdminTicketsController();
const ecommerceController = new EcommerceController();
const pdpController = new PdpController();
const tennisService = new TennisService();

const server = createServer(async (req, res) => {
  applyCors(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const requestUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);
  const pathname = requestUrl.pathname;

  try {
    if (req.method === "GET" && pathname === "/v1/health") {
      respondJson(res, 200, appController.health());
      return;
    }

    if (req.method === "POST" && pathname === "/v1/chat/messages") {
      respondJson(res, 200, chatController.createMessage(await readJsonBody(req)));
      return;
    }

    if (req.method === "POST" && pathname === "/v1/chat/inquiries") {
      respondJson(res, 200, chatController.createInquiry(await readJsonBody(req)));
      return;
    }

    if (req.method === "POST" && pathname === "/v1/admin/auth/login") {
      respondJson(res, 200, adminAuthController.login(await readJsonBody(req)));
      return;
    }

    if (req.method === "GET" && pathname === "/v1/admin/auth/me") {
      respondJson(res, 200, adminAuthController.me());
      return;
    }

    if (req.method === "GET" && pathname === "/v1/admin/settings") {
      respondJson(res, 200, adminSettingsController.getSettings());
      return;
    }

    if (req.method === "PUT" && pathname === "/v1/admin/settings/prompt") {
      respondJson(res, 200, adminSettingsController.updatePrompt(await readJsonBody(req)));
      return;
    }

    if (req.method === "PUT" && pathname === "/v1/admin/settings/model") {
      respondJson(res, 200, adminSettingsController.updateModel(await readJsonBody(req)));
      return;
    }

    if (req.method === "GET" && pathname === "/v1/admin/knowledge") {
      respondJson(res, 200, adminKnowledgeController.listKnowledge());
      return;
    }

    if (req.method === "POST" && pathname === "/v1/admin/knowledge/url") {
      respondJson(res, 200, adminKnowledgeController.addUrl(await readJsonBody(req)));
      return;
    }

    if (req.method === "POST" && pathname === "/v1/admin/knowledge/file") {
      respondJson(res, 200, adminKnowledgeController.addFile());
      return;
    }

    if (req.method === "POST" && pathname === "/v1/admin/knowledge/text") {
      respondJson(res, 200, adminKnowledgeController.addText(await readJsonBody(req)));
      return;
    }

    const knowledgeReindexMatch = pathname.match(/^\/v1\/admin\/knowledge\/([^/]+)\/reindex$/);
    if (req.method === "POST" && knowledgeReindexMatch) {
      respondJson(res, 200, adminKnowledgeController.reindex(knowledgeReindexMatch[1]));
      return;
    }

    if (req.method === "GET" && pathname === "/v1/admin/chats") {
      respondJson(res, 200, adminChatsController.listChats());
      return;
    }

    const adminChatMatch = pathname.match(/^\/v1\/admin\/chats\/([^/]+)$/);
    if (req.method === "GET" && adminChatMatch) {
      respondJson(res, 200, adminChatsController.getChat(adminChatMatch[1]));
      return;
    }

    if (req.method === "GET" && pathname === "/v1/admin/tickets") {
      respondJson(res, 200, adminTicketsController.listTickets());
      return;
    }

    const adminTicketMatch = pathname.match(/^\/v1\/admin\/tickets\/([^/]+)$/);
    if (req.method === "PATCH" && adminTicketMatch) {
      respondJson(res, 200, adminTicketsController.updateTicket(adminTicketMatch[1], await readJsonBody(req)));
      return;
    }

    const adminTicketReplyMatch = pathname.match(/^\/v1\/admin\/tickets\/([^/]+)\/reply$/);
    if (req.method === "POST" && adminTicketReplyMatch) {
      respondJson(res, 200, adminTicketsController.replyTicket(adminTicketReplyMatch[1], await readJsonBody(req)));
      return;
    }

    if (req.method === "POST" && pathname === "/v1/ecommerce/analyze") {
      respondJson(res, 200, await ecommerceController.analyzeProduct(await readJsonBody(req)));
      return;
    }

    if (req.method === "POST" && pathname === "/v1/pdp/analyze") {
      const body = await readJsonBody<PdpAnalyzeRequest>(req);
      respondJson(res, 200, await pdpController.analyze(body, readGeminiApiKeyOverride(req)));
      return;
    }

    if (req.method === "POST" && pathname === "/v1/pdp/images") {
      const body = await readJsonBody<PdpGenerateImageRequest>(req);
      respondJson(res, 200, await pdpController.generateImage(body, readGeminiApiKeyOverride(req)));
      return;
    }

    if (req.method === "GET" && pathname === "/v1/tennis/board") {
      respondJson(res, 200, await tennisService.getBoard());
      return;
    }

    if (req.method === "GET" && pathname === "/v1/tennis/sources") {
      respondJson(res, 200, await tennisService.getSources());
      return;
    }

    if (req.method === "GET" && pathname === "/v1/tennis/tournaments") {
      respondJson(res, 200, await tennisService.listTournaments({
        query: requestUrl.searchParams.get("query") ?? undefined,
        region: requestUrl.searchParams.get("region") ?? undefined,
        level: requestUrl.searchParams.get("level") ?? undefined,
        fee: requestUrl.searchParams.get("fee") ?? undefined,
        ranking: requestUrl.searchParams.get("ranking") ?? undefined,
        format: requestUrl.searchParams.get("format") ?? undefined,
        status: requestUrl.searchParams.get("status") ?? undefined
      }));
      return;
    }

    const tennisTournamentMatch = pathname.match(/^\/v1\/tennis\/tournaments\/([^/]+)$/);
    if (req.method === "GET" && tennisTournamentMatch) {
      respondJson(res, 200, await tennisService.getTournament(tennisTournamentMatch[1]));
      return;
    }

    if (req.method === "GET" && pathname === "/v1/tennis/admin/board") {
      respondJson(res, 200, await tennisService.getBoard());
      return;
    }

    if (req.method === "POST" && pathname === "/v1/tennis/admin/sync-all") {
      respondJson(res, 200, await tennisService.syncAll());
      return;
    }

    const tennisSyncSourceMatch = pathname.match(/^\/v1\/tennis\/admin\/sources\/([^/]+)\/sync$/);
    if (req.method === "POST" && tennisSyncSourceMatch) {
      respondJson(res, 200, await tennisService.syncSource(tennisSyncSourceMatch[1] as TennisSourceId));
      return;
    }

    respondJson(res, 404, {
      ok: false,
      code: "NOT_FOUND",
      message: "요청한 API 경로를 찾을 수 없습니다."
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      respondJson(res, 400, {
        ok: false,
        code: "INVALID_JSON",
        message: "JSON 본문 형식이 올바르지 않습니다."
      });
      return;
    }

    console.error("[api] unhandled error", error);
    respondJson(res, 500, {
      ok: false,
      code: "INTERNAL_ERROR",
      message: "서버 처리 중 오류가 발생했습니다."
    });
  }
});

const port = Number(process.env.PORT ?? 4000);
server.listen(port, "127.0.0.1", () => {
  console.log(`[api] listening on http://127.0.0.1:${port}`);
});

function applyCors(res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Gemini-Api-Key");
}

function readGeminiApiKeyOverride(req: IncomingMessage) {
  const headerValue = req.headers["x-gemini-api-key"];
  return Array.isArray(headerValue) ? headerValue[0] : headerValue;
}

async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {} as T;
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
}

function respondJson(res: ServerResponse, statusCode: number, payload: unknown) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8"
  });
  res.end(JSON.stringify(payload));
}
