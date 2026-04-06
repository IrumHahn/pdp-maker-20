import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";
import type {
  AspectRatio,
  ImageGenOptions,
  LandingPageBlueprint,
  PdpGuidePriorityMode,
  PdpAnalyzeRequest,
  PdpErrorCode,
  SectionBlueprint
} from "@runacademy/shared";

const ANALYZE_MODEL = "gemini-3.1-pro-preview";
const IMAGE_MODEL = "gemini-3-pro-image-preview";
const DEFAULT_IMAGE_MIME = "image/jpeg";
const REFERENCE_MODEL_MAX_ATTEMPTS = 3;

type GeneratedImagePayload = {
  base64: string;
  mimeType: string;
};

type ReferenceModelProfile = {
  genderPresentation: string;
  ageImpression: string;
  faceShape: string;
  hairstyle: string;
  skinTone: string;
  eyeDetails: string;
  browDetails: string;
  lipDetails: string;
  overallVibe: string;
  distinctiveFeatures: string[];
  keepTraits: string[];
  flexibleTraits: string[];
};

type GeneratedImageValidation = {
  isSamePerson: boolean;
  genderPresentationPreserved: boolean;
  styleMatch: boolean;
  confidence: "high" | "medium" | "low";
  reason: string;
  correctionFocus: string[];
};

type InternalImageGenOptions = ImageGenOptions & {
  guidePriorityMode: PdpGuidePriorityMode;
  referenceModelProfile?: ReferenceModelProfile | null;
  retryDirective?: string;
};

type NormalizedReferenceModelImage = {
  base64: string;
  mimeType: string;
};

export class PdpServiceError extends Error {
  constructor(
    readonly code: PdpErrorCode,
    message: string,
    readonly detail?: string
  ) {
    super(message);
    this.name = "PdpServiceError";
  }
}

