import type { PdpAnalyzeRequest, PdpGenerateImageRequest } from "@runacademy/shared";
import { PdpService, PdpServiceError, toPdpErrorResponse } from "./pdp.service";

export class PdpController {
  constructor(private readonly pdpService = new PdpService()) {}

  async analyze(body: PdpAnalyzeRequest, geminiApiKeyOverride?: string) {
    try {
      const result = await this.pdpService.analyzeProduct(body, geminiApiKeyOverride);
      return {
        ok: true as const,
        result
      };
    } catch (error) {
      return toPdpErrorResponse(error);
    }
  }

  async generateImage(body: PdpGenerateImageRequest, geminiApiKeyOverride?: string) {
    try {
      const result = await this.pdpService.generateSectionImage(body, geminiApiKeyOverride);
      return {
        ok: true as const,
        ...result
      };
    } catch (error) {
      return toPdpErrorResponse(
        error instanceof PdpServiceError
          ? error
          : new PdpServiceError(
              "PDP_IMAGE_GENERATION_FAILED",
              "이미지 생성 중 오류가 발생했습니다.",
              error instanceof Error ? `${error.name}: ${error.message}` : String(error)
            )
      );
    }
  }
}