export class PdpService {
  async analyzeProduct(request: PdpAnalyzeRequest, geminiApiKeyOverride?: string) {
    const normalizedImage = sanitizeBase64Payload(request.imageBase64);
    const mimeType = normalizeMimeType(request.mimeType);
    const referenceModelImage = normalizeReferenceModelImage(request.modelImageBase64, request.modelImageMimeType);
    const client = this.getClient(geminiApiKeyOverride);
    const referenceModelProfile =
      referenceModelImage ? await this.extractReferenceModelProfile(client, referenceModelImage) : null;

    const blueprint = await retryOperation(async () => {
      const response = await client.models.generateContent({
        model: ANALYZE_MODEL,
        contents: [
          {
            parts: [
              buildHighResolutionInlinePart(mimeType, normalizedImage),
              ...(referenceModelImage ? [buildHighResolutionInlinePart(referenceModelImage.mimeType, referenceModelImage.base64)] : []),
              {
                text: buildAnalyzePrompt(request.additionalInfo, request.desiredTone, referenceModelProfile)
              }
            ]
          }
        ] as any,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              executiveSummary: { type: Type.STRING },
              scorecard: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    category: { type: Type.STRING },
                    score: { type: Type.STRING },
                    reason: { type: Type.STRING }
                  }
                }
              },
              blueprintList: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              sections: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    section_id: { type: Type.STRING },
                    section_name: { type: Type.STRING },
                    goal: { type: Type.STRING },
                    headline: { type: Type.STRING },
                    headline_en: { type: Type.STRING },
                    subheadline: { type: Type.STRING },
                    subheadline_en: { type: Type.STRING },
                    bullets: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING }
                    },
                    bullets_en: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING }
                    },
                    trust_or_objection_line: { type: Type.STRING },
                    trust_or_objection_line_en: { type: Type.STRING },
                    CTA: { type: Type.STRING },
                    CTA_en: { type: Type.STRING },
                    layout_notes: { type: Type.STRING },
                    compliance_notes: { type: Type.STRING },
                    image_id: { type: Type.STRING },
                    purpose: { type: Type.STRING },
                    prompt_ko: { type: Type.STRING },
                    prompt_en: { type: Type.STRING },
                    negative_prompt: { type: Type.STRING },
                    style_guide: { type: Type.STRING },
                    reference_usage: { type: Type.STRING }
                  }
                }
              }
            }
          }
        }
      });

      return parseBlueprintResponse(response);
    });

    const firstSection = blueprint.sections[0];

    if (!firstSection) {
      throw new PdpServiceError(
        "GEMINI_RESPONSE_INVALID",
        "상세페이지 섹션을 생성하지 못했습니다.",
        "No sections returned from analyze response."
      );
    }

    const firstImage = await this.generateSectionImageInternal({
      originalImageBase64: normalizedImage,
      section: firstSection,
      aspectRatio: request.aspectRatio,
      desiredTone: request.desiredTone,
      options: {
        style: "studio",
        withModel: true,
        modelGender: "female",
        modelAgeRange: "20s",
        modelCountry: "korea",
        guidePriorityMode: "guide-first",
        headline: firstSection.headline,
        subheadline: firstSection.subheadline,
        referenceModelImageBase64: referenceModelImage?.base64,
        referenceModelImageMimeType: referenceModelImage?.mimeType,
        referenceModelProfile
      }
    });

    blueprint.sections[0] = {
      ...firstSection,
      generatedImage: toDataUrl(firstImage.mimeType, firstImage.base64)
    };

    return {
      originalImage: normalizedImage,
      blueprint
    };
  }

  async generateSectionImage(request: {
    originalImageBase64: string;
    section: SectionBlueprint;
    aspectRatio: AspectRatio;
    desiredTone?: string;
    options?: ImageGenOptions;
  }, geminiApiKeyOverride?: string) {
    const client = this.getClient(geminiApiKeyOverride);
    const normalizedReferenceModel = normalizeReferenceModelImage(
      request.options?.referenceModelImageBase64,
      request.options?.referenceModelImageMimeType
    );
    const referenceModelProfile =
      normalizedReferenceModel && request.options?.withModel
        ? await this.extractReferenceModelProfile(client, normalizedReferenceModel)
        : null;

    const image = await this.generateSectionImageInternal({
      ...request,
      client,
      options: request.options
        ? {
            ...request.options,
            guidePriorityMode: request.options.guidePriorityMode ?? "guide-first",
            referenceModelImageBase64: normalizedReferenceModel?.base64,
            referenceModelImageMimeType: normalizedReferenceModel?.mimeType,
            referenceModelProfile
          }
        : undefined
    });

    return {
      imageBase64: image.base64,
      mimeType: image.mimeType
    };
  }

  private async generateSectionImageInternal(request: {
    originalImageBase64: string;
    section: SectionBlueprint;
    aspectRatio: AspectRatio;
    desiredTone?: string;
    options?: InternalImageGenOptions;
    client?: GoogleGenAI;
  }): Promise<GeneratedImagePayload> {
    const client = request.client ?? this.getClient();
    const originalImageBase64 = sanitizeBase64Payload(request.originalImageBase64);
    const section = normalizeSection(request.section, 0);
    const normalizedReferenceModel = normalizeReferenceModelImage(
      request.options?.referenceModelImageBase64,
      request.options?.referenceModelImageMimeType
    );
    const options = normalizeImageOptions(request.options);
    const referenceModelProfile =
      normalizedReferenceModel && options.withModel
        ? request.options?.referenceModelProfile ?? (await this.extractReferenceModelProfile(client, normalizedReferenceModel))
        : null;

    if (!section.prompt_en) {
      throw new PdpServiceError(
        "INVALID_REQUEST",
        "이미지 프롬프트가 없는 섹션입니다.",
        "Section prompt_en is missing."
      );
    }

    const maxAttempts = normalizedReferenceModel && options.withModel ? REFERENCE_MODEL_MAX_ATTEMPTS : 1;
    let lastGeneratedImage: GeneratedImagePayload | null = null;
    let retryDirective = options.retryDirective;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const prompt = buildImagePrompt(section, request.desiredTone, {
        ...options,
        isRegeneration: options.isRegeneration || attempt > 0,
        referenceModelImageBase64: normalizedReferenceModel?.base64,
        referenceModelImageMimeType: normalizedReferenceModel?.mimeType,
        referenceModelProfile,
        retryDirective
      });

      const generatedImage = await retryOperation(async () => {
        const parts: Array<{ inlineData?: { mimeType: string; data: string }; text?: string }> = [
          {
            inlineData: {
              mimeType: DEFAULT_IMAGE_MIME,
              data: originalImageBase64
            }
          }
        ];

        if (normalizedReferenceModel && options.withModel) {
          parts.push({
            inlineData: {
              mimeType: normalizedReferenceModel.mimeType,
              data: normalizedReferenceModel.base64
            }
          });
        }

        parts.push({
          text: prompt
        });

        const response = await client.models.generateContent({
          model: IMAGE_MODEL,
          contents: {
            parts
          },
          config: {
            imageConfig: {
              aspectRatio: request.aspectRatio
            }
          }
        });

        const nextImage = extractGeneratedImage(response);

        if (!nextImage) {
          throw new PdpServiceError(
            "PDP_IMAGE_GENERATION_FAILED",
            "이미지를 생성하지 못했습니다.",
            "Gemini image response did not include inline image data."
          );
        }

        return nextImage;
      });

      lastGeneratedImage = generatedImage;

      if (!normalizedReferenceModel || !options.withModel || !referenceModelProfile) {
        return generatedImage;
      }

      const validation = await this.validateGeneratedImage(client, {
        generatedImage,
        referenceModelImage: normalizedReferenceModel,
        referenceModelProfile,
        expectedStyle: options.style
      });

      if (validation.isSamePerson && validation.genderPresentationPreserved && validation.styleMatch) {
        return generatedImage;
      }

      retryDirective = buildRetryDirective(validation, referenceModelProfile, options.style);
    }

    if (!lastGeneratedImage) {
      throw new PdpServiceError(
        "PDP_IMAGE_GENERATION_FAILED",
        "이미지를 생성하지 못했습니다.",
        "No image was generated during the retry loop."
      );
    }

    return lastGeneratedImage;
  }

  private getClient(geminiApiKeyOverride?: string) {
    const apiKey = geminiApiKeyOverride?.trim();

    if (!apiKey) {
      throw new PdpServiceError(
        "GEMINI_API_KEY_MISSING",
        "설정 메뉴에서 본인 Gemini API 키를 입력해 주세요."
      );
    }

    return new GoogleGenAI({ apiKey, apiVersion: "v1alpha" });
  }

  private async extractReferenceModelProfile(client: GoogleGenAI, referenceModelImage: NormalizedReferenceModelImage) {
    const response = await client.models.generateContent({
      model: ANALYZE_MODEL,
      contents: [
        {
          parts: [
            {
              text:
                "Analyze the uploaded reference person image and describe the same identifiable person for future commercial image generation. Focus on stable visual identity traits, not styling suggestions. Return JSON only."
            },
            buildHighResolutionInlinePart(referenceModelImage.mimeType, referenceModelImage.base64)
          ]
        }
      ] as any,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            genderPresentation: { type: Type.STRING },
            ageImpression: { type: Type.STRING },
            faceShape: { type: Type.STRING },
            hairstyle: { type: Type.STRING },
            skinTone: { type: Type.STRING },
            eyeDetails: { type: Type.STRING },
            browDetails: { type: Type.STRING },
            lipDetails: { type: Type.STRING },
            overallVibe: { type: Type.STRING },
            distinctiveFeatures: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            keepTraits: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            flexibleTraits: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          }
        }
      }
    });

    return parseReferenceModelProfileResponse(response);
  }

  private async validateGeneratedImage(
    client: GoogleGenAI,
    input: {
      generatedImage: GeneratedImagePayload;
      referenceModelImage: NormalizedReferenceModelImage;
      referenceModelProfile: ReferenceModelProfile;
      expectedStyle: NonNullable<ImageGenOptions["style"]>;
    }
  ) {
    const response = await client.models.generateContent({
      model: ANALYZE_MODEL,
      contents: [
        {
          parts: [
            {
              text: buildValidationPrompt(input.referenceModelProfile, input.expectedStyle)
            },
            buildHighResolutionInlinePart(input.referenceModelImage.mimeType, input.referenceModelImage.base64),
            buildHighResolutionInlinePart(input.generatedImage.mimeType, input.generatedImage.base64)
          ]
        }
      ] as any,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isSamePerson: { type: Type.BOOLEAN },
            genderPresentationPreserved: { type: Type.BOOLEAN },
            styleMatch: { type: Type.BOOLEAN },
            confidence: { type: Type.STRING },
            reason: { type: Type.STRING },
            correctionFocus: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          }
        }
      }
    });

    return parseGeneratedImageValidationResponse(response);
  }
}

export function toPdpErrorResponse(error: unknown) {
  if (error instanceof PdpServiceError) {
    return {
      ok: false as const,
      code: error.code,
      message: error.message,
      detail: error.detail
    };
  }

  const detail = stringifyError(error);
  const message = error instanceof Error ? error.message : "상세페이지 마법사 처리 중 오류가 발생했습니다.";

  if (isQuotaError(message)) {
    return {
      ok: false as const,
      code: "GEMINI_QUOTA_EXCEEDED" as const,
      message: "AI 사용량이 초과되었습니다. 잠시 후 다시 시도하거나 quota 상태를 확인해 주세요.",
      detail
    };
  }

  if (isJsonError(message)) {
    return {
      ok: false as const,
      code: "GEMINI_RESPONSE_INVALID" as const,
      message: "AI 응답을 해석하지 못했습니다. 같은 이미지로 다시 시도해 주세요.",
      detail
    };
  }

  return {
    ok: false as const,
    code: "PDP_ANALYZE_FAILED" as const,
    message: "상세페이지 마법사 처리 중 오류가 발생했습니다.",
    detail
  };
}

function normalizeMimeType(mimeType: string) {
  const normalized = mimeType.trim().toLowerCase();

  if (!normalized.startsWith("image/")) {
    throw new PdpServiceError(
      "INVALID_IMAGE_PAYLOAD",
      "이미지 파일만 업로드할 수 있습니다.",
      `Unsupported mime type: ${mimeType}`
    );
  }

  return normalized;
}

function sanitizeBase64Payload(input: string) {
  const trimmed = input.trim();
  const match = trimmed.match(/^data:[^;]+;base64,(.+)$/);
  const normalized = (match ? match[1] : trimmed).replace(/\s/g, "");

  if (!normalized || !/^[A-Za-z0-9+/]+=*$/.test(normalized)) {
    throw new PdpServiceError(
      "INVALID_IMAGE_PAYLOAD",
      "이미지 데이터가 올바르지 않습니다.",
      "Malformed base64 payload."
    );
  }

  try {
    const bytes = Buffer.from(normalized, "base64");
    if (!bytes.byteLength) {
      throw new Error("empty payload");
    }
  } catch {
    throw new PdpServiceError(
      "INVALID_IMAGE_PAYLOAD",
      "이미지 데이터를 읽을 수 없습니다.",
      "Buffer.from failed for image payload."
    );
  }

  return normalized;
}

function buildAnalyzePrompt(
  additionalInfo?: string,
  desiredTone?: string,
  referenceModelProfile?: ReferenceModelProfile | null
) {
  const referenceModelPrompt = referenceModelProfile
    ? `[참고 모델 이미지가 함께 제공됨]: 모델이 포함되는 컷은 업로드된 동일 인물의 정체성을 유지해야 합니다.
- 유지할 핵심 특성: ${referenceModelProfile.keepTraits.join(", ")}
- 식별 포인트: ${referenceModelProfile.distinctiveFeatures.join(", ")}
- 전체 인상: ${referenceModelProfile.overallVibe}`
    : "";

  return `
이 제품 이미지를 분석하여 4~6개의 핵심 섹션으로 구성된 상세페이지 전체 블루프린트를 설계해주세요.
${additionalInfo ? `[사용자 추가 정보]: ${additionalInfo}` : ""}
${desiredTone ? `[원하는 디자인 톤]: ${desiredTone}` : ""}
${referenceModelPrompt}

# 섹션 템플릿(필수 필드)
- section_id: S1~S6
- section_name: (예: 히어로/체크리스트/베네핏/근거/사용법/후기 등)
- goal: 이 섹션의 역할(짧은 한 문장)
- headline: 한국어 1줄(강하게)
- headline_en: headline의 자연스러운 영어 번역 1줄
- subheadline: 한국어 1줄(명확하게)
- subheadline_en: subheadline의 자연스러운 영어 번역 1줄
- bullets: 한국어 3개(스캔용, 각 1줄)
- bullets_en: bullets의 자연스러운 영어 번역 3개
- trust_or_objection_line: 한국어 불안 제거/신뢰 1문장
- trust_or_objection_line_en: trust_or_objection_line의 자연스러운 영어 번역 1문장
- CTA: (있으면) 한국어 1줄
- CTA_en: CTA의 자연스러운 영어 번역 1줄
- layout_notes: 이미지 레이아웃 지시(짧게)
- compliance_notes: 카테고리별 규제/표현 주의(짧게)

# 섹션 구성 원칙(강제)
- 베네핏은 3개 고정
- 근거 섹션은 반드시 결과→조건→해석 3단으로 작성
- 리뷰 섹션은 전/후 사진보다 사용감 문장 후기 카드 6~12개 우선
- 사용법/루틴은 선택지를 2~3개로 줄여 선택 피로를 없앨 것
- CTA는 최소 2회 이상 배치
- 각 섹션의 이미지는 단순한 제품 누끼나 그래픽이 아닌 소비자의 구매 전환을 유도할 수 있는 고품질 광고 사진 느낌으로 기획할 것
- 첫 번째 섹션은 구매 전환에 가장 중요하므로 반드시 매력적인 모델이 제품과 함께 연출된 컷으로 프롬프트를 작성할 것
- 각 섹션 이미지는 해당 헤드라인과 서브헤드라인의 메시지를 시각적으로 전달해야 함

# 섹션별 이미지 생성 프롬프트
- image_id: IMG_S1~IMG_S6
- purpose: 이 이미지가 전달해야 하는 메시지(짧은 한 문장)
- prompt_ko: 한국어 이미지 생성 프롬프트(1~2문장). 구도, 거리감, 시선 높이, 제품이 프레임에서 차지하는 비중을 함께 명시할 것.
- prompt_en: 영어 프롬프트(실제 이미지 생성용). Include composition, framing distance, camera angle, product prominence, and the key subject action. Keep it neutral enough that studio/lifestyle/outdoor priority can still be controlled at generation time.
- negative_prompt: 피해야 할 요소
- style_guide: 전체 통일 스타일. 스튜디오는 정제된 세트/조명/질감, 라이프스타일은 현실감 있는 공간/행동, 아웃도어는 위치감/공기감/활동성을 분명히 적을 것. 이 값은 디자인 가이드 우선 모드에서만 강하게 적용될 수 있도록 작성할 것.
- reference_usage: 업로드된 기존 제품 이미지를 어떻게 참고할지. 제품 형태, 라벨, 재질, 색감을 유지하는 기준을 명시할 것.
- section_name, goal, layout_notes, compliance_notes, purpose, style_guide, reference_usage는 반드시 한국어로 작성할 것
- 영어는 *_en 필드와 prompt_en에만 사용할 것

# 이미지 생성 공통 규칙
- 세로형 상세페이지용
- 이미지 내에 텍스트, 로고, 워터마크, 글자를 넣지 말 것
- 배경은 단순하게 유지하고 제품/핵심 오브젝트에 시선을 집중시킬 것
- 한 장에 메시지 하나만 전달할 것
- 규제 리스크가 있으면 안전한 표현으로 수정할 것
- JSON 외 텍스트를 붙이지 말고 모든 필드는 간결하게 작성할 것

응답은 반드시 제공된 JSON 스키마를 준수해야 합니다.
`.trim();
}

function buildImagePrompt(
  section: SectionBlueprint,
  desiredTone?: string,
  options?: InternalImageGenOptions
) {
  const baseSceneDirection = getBaseSceneDirection(section, options?.guidePriorityMode ?? "guide-first");
  let enhancedPrompt = "Create a high-end, conversion-optimized commercial advertising photograph. ";

  if (options?.headline) {
    enhancedPrompt += `Context: The image should visually represent the advertising headline "${options.headline}"`;
    if (options.subheadline) {
      enhancedPrompt += ` and subheadline "${options.subheadline}"`;
    }
    enhancedPrompt += ". ";
  }

  if (options?.withModel && options.referenceModelImageBase64) {
    enhancedPrompt +=
      "Reference Inputs: image 1 is the original product reference and must preserve the exact product. image 2 is the mandatory model identity reference. ";
    enhancedPrompt +=
      "The final image MUST use the same person from image 2. Do not switch to a different model, do not change gender, and do not drift to a generic portrait face. ";
    if (options.referenceModelProfile) {
      enhancedPrompt += buildReferenceModelProfilePrompt(options.referenceModelProfile);
    }
  }

  if (options?.isRegeneration) {
    enhancedPrompt += "\n[USER OVERRIDE INSTRUCTIONS - STRICTLY FOLLOW THESE OVER ANY CONFLICTING BASE INSTRUCTIONS]\n";
    enhancedPrompt += buildImageStyleInstructions(options);
    enhancedPrompt += "[END USER OVERRIDE INSTRUCTIONS]\n\n";
  } else {
    enhancedPrompt += "\nBase Instructions: ";
  }

  if (options?.withModel && options.referenceModelImageBase64) {
    enhancedPrompt +=
      `Using image 1 as the exact product reference and image 2 as the exact person reference, create a new commercial scene based on this direction: ${baseSceneDirection}. `;
    enhancedPrompt +=
      "The person in the final image must be the same person from image 2, with the same face, gender presentation, hairstyle, skin tone, and overall identity. ";
    enhancedPrompt +=
      "Do not replace the person with a different model, do not masculinize or feminize them differently, and do not drift to a generic fashion face. Treat this as the same person in a new pose, new framing, and new environment. ";
  } else {
    enhancedPrompt += `Keep the product exactly as is. Build the scene from this direction: ${baseSceneDirection}. `;
  }

  if (desiredTone) {
    enhancedPrompt += `The overall style and tone should be ${desiredTone}. `;
  }

  enhancedPrompt += buildGuidePriorityInstructions(section, options);

  if (!options?.isRegeneration) {
    enhancedPrompt += buildImagePreferenceInstructions(section, options);
  }

  if (options?.retryDirective) {
    enhancedPrompt += ` Retry correction: ${options.retryDirective} `;
  }

  enhancedPrompt += "\nComposition Rules: ";
  enhancedPrompt +=
    "use a varied, intentional camera distance that matches the scene instead of defaulting to a chest-up portrait. ";
  enhancedPrompt +=
    "Depending on the section, use wide shots, medium shots, tabletop/product detail shots, hands-in-frame moments, over-the-shoulder angles, seated scenes, or environment-led framing when they improve product storytelling. ";
  enhancedPrompt +=
    "Keep the product readable, prominent, and beautifully lit, but allow the frame to breathe with negative space, props, and surrounding context when useful. ";
  enhancedPrompt += "\nCRITICAL: The final image must look like a top-tier magazine advertisement or a premium brand's landing page hero shot. ";
  enhancedPrompt +=
    "It should be highly attractive and induce purchase conversion. IMPORTANT: Do NOT include any text, words, letters, typography, or logos in the generated image.";

  return enhancedPrompt;
}

function buildImageStyleInstructions(options?: InternalImageGenOptions) {
  if (!options) {
    return "";
  }

  let instructions = "";

  if (options.style === "studio") {
    instructions +=
      "- Setting: Professional studio lighting, seamless paper or premium studio set, controlled backdrop, and no lived-in domestic context unless explicitly required.\n";
    instructions +=
      "- Composition: Avoid a default chest-up portrait. Prefer a mix of product-centric wide frames, half-body frames, seated or standing full-figure compositions, tabletop layouts, hand interactions, and close detail inserts depending on the section goal.\n";
    instructions +=
      "- Art Direction: Crisp controlled light, subtle shadows, refined color balance, and a clearly designed studio set that feels intentional rather than empty.\n";
    instructions += "- Scene Guardrail: If any lifestyle or outdoor guidance conflicts, keep the result unmistakably studio-led.\n";
  } else if (options.style === "lifestyle") {
    instructions +=
      "- Setting: Authentic, aspirational lifestyle environment with natural lighting, lived-in textures, and everyday context that feels believable.\n";
    instructions +=
      "- Composition: Use candid moments, on-location interaction, room context, hands using the product, and gentle movement. Vary distance between environmental wide shots, medium shots, and close usage details.\n";
    instructions +=
      "- Art Direction: Warm, human, relatable, and editorial, with enough context to explain why the product fits into daily life.\n";
    instructions += "- Scene Guardrail: Do not collapse the result into a blank studio set unless guide priority explicitly demands it.\n";
  } else if (options.style === "outdoor") {
    instructions +=
      "- Setting: Beautiful outdoor environment with cinematic natural lighting, location depth, airiness, and scene-based storytelling.\n";
    instructions +=
      "- Composition: Use wide scenic frames, dynamic movement, environmental close-ups, and product-in-use storytelling that feels active and open.\n";
    instructions +=
      "- Art Direction: Fresh, expansive, airy, and energetic, with the location helping explain the product mood or usage context.\n";
    instructions += "- Scene Guardrail: Keep the result clearly outdoors, not a studio imitation or an indoor lifestyle room.\n";
  }

  if (options.withModel) {
    if (options.referenceModelImageBase64) {
      instructions += "- Subject: MUST feature the exact same person shown in the attached reference model image.\n";
      instructions += "- Identity Lock: Preserve the face, hairstyle, skin tone, gender presentation, and overall appearance of that same person while adapting pose, styling, and composition to the scene.\n";
      instructions += "- Casting Rule: Never swap to another person. Never reinterpret the reference as a different male or female model.\n";
      if (options.referenceModelProfile) {
        instructions += `- Stable Traits: ${options.referenceModelProfile.keepTraits.join(", ")}.\n`;
        instructions += `- Flexible Traits: ${options.referenceModelProfile.flexibleTraits.join(", ")}.\n`;
      }
    } else {
      const modelDescriptor = buildModelDescriptor(options);
      instructions += `- Subject: MUST feature an attractive, professional model (${modelDescriptor}) posing with and interacting naturally with the product.\n`;
    }
  } else {
    instructions += "- Subject: Do NOT include any people or models. Focus entirely on the product and background.\n";
  }

  return instructions;
}

function buildImagePreferenceInstructions(section: SectionBlueprint, options?: InternalImageGenOptions) {
  if (!options) {
    return "";
  }

  const parts: string[] = [];

  if (options.style === "studio") {
    parts.push("Use a polished studio set with controlled light and flexible framing, not a fixed upper-body portrait.");
  } else if (options.style === "lifestyle") {
    parts.push("Use an authentic lifestyle setting with natural interaction and believable context.");
  } else if (options.style === "outdoor") {
    parts.push("Use an outdoor environment with scenic depth and active visual storytelling.");
  }

  if (options.withModel && options.referenceModelImageBase64) {
    parts.push("Use the attached reference model as the same person for this scene, with identity locked and no model swap.");
  } else if (options.withModel) {
    const modelDescriptor = buildModelDescriptor(options);
    parts.push(`If appropriate for the scene, feature a model (${modelDescriptor}).`);
  }

  parts.push("Keep the product central to the story and avoid collapsing the scene into a generic portrait.");
  parts.push(`Preserve the product using this guidance: ${section.reference_usage || "keep shape, material, color, and branding accurate."}`);

  return parts.length ? `Style Preferences: ${parts.join(" ")}` : "";
}

function buildModelDescriptor(options: ImageGenOptions) {
  const nationalityDescriptor = getModelCountryDescriptor(options.modelCountry);
  const ageDescriptor = getModelAgeDescriptor(options.modelAgeRange);
  const genderDescriptor = options.modelGender === "male" ? "man" : "woman";

  return `${nationalityDescriptor} ${genderDescriptor} ${ageDescriptor}`.trim();
}

function getModelCountryDescriptor(country?: ImageGenOptions["modelCountry"]) {
  if (country === "japan") {
    return "Japanese";
  }
  if (country === "usa") {
    return "American";
  }
  if (country === "france") {
    return "French";
  }
  if (country === "germany") {
    return "German";
  }
  if (country === "africa") {
    return "African";
  }

  return "Korean";
}

function getModelAgeDescriptor(ageRange?: ImageGenOptions["modelAgeRange"]) {
  if (ageRange === "teen") {
    return "in the late teens";
  }
  if (ageRange === "30s") {
    return "in the 30s";
  }
  if (ageRange === "40s") {
    return "in the 40s";
  }
  if (ageRange === "50s_plus") {
    return "in the 50s or older";
  }

  return "in the 20s";
}

function parseBlueprintResponse(response: { text?: string }) {
  try {
    const parsed = JSON.parse(extractResponseText(response)) as Partial<LandingPageBlueprint>;
    return sanitizeBlueprint(parsed);
  } catch (error) {
    throw new PdpServiceError(
      "GEMINI_RESPONSE_INVALID",
      "AI 응답을 해석하지 못했습니다.",
      stringifyError(error)
    );
  }
}

function sanitizeBlueprint(input: Partial<LandingPageBlueprint>) {
  const sections = Array.isArray(input.sections)
    ? input.sections.map((section, index) => normalizeSection(section, index))
    : [];

  return {
    executiveSummary: asString(input.executiveSummary),
    scorecard: Array.isArray(input.scorecard)
      ? input.scorecard.map((item) => ({
          category: asString(item?.category),
          score: asString(item?.score),
          reason: asString(item?.reason)
        }))
      : [],
    blueprintList: Array.isArray(input.blueprintList)
      ? input.blueprintList.map((item) => asString(item)).filter(Boolean)
      : sections.map((section) => section.section_name),
    sections
  } satisfies LandingPageBlueprint;
}

function normalizeSection(section: Partial<SectionBlueprint>, index: number): SectionBlueprint {
  return {
    section_id: asString(section.section_id) || `S${index + 1}`,
    section_name: asString(section.section_name) || `섹션 ${index + 1}`,
    goal: asString(section.goal),
    headline: asString(section.headline),
    headline_en: asString(section.headline_en) || asString(section.headline),
    subheadline: asString(section.subheadline),
    subheadline_en: asString(section.subheadline_en) || asString(section.subheadline),
    bullets: Array.isArray(section.bullets) ? section.bullets.map((item) => asString(item)).filter(Boolean) : [],
    bullets_en: Array.isArray(section.bullets_en)
      ? section.bullets_en.map((item) => asString(item)).filter(Boolean)
      : Array.isArray(section.bullets)
        ? section.bullets.map((item) => asString(item)).filter(Boolean)
        : [],
    trust_or_objection_line: asString(section.trust_or_objection_line),
    trust_or_objection_line_en:
      asString(section.trust_or_objection_line_en) || asString(section.trust_or_objection_line),
    CTA: asString(section.CTA),
    CTA_en: asString(section.CTA_en) || asString(section.CTA),
    layout_notes: asString(section.layout_notes),
    compliance_notes: asString(section.compliance_notes),
    image_id: asString(section.image_id) || `IMG_S${index + 1}`,
    purpose: asString(section.purpose),
    prompt_ko: asString(section.prompt_ko),
    prompt_en: asString(section.prompt_en),
    negative_prompt: asString(section.negative_prompt),
    style_guide: asString(section.style_guide),
    reference_usage: asString(section.reference_usage),
    generatedImage: section.generatedImage
  };
}

function normalizeImageOptions(options?: InternalImageGenOptions): InternalImageGenOptions {
  return {
    style: options?.style ?? "studio",
    withModel: options?.withModel ?? false,
    modelGender: options?.modelGender ?? "female",
    modelAgeRange: options?.modelAgeRange ?? "20s",
    modelCountry: options?.modelCountry ?? "korea",
    guidePriorityMode: options?.guidePriorityMode ?? "guide-first",
    headline: options?.headline,
    subheadline: options?.subheadline,
    isRegeneration: options?.isRegeneration,
    referenceModelImageBase64: options?.referenceModelImageBase64,
    referenceModelImageMimeType: options?.referenceModelImageMimeType,
    referenceModelImageFileName: options?.referenceModelImageFileName,
    referenceModelProfile: options?.referenceModelProfile ?? null,
    retryDirective: options?.retryDirective
  };
}

function buildReferenceModelProfilePrompt(profile: ReferenceModelProfile) {
  const stableTraits = uniqueStrings(profile.keepTraits).join(", ");
  const flexibleTraits = uniqueStrings(profile.flexibleTraits).join(", ");
  const distinctiveFeatures = uniqueStrings(profile.distinctiveFeatures).join(", ");

  return [
    "Reference identity profile:",
    `gender presentation ${profile.genderPresentation};`,
    `age impression ${profile.ageImpression};`,
    `face shape ${profile.faceShape};`,
    `hairstyle ${profile.hairstyle};`,
    `skin tone ${profile.skinTone};`,
    `eye details ${profile.eyeDetails};`,
    `brow details ${profile.browDetails};`,
    `lip details ${profile.lipDetails};`,
    `overall vibe ${profile.overallVibe}.`,
    stableTraits ? `Keep fixed: ${stableTraits}.` : "",
    distinctiveFeatures ? `Identifying markers: ${distinctiveFeatures}.` : "",
    flexibleTraits ? `May vary: ${flexibleTraits}.` : ""
  ]
    .filter(Boolean)
    .join(" ");
}

function buildGuidePriorityInstructions(section: SectionBlueprint, options?: InternalImageGenOptions) {
  const mode = options?.guidePriorityMode ?? "guide-first";

  if (mode === "guide-first") {
    return [
      "Design Guide Priority: ON.",
      `Image Purpose: ${section.purpose}.`,
      section.layout_notes ? `Layout Notes: ${section.layout_notes}.` : "",
      section.style_guide ? `Style Guide: ${section.style_guide}.` : "",
      "If the selected shot type and guide conflict, respect the guide first and use the shot type as a supporting constraint."
    ]
      .filter(Boolean)
      .join(" ");
  }

  return [
    "Design Guide Priority: OFF.",
    `Image Purpose: ${section.purpose}.`,
    "Ignore Layout Notes and Style Guide whenever they conflict with the selected shot type.",
    "Use the selected shot type as the main scene-defining instruction."
  ].join(" ");
}

function getBaseSceneDirection(section: SectionBlueprint, mode: PdpGuidePriorityMode) {
  if (mode === "guide-first") {
    return [section.prompt_en, section.layout_notes, section.style_guide, section.reference_usage]
      .filter(Boolean)
      .join(" ");
  }

  return [
    `Communicate this purpose clearly: ${section.purpose}.`,
    "Build a fresh scene from the selected shot type.",
    "Do not inherit conflicting layout or style-guide assumptions from the section metadata."
  ].join(" ");
}

function buildValidationPrompt(profile: ReferenceModelProfile, expectedStyle: NonNullable<ImageGenOptions["style"]>) {
  return `
You will compare two images.
- image 1: the uploaded reference person image
- image 2: the newly generated candidate image

Judge whether image 2 preserves the same identifiable person from image 1 while allowing new pose, styling, framing, and environment.

Reference person profile:
- gender presentation: ${profile.genderPresentation}
- age impression: ${profile.ageImpression}
- face shape: ${profile.faceShape}
- hairstyle: ${profile.hairstyle}
- skin tone: ${profile.skinTone}
- eye details: ${profile.eyeDetails}
- brow details: ${profile.browDetails}
- lip details: ${profile.lipDetails}
- overall vibe: ${profile.overallVibe}
- keep traits: ${profile.keepTraits.join(", ")}
- distinctive features: ${profile.distinctiveFeatures.join(", ")}

Expected shot type: ${getStyleLabel(expectedStyle)}.

Return JSON only with:
- isSamePerson: boolean
- genderPresentationPreserved: boolean
- styleMatch: boolean
- confidence: high | medium | low
- reason: short explanation
- correctionFocus: array of short phrases explaining what must be corrected
`.trim();
}

function buildRetryDirective(
  validation: GeneratedImageValidation,
  profile: ReferenceModelProfile,
  expectedStyle: NonNullable<ImageGenOptions["style"]>
) {
  return [
    `The previous attempt did not pass identity/style validation: ${validation.reason}.`,
    `Keep the same person using these fixed traits: ${uniqueStrings(profile.keepTraits).join(", ")}.`,
    `Preserve these identifying markers: ${uniqueStrings(profile.distinctiveFeatures).join(", ")}.`,
    validation.correctionFocus.length ? `Correct these issues: ${validation.correctionFocus.join(", ")}.` : "",
    `The retried image must clearly read as a ${getStyleLabel(expectedStyle)} scene.`
  ]
    .filter(Boolean)
    .join(" ");
}

function parseReferenceModelProfileResponse(response: { text?: string }) {
  try {
    const parsed = JSON.parse(extractResponseText(response)) as Partial<ReferenceModelProfile>;

    return {
      genderPresentation: asString(parsed.genderPresentation) || "same as reference image",
      ageImpression: asString(parsed.ageImpression) || "same age impression as reference image",
      faceShape: asString(parsed.faceShape) || "same face shape as reference image",
      hairstyle: asString(parsed.hairstyle) || "same hairstyle impression as reference image",
      skinTone: asString(parsed.skinTone) || "same skin tone as reference image",
      eyeDetails: asString(parsed.eyeDetails) || "same eye shape and gaze impression",
      browDetails: asString(parsed.browDetails) || "same brow shape and thickness",
      lipDetails: asString(parsed.lipDetails) || "same lip shape and expression impression",
      overallVibe: asString(parsed.overallVibe) || "same overall vibe as the reference person",
      distinctiveFeatures: asStringArray(parsed.distinctiveFeatures),
      keepTraits: asStringArray(parsed.keepTraits),
      flexibleTraits: asStringArray(parsed.flexibleTraits)
    } satisfies ReferenceModelProfile;
  } catch (error) {
    throw new PdpServiceError(
      "GEMINI_RESPONSE_INVALID",
      "참조 모델 이미지를 해석하지 못했습니다.",
      stringifyError(error)
    );
  }
}

function parseGeneratedImageValidationResponse(response: { text?: string }) {
  try {
    const parsed = JSON.parse(extractResponseText(response)) as Partial<GeneratedImageValidation>;

    return {
      isSamePerson: Boolean(parsed.isSamePerson),
      genderPresentationPreserved: Boolean(parsed.genderPresentationPreserved),
      styleMatch: Boolean(parsed.styleMatch),
      confidence: parsed.confidence === "high" || parsed.confidence === "medium" ? parsed.confidence : "low",
      reason: asString(parsed.reason) || "identity validation failed",
      correctionFocus: asStringArray(parsed.correctionFocus)
    } satisfies GeneratedImageValidation;
  } catch (error) {
    throw new PdpServiceError(
      "GEMINI_RESPONSE_INVALID",
      "생성된 이미지 검증 응답을 해석하지 못했습니다.",
      stringifyError(error)
    );
  }
}

function extractResponseText(response: { text?: string }) {
  if (!response.text) {
    throw new PdpServiceError(
      "GEMINI_RESPONSE_INVALID",
      "AI 응답이 비어 있습니다.",
      "Gemini did not return response.text."
    );
  }

  let text = response.text.trim();
  if (text.startsWith("```json")) {
    text = text.slice(7);
  } else if (text.startsWith("```")) {
    text = text.slice(3);
  }
  if (text.endsWith("```")) {
    text = text.slice(0, -3);
  }

  return text.trim();
}

function buildHighResolutionInlinePart(mimeType: string, data: string) {
  return {
    inlineData: {
      mimeType,
      data
    },
    mediaResolution: {
      level: "media_resolution_high"
    }
  } as any;
}

function getStyleLabel(style: NonNullable<ImageGenOptions["style"]>) {
  if (style === "lifestyle") {
    return "lifestyle shot";
  }
  if (style === "outdoor") {
    return "outdoor shot";
  }

  return "studio shot";
}

function normalizeReferenceModelImage(base64?: string, mimeType?: string) {
  if (!base64?.trim()) {
    return null;
  }

  if (!mimeType?.trim()) {
    throw new PdpServiceError(
      "INVALID_IMAGE_PAYLOAD",
      "모델 이미지 형식이 올바르지 않습니다.",
      "Reference model image is missing mime type."
    );
  }

  return {
    base64: sanitizeBase64Payload(base64),
    mimeType: normalizeMimeType(mimeType)
  };
}

function extractGeneratedImage(response: {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        inlineData?: {
          data?: string;
          mimeType?: string;
        };
      }>;
    };
  }>;
}) {
  const parts = response.candidates?.[0]?.content?.parts ?? [];

  for (const part of parts) {
    if (part.inlineData?.data && part.inlineData.mimeType) {
      return {
        base64: part.inlineData.data,
        mimeType: part.inlineData.mimeType
      };
    }
  }

  return null;
}

async function retryOperation<T>(operation: () => Promise<T>, retries = 2, delay = 1500): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (retries > 0 && (isQuotaError(message) || isJsonError(message))) {
      await wait(delay);
      return retryOperation(operation, retries - 1, delay * 2);
    }

    if (error instanceof PdpServiceError) {
      throw error;
    }

    if (isQuotaError(message)) {
      throw new PdpServiceError(
        "GEMINI_QUOTA_EXCEEDED",
        "AI 사용량이 초과되었습니다. 잠시 후 다시 시도해 주세요.",
        message
      );
    }

    if (isJsonError(message)) {
      throw new PdpServiceError(
        "GEMINI_RESPONSE_INVALID",
        "AI 응답을 해석하지 못했습니다.",
        message
      );
    }

    throw error;
  }
}

function isQuotaError(message: string) {
  const lowered = message.toLowerCase();
  return lowered.includes("429") || lowered.includes("quota") || lowered.includes("resource_exhausted");
}

function isJsonError(message: string) {
  return message.includes("JSON") || message.includes("Unexpected token") || message.includes("Unterminated string");
}

function stringifyError(error: unknown) {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => asString(item)).filter(Boolean) : [];
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toDataUrl(mimeType: string, base64: string) {
  return `data:${mimeType};base64,${base64}`;
}
