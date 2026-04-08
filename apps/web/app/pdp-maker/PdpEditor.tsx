"use client";

import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";
import JSZip from "jszip";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Download,
  Globe2,
  Image as ImageIcon,
  Loader2,
  Palette,
  RefreshCw,
  Save,
  Settings2,
  Sparkles,
  Square,
  Trash2,
  Type,
  User
} from "lucide-react";
import { Rnd } from "react-rnd";
import type {
  AspectRatio,
  GeneratedResult,
  ImageGenOptions,
  PdpCopyLanguage,
  PdpGenerateImageResponse,
  ReferenceModelUsage
} from "@runacademy/shared";
import type {
  CanvasLayer,
  FloatingWorkbenchState,
  OverlayTextAlign,
  PdpEditorDraftState,
  PreparedImageDraft,
  ShapeLayer,
  TextOverlay,
  WorkbenchTab
} from "./pdp-drafts";
import styles from "./pdp-maker.module.css";
import { apiJson, toDataUrl } from "./pdp-utils";

interface PdpEditorProps {
  initialResult: GeneratedResult;
  aspectRatio: AspectRatio;
  geminiApiKey?: string | null;
  desiredTone: string;
  initialDraftState?: PdpEditorDraftState | null;
  lastSavedAt?: string | null;
  manualSaveToastToken?: number;
  onOpenSettings?: () => void;
  onReset: () => void;
  onDraftStateChange?: (draftState: PdpEditorDraftState) => void;
  onManualSave?: () => void;
  apiConnectionLabel?: string;
  referenceModelImage?: PreparedImageDraft | null;
  referenceModelUsage?: ReferenceModelUsage | null;
  saveState?: "idle" | "saving" | "saved" | "error";
}

interface ImageColorRecommendations {
  photoColors: string[];
  recommendedTextColors: string[];
  recommendedShapeColors: string[];
  accentColor: string;
  darkColor: string;
  lightColor: string;
}

const FONT_OPTIONS = [
  { label: "Pretendard", value: "'Pretendard', sans-serif" },
  { label: "Noto Sans KR", value: "'Noto Sans KR', sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Monospace", value: "monospace" }
];

const STYLE_OPTIONS: Array<{ value: NonNullable<ImageGenOptions["style"]>; label: string; description: string }> = [
  { value: "studio", label: "스튜디오컷", description: "정제된 배경과 집중도 높은 제품 연출" },
  { value: "lifestyle", label: "라이프스타일컷", description: "실사용 장면과 감정선이 느껴지는 연출" },
  { value: "outdoor", label: "아웃도어컷", description: "씬이 살아있는 외부 공간 연출" }
];

const MODEL_GENDER_OPTIONS: Array<{ value: NonNullable<ImageGenOptions["modelGender"]>; label: string }> = [
  { value: "female", label: "여자 모델" },
  { value: "male", label: "남자 모델" }
];

const MODEL_AGE_OPTIONS: Array<{ value: NonNullable<ImageGenOptions["modelAgeRange"]>; label: string }> = [
  { value: "teen", label: "10대 후반" },
  { value: "20s", label: "20대" },
  { value: "30s", label: "30대" },
  { value: "40s", label: "40대" },
  { value: "50s_plus", label: "50대+" }
];

const MODEL_COUNTRY_OPTIONS: Array<{ value: NonNullable<ImageGenOptions["modelCountry"]>; label: string }> = [
  { value: "korea", label: "한국" },
  { value: "japan", label: "일본" },
  { value: "usa", label: "미국" },
  { value: "france", label: "프랑스" },
  { value: "germany", label: "독일" },
  { value: "africa", label: "아프리카" }
];

const FONT_WEIGHT_OPTIONS = [
  { value: "400", label: "Regular" },
  { value: "500", label: "Medium" },
  { value: "700", label: "Bold" },
  { value: "900", label: "Black" }
];

const ALIGN_OPTIONS: Array<{ value: OverlayTextAlign; label: string; Icon: typeof AlignLeft }> = [
  { value: "left", label: "왼쪽", Icon: AlignLeft },
  { value: "center", label: "가운데", Icon: AlignCenter },
  { value: "right", label: "오른쪽", Icon: AlignRight }
];

const DEFAULT_COLOR_RECOMMENDATIONS: ImageColorRecommendations = {
  photoColors: ["#e8ddcb", "#102532", "#7a6b5a", "#d5b692"],
  recommendedTextColors: ["#ffffff", "#102532", "#f4efe6", "#4cb7aa"],
  recommendedShapeColors: ["#102532", "#1d3748", "#f4efe6", "#85735e", "#c8474d"],
  accentColor: "#4cb7aa",
  darkColor: "#102532",
  lightColor: "#f4efe6"
};
const BASIC_SOLID_COLORS = [
  "#ffffff",
  "#f4efe6",
  "#d9d2c3",
  "#c4b8a0",
  "#c8474d",
  "#e05a63",
  "#102532",
  "#1d3748",
  "#4cb7aa",
  "#cf6f52",
  "#d8b65b",
  "#111111"
];
export function PdpEditor({
  initialResult,
  aspectRatio,
  geminiApiKey,
  desiredTone,
  initialDraftState,
  lastSavedAt,
  manualSaveToastToken = 0,
  onOpenSettings,
  onReset,
  onDraftStateChange,
  onManualSave,
  apiConnectionLabel = "키 필요",
  referenceModelImage = null,
  referenceModelUsage = null,
  saveState = "idle"
}: PdpEditorProps) {
  const [currentSectionIndex, setCurrentSectionIndex] = useState(() => initialDraftState?.currentSectionIndex ?? 0);
  const [sections, setSections] = useState(() =>
    initialDraftState?.sections?.length
      ? initialDraftState.sections.map((section) => normalizeSectionCopyFields({ ...section }))
      : initialResult.blueprint.sections.map((section) => normalizeSectionCopyFields({ ...section }))
  );
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState(
    () => initialDraftState?.notice ?? "섹션 컷을 고르고 텍스트를 배치한 뒤 바로 다운로드할 수 있습니다."
  );
  const [sectionOptions, setSectionOptions] = useState<Record<number, ImageGenOptions>>(
    () => normalizeSectionOptions(initialDraftState?.sectionOptions ?? {}, referenceModelUsage)
  );
  const [overlaysBySection, setOverlaysBySection] = useState<Record<number, CanvasLayer[]>>(
    () => normalizeOverlayRecord(initialDraftState?.overlaysBySection ?? {})
  );
  const [defaultCopyLanguage, setDefaultCopyLanguage] = useState<PdpCopyLanguage>(
    () => initialDraftState?.defaultCopyLanguage ?? "ko"
  );
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
  const [editingOverlayId, setEditingOverlayId] = useState<string | null>(null);
  const [activeColorPalette, setActiveColorPalette] = useState<null | { layerId: string; role: "text" | "shape" | "shadow" }>(null);
  const [colorRecommendations, setColorRecommendations] = useState<ImageColorRecommendations>(DEFAULT_COLOR_RECOMMENDATIONS);
  const [inspectorSections, setInspectorSections] = useState({
    shotMood: true,
    persona: true
  });
  const [workbenchTab, setWorkbenchTab] = useState<WorkbenchTab>(() => initialDraftState?.workbenchTab ?? "image");
  const [workbenchState, setWorkbenchState] = useState<FloatingWorkbenchState>(
    () =>
      initialDraftState?.workbenchState ?? {
        x: 756,
        y: 24,
        width: 332,
        height: 500,
        isOpen: true
      }
  );
  const [showSaveToast, setShowSaveToast] = useState(false);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const previewStageRef = useRef<HTMLDivElement>(null);
  const resizeSessionRef = useRef<Record<string, { width: number; height: number; fontSize: number }>>({});

  const currentSection = sections[currentSectionIndex];
  const currentLayers = overlaysBySection[currentSectionIndex] ?? [];
  const currentTextLayers = currentLayers.filter(isTextLayer);
  const currentShapeLayers = currentLayers.filter(isShapeLayer);
  const selectedLayer = currentLayers.find((overlay) => overlay.id === selectedOverlayId) ?? null;
  const selectedTextLayer = selectedLayer && isTextLayer(selectedLayer) ? selectedLayer : null;
  const selectedShapeLayer = selectedLayer && isShapeLayer(selectedLayer) ? selectedLayer : null;
  const generatedCount = sections.filter((section) => Boolean(section.generatedImage)).length;
  const blueprintList = initialResult.blueprint.blueprintList.filter(Boolean);
  const toneLabel = desiredTone || "AI 자동 추천";
  const progressPercent = sections.length ? Math.round(((currentSectionIndex + 1) / sections.length) * 100) : 0;

  useEffect(() => {
    setSelectedOverlayId(null);
    setEditingOverlayId(null);
    setActiveColorPalette(null);
    setErrorMessage("");
  }, [currentSectionIndex]);

  useEffect(() => {
    if (!selectedLayer) {
      return;
    }

    setWorkbenchState((current) => ({
      ...current,
      isOpen: true
    }));
  }, [currentSectionIndex, selectedLayer]);

  useEffect(() => {
    if (!previewStageRef.current) {
      return;
    }

    setWorkbenchState((current) => clampWorkbenchToStage(current, previewStageRef.current));
  }, [currentSectionIndex, currentSection.generatedImage]);

  useEffect(() => {
    onDraftStateChange?.({
      currentSectionIndex,
      sections,
      sectionOptions,
      overlaysBySection,
      defaultCopyLanguage,
      notice,
      workbenchTab,
      workbenchState
    });
  }, [currentSectionIndex, defaultCopyLanguage, notice, onDraftStateChange, overlaysBySection, sectionOptions, sections, workbenchState, workbenchTab]);

  useEffect(() => {
    let isCancelled = false;

    if (!currentSection.generatedImage) {
      setColorRecommendations(DEFAULT_COLOR_RECOMMENDATIONS);
      return;
    }

    void extractImageColorRecommendations(currentSection.generatedImage).then((next) => {
      if (!isCancelled) {
        setColorRecommendations(next);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [currentSection.generatedImage]);

  useEffect(() => {
    if (!manualSaveToastToken) {
      return;
    }

    setShowSaveToast(true);
    const timeout = window.setTimeout(() => {
      setShowSaveToast(false);
    }, 2200);

    return () => window.clearTimeout(timeout);
  }, [manualSaveToastToken]);

  const textColorRecommendations = useMemo(
    () => sortColorsByContrast(colorRecommendations.recommendedTextColors, selectedTextLayer?.color ?? null),
    [colorRecommendations.recommendedTextColors, selectedTextLayer?.color]
  );
  const shapeColorRecommendations = useMemo(
    () => sortColorsByContrast(colorRecommendations.recommendedShapeColors, selectedShapeLayer?.fillColor ?? null),
    [colorRecommendations.recommendedShapeColors, selectedShapeLayer?.fillColor]
  );
  const photoColorRecommendations = useMemo(() => uniqueColors(colorRecommendations.photoColors), [colorRecommendations.photoColors]);

  const currentOptions = useMemo(() => {
    return normalizeImageOptions(
      sectionOptions[currentSectionIndex],
      referenceModelUsage === "all-sections" ? true : currentSectionIndex === 0
    );
  }, [currentSectionIndex, referenceModelUsage, sectionOptions]);
  const referenceModelAppliesToCurrentSection = Boolean(
    referenceModelImage &&
      referenceModelUsage &&
      (referenceModelUsage === "all-sections" || currentSectionIndex === 0)
  );
  const usesReferenceModel = Boolean(currentOptions.withModel && referenceModelAppliesToCurrentSection);
  const personaLockedMessage = usesReferenceModel
    ? referenceModelUsage === "all-sections"
      ? "모델 일관성 유지 선택으로 타깃 페르소나가 비활성화되었습니다."
      : "히어로우 전용 업로드 모델이 적용되어 타깃 페르소나가 비활성화되었습니다."
    : "";

  if (!currentSection) {
    return (
      <main className={styles.page}>
        <section className={styles.editorShell}>
          <div className={styles.errorBanner}>섹션 정보를 불러오지 못했습니다.</div>
        </section>
      </main>
    );
  }

  const setCurrentOptions = (updates: Partial<ImageGenOptions>) => {
    setSectionOptions((current) => ({
      ...current,
      [currentSectionIndex]: {
        ...currentOptions,
        ...updates
      }
    }));
  };

  const updateTextOverlayContent = (overlayId: string, nextText: string) => {
    setOverlaysBySection((current) => ({
      ...current,
      [currentSectionIndex]: (current[currentSectionIndex] ?? []).map((overlay) => {
        if (overlay.id !== overlayId || !isTextLayer(overlay)) {
          return overlay;
        }

        return normalizeTextOverlay({
          ...overlay,
          text: nextText,
          translations: {
            ...overlay.translations,
            [overlay.language]: nextText
          }
        });
      })
    }));
  };

  const handleOverlayLanguageChange = (overlay: TextOverlay, nextLanguage: PdpCopyLanguage) => {
    if (overlay.language === nextLanguage) {
      return;
    }

    setDefaultCopyLanguage(nextLanguage);
    updateOverlay(overlay.id, applyLanguageToTextOverlay(overlay, nextLanguage));
  };

  const handleTextAlignChange = (overlay: TextOverlay, nextAlign: OverlayTextAlign) => {
    const currentWidth = toNumericSize(overlay.width, 320);
    const recommendedWidth = clampValue(Math.round(overlay.fontSize * 10), 220, 520);
    const nextWidth = Math.max(currentWidth, recommendedWidth);

    updateOverlay(overlay.id, {
      textAlign: nextAlign,
      width: nextWidth
    });

    if (nextWidth > currentWidth) {
      setNotice("줄맞춤이 잘 보이도록 텍스트 박스 폭도 함께 넓혔습니다.");
    }
  };

  const stopShellClick = (event: ReactMouseEvent<HTMLElement>) => {
    event.stopPropagation();
  };

  const clearLayerSelection = () => {
    setSelectedOverlayId(null);
    setEditingOverlayId(null);
    setActiveColorPalette(null);
  };

  const toggleInspectorSection = (key: keyof typeof inspectorSections) => {
    setInspectorSections((current) => ({
      ...current,
      [key]: !current[key]
    }));
  };

  const openWorkbench = (tab: WorkbenchTab) => {
    setWorkbenchTab(tab);
    setWorkbenchState((current) => {
      const fallback = getWorkbenchPosition(previewStageRef.current);

      return {
        ...(current.isOpen ? current : fallback),
        isOpen: true
      };
    });
  };

  const snapWorkbenchToEdge = () => {
    const nextPosition = getWorkbenchPosition(previewStageRef.current);
    setWorkbenchState((current) => ({
      ...current,
      ...nextPosition,
      isOpen: true
    }));
  };

  const snapWorkbenchToOverlay = () => {
    if (!selectedLayer) {
      return;
    }

    setWorkbenchState((current) => ({
      ...current,
      ...anchorWorkbenchToOverlay(selectedLayer, imageContainerRef.current, previewStageRef.current, current),
      isOpen: true
    }));
  };

  const renderColorPaletteField = ({
    label,
    layerId,
    role,
    currentColor,
    recommendedColors,
    onSelect
  }: {
    label: string;
    layerId: string;
    role: "text" | "shape" | "shadow";
    currentColor: string;
    recommendedColors: string[];
    onSelect: (color: string) => void;
  }) => {
    const isOpen = activeColorPalette?.layerId === layerId && activeColorPalette.role === role;

    return (
      <label className={styles.floatingField}>
        <span className={styles.optionMiniLabel}>{label}</span>
        <div className={styles.colorFieldStack}>
          <button
            className={styles.colorTriggerButton}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setActiveColorPalette((current) =>
                current?.layerId === layerId && current.role === role ? null : { layerId, role }
              );
            }}
            style={{ ["--swatch-color" as string]: currentColor }}
            type="button"
          >
            <span className={styles.colorTriggerPreview} />
            <code>{currentColor}</code>
          </button>

          {isOpen ? (
            <div className={styles.colorPopover}>
              <div className={styles.paletteSection}>
                <span className={styles.optionMiniLabel}>사진 색상</span>
                <div className={styles.swatchGridWide}>
                  {photoColorRecommendations.map((color) => (
                    <button
                      className={styles.swatchButton}
                      key={`${role}-photo-${color}`}
                      onClick={() => {
                        onSelect(color);
                        setActiveColorPalette(null);
                      }}
                      style={{ ["--swatch-color" as string]: color }}
                      type="button"
                    >
                      <span className={styles.swatchPreview} />
                      <code>{color}</code>
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.paletteSection}>
                <span className={styles.optionMiniLabel}>기본 단색</span>
                <div className={styles.swatchGridWide}>
                  {BASIC_SOLID_COLORS.map((color) => (
                    <button
                      className={styles.swatchButton}
                      key={`${role}-basic-${color}`}
                      onClick={() => {
                        onSelect(color);
                        setActiveColorPalette(null);
                      }}
                      style={{ ["--swatch-color" as string]: color }}
                      type="button"
                    >
                      <span className={styles.swatchPreview} />
                      <code>{color}</code>
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.paletteSection}>
                <span className={styles.optionMiniLabel}>어울리는 컬러 추천</span>
                <div className={styles.swatchGridWide}>
                  {recommendedColors.map((color) => (
                    <button
                      className={styles.swatchButton}
                      key={`${role}-recommended-${color}`}
                      onClick={() => {
                        onSelect(color);
                        setActiveColorPalette(null);
                      }}
                      style={{ ["--swatch-color" as string]: color }}
                      type="button"
                    >
                      <span className={styles.swatchPreview} />
                      <code>{color}</code>
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.colorInputRow}>
                <input
                  className={styles.colorInputLarge}
                  onChange={(event) => onSelect(event.target.value)}
                  type="color"
                  value={currentColor}
                />
                <button className={styles.inlineButton} onClick={() => setActiveColorPalette(null)} type="button">
                  닫기
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </label>
    );
  };

  const renderWorkbenchBody = () => {
    switch (workbenchTab) {
      case "image":
        return (
          <div className={styles.workbenchSectionStack}>
            <div className={styles.optionSummaryBar}>
              <span className={styles.summaryChip}>
                {STYLE_OPTIONS.find((option) => option.value === currentOptions.style)?.label ?? "스튜디오컷"}
              </span>
              <span className={styles.summaryChip}>{selectedModelSummary}</span>
              <span className={styles.summaryChip}>
                {currentOptions.guidePriorityMode === "guide-first" ? "디자인 가이드 우선" : "컷 타입 우선"}
              </span>
            </div>

            <div className={styles.optionSurface}>
              <div className={styles.optionSectionHeader}>
                <div>
                  <span className={styles.optionSectionEyebrow}>샷 타입</span>
                  <strong>배경과 연출 무드</strong>
                </div>
                <button className={styles.sectionToggleButton} onClick={() => toggleInspectorSection("shotMood")} type="button">
                  {inspectorSections.shotMood ? "숨기기" : "보이기"}
                  {inspectorSections.shotMood ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
              </div>
              {inspectorSections.shotMood ? (
                <>
                  <div className={styles.styleOptionGrid}>
                    {STYLE_OPTIONS.map((style) => (
                      <button
                        className={currentOptions.style === style.value ? styles.styleCardActive : styles.styleCard}
                        key={style.value}
                        onClick={() => setCurrentOptions({ style: style.value })}
                        type="button"
                      >
                        <strong>{style.label}</strong>
                        <small>{style.description}</small>
                      </button>
                    ))}
                  </div>

                  <label className={styles.toggleCard}>
                    <div className={styles.toggleCardCopy}>
                      <strong>디자인 가이드 우선</strong>
                      <span>
                        {currentOptions.guidePriorityMode === "guide-first"
                          ? "Image Purpose, Layout Notes, Style Guide를 함께 반영합니다."
                          : "Image Purpose만 유지하고, 선택한 컷 타입을 우선해 이미지를 설계합니다."}
                      </span>
                    </div>
                    <input
                      checked={currentOptions.guidePriorityMode === "guide-first"}
                      onChange={(event) =>
                        setCurrentOptions({
                          guidePriorityMode: event.target.checked ? "guide-first" : "style-first"
                        })
                      }
                      type="checkbox"
                    />
                  </label>
                </>
              ) : (
                <p className={styles.collapsedHint}>
                  현재 선택: {STYLE_OPTIONS.find((style) => style.value === currentOptions.style)?.label ?? "스튜디오컷"} ·{" "}
                  {currentOptions.guidePriorityMode === "guide-first" ? "디자인 가이드 우선" : "컷 타입 우선"}
                </p>
              )}
            </div>

            <div className={styles.optionSurface}>
              <div className={styles.optionSectionHeader}>
                <div>
                  <span className={styles.optionSectionEyebrow}>모델 설정</span>
                  <strong>타깃 페르소나 지정</strong>
                </div>
                <div className={styles.optionHeaderTools}>
                  <User size={16} />
                  <button className={styles.sectionToggleButton} onClick={() => toggleInspectorSection("persona")} type="button">
                    {inspectorSections.persona ? "숨기기" : "보이기"}
                    {inspectorSections.persona ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                </div>
              </div>
              {inspectorSections.persona ? (
                <>
                  <label className={styles.toggleCard}>
                    <div className={styles.toggleCardCopy}>
                      <strong>모델컷 포함</strong>
                      <span>
                        {referenceModelImage
                          ? "제품과 함께 연출되는 인물컷이 필요하면 켜 두세요. 업로드 모델이 적용되는 구간에서는 동일 인물이 유지됩니다."
                          : "제품과 함께 연출되는 인물컷이 필요한 경우 켜 두세요."}
                      </span>
                    </div>
                    <input
                      checked={currentOptions.withModel}
                      onChange={(event) => setCurrentOptions({ withModel: event.target.checked })}
                      type="checkbox"
                    />
                  </label>

                  {currentOptions.withModel ? (
                    <div className={styles.optionStack}>
                      {usesReferenceModel ? (
                        <div className={styles.lockedHint}>
                          <AlertCircle size={15} />
                          <div>
                            <strong>{referenceModelUsage === "all-sections" ? "전체 일관성 유지 적용 중" : "히어로우 업로드 모델 적용 중"}</strong>
                            <span>{personaLockedMessage}</span>
                          </div>
                        </div>
                      ) : null}

                      <div className={styles.optionFieldBlock}>
                        <span className={styles.optionMiniLabel}>성별</span>
                        <div className={styles.segmentedRow}>
                          {MODEL_GENDER_OPTIONS.map((option) => (
                            <button
                              className={currentOptions.modelGender === option.value ? styles.segmentedButtonActive : styles.segmentedButton}
                              disabled={usesReferenceModel}
                              key={option.value}
                              onClick={() => setCurrentOptions({ modelGender: option.value })}
                              type="button"
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className={styles.optionFieldBlock}>
                        <span className={styles.optionMiniLabel}>연령대</span>
                        <div className={styles.segmentedGridCompact}>
                          {MODEL_AGE_OPTIONS.map((option) => (
                            <button
                              className={currentOptions.modelAgeRange === option.value ? styles.segmentedButtonActive : styles.segmentedButton}
                              disabled={usesReferenceModel}
                              key={option.value}
                              onClick={() => setCurrentOptions({ modelAgeRange: option.value })}
                              type="button"
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className={styles.optionFieldBlock}>
                        <div className={styles.optionFieldHeader}>
                          <span className={styles.optionMiniLabel}>국가</span>
                          <Globe2 size={14} />
                        </div>
                        <div className={styles.countryGrid}>
                          {MODEL_COUNTRY_OPTIONS.map((option) => (
                            <button
                              className={currentOptions.modelCountry === option.value ? styles.countryCardActive : styles.countryCard}
                              disabled={usesReferenceModel}
                              key={option.value}
                              onClick={() => setCurrentOptions({ modelCountry: option.value })}
                              type="button"
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : (
                <p className={styles.collapsedHint}>현재 설정: {selectedModelSummary}</p>
              )}
            </div>

            <button className={styles.primaryButtonWide} disabled={isGeneratingImage} onClick={handleGenerateImage} type="button">
              {isGeneratingImage ? <Loader2 className={styles.spinIcon} size={16} /> : currentSection.generatedImage ? <RefreshCw size={16} /> : <ImageIcon size={16} />}
              {currentSection.generatedImage ? "이미지 다시 만들기" : "이미지 생성하기"}
            </button>

            <p className={styles.inspectorHelper}>
              {usesReferenceModel
                ? "업로드한 모델 이미지를 참조하면서 현재 섹션 컷만 다시 생성합니다."
                : "섹션 헤드라인과 지금 선택한 모델 조건을 반영해 현재 컷만 다시 생성합니다."}
            </p>
          </div>
        );
      case "layer":
        return selectedTextLayer ? (
            <div className={styles.workbenchSectionStack}>
              <div className={styles.toolbarRow}>
                <button className={styles.inlineDangerButton} onClick={() => deleteOverlay(selectedTextLayer.id)} type="button">
                  <Trash2 size={14} />
                  삭제
                </button>
              </div>

            <label className={styles.floatingField}>
              <div className={styles.fieldHeaderInline}>
                <span className={styles.optionMiniLabel}>텍스트 내용</span>
                <div className={styles.languageControlRow}>
                  <select
                    className={styles.miniSelect}
                    onChange={(event) => handleOverlayLanguageChange(selectedTextLayer, event.target.value as PdpCopyLanguage)}
                    value={selectedTextLayer.language}
                  >
                    <option value="ko">한국어</option>
                    <option value="en">영어</option>
                  </select>
                </div>
              </div>
              <textarea
                className={styles.floatingTextarea}
                onChange={(event) => updateTextOverlayContent(selectedTextLayer.id, event.target.value)}
                rows={3}
                value={selectedTextLayer.text}
              />
            </label>

            <div className={styles.floatingCompactGrid}>
              <label className={styles.floatingField}>
                <span className={styles.optionMiniLabel}>폰트</span>
                <select
                  className={styles.select}
                  onChange={(event) => updateOverlay(selectedTextLayer.id, { fontFamily: event.target.value })}
                  value={selectedTextLayer.fontFamily}
                >
                  {FONT_OPTIONS.map((option) => (
                    <option key={option.label} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className={styles.floatingField}>
                <span className={styles.optionMiniLabel}>굵기</span>
                <select
                  className={styles.select}
                  onChange={(event) => updateOverlay(selectedTextLayer.id, { fontWeight: event.target.value })}
                  value={selectedTextLayer.fontWeight}
                >
                  {FONT_WEIGHT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className={styles.floatingCompactGrid}>
              <label className={styles.floatingField}>
                <span className={styles.optionMiniLabel}>폭</span>
                <input
                  className={styles.input}
                  min={80}
                  onChange={(event) =>
                    updateOverlay(selectedTextLayer.id, {
                      width: clampValue(Number(event.target.value) || 320, 80, 1200)
                    })
                  }
                  type="number"
                  value={toNumericSize(selectedTextLayer.width, 320)}
                />
              </label>

              <label className={styles.floatingField}>
                <span className={styles.optionMiniLabel}>크기</span>
                <div className={styles.rangeField}>
                  <input
                    className={styles.rangeInput}
                    max={180}
                    min={10}
                    onChange={(event) => updateOverlay(selectedTextLayer.id, { fontSize: Number(event.target.value) || 16 })}
                    type="range"
                    value={selectedTextLayer.fontSize}
                  />
                  <input
                    className={styles.input}
                    min={10}
                    onChange={(event) => updateOverlay(selectedTextLayer.id, { fontSize: Number(event.target.value) || 16 })}
                    type="number"
                    value={selectedTextLayer.fontSize}
                  />
                </div>
              </label>

              <label className={styles.floatingField}>
                <span className={styles.optionMiniLabel}>줄 간격</span>
                <div className={styles.rangeField}>
                  <input
                    className={styles.rangeInput}
                    max={3}
                    min={0.8}
                    onChange={(event) => updateOverlay(selectedTextLayer.id, { lineHeight: Number(event.target.value) || 1.2 })}
                    step={0.1}
                    type="range"
                    value={selectedTextLayer.lineHeight}
                  />
                  <input
                    className={styles.input}
                    max={3}
                    min={0.8}
                    onChange={(event) => updateOverlay(selectedTextLayer.id, { lineHeight: Number(event.target.value) || 1.2 })}
                    step={0.1}
                    type="number"
                    value={selectedTextLayer.lineHeight}
                  />
                </div>
              </label>
            </div>

            <div className={styles.optionSurface}>
              <div className={styles.optionSectionHeader}>
                <div>
                  <span className={styles.optionSectionEyebrow}>Color palette</span>
                  <strong>글자색</strong>
                </div>
                <Palette size={16} />
              </div>
              {renderColorPaletteField({
                label: "글자색",
                layerId: selectedTextLayer.id,
                role: "text",
                currentColor: selectedTextLayer.color,
                recommendedColors: textColorRecommendations,
                onSelect: (color) => updateOverlay(selectedTextLayer.id, { color })
              })}
            </div>

            <div className={styles.optionSurface}>
              <div className={styles.optionSectionHeader}>
                <div>
                  <span className={styles.optionSectionEyebrow}>Shadow</span>
                  <strong>가독성 그림자</strong>
                </div>
                <Sparkles size={16} />
              </div>
              <label className={styles.toggleCard}>
                <div className={styles.toggleCardCopy}>
                  <strong>그림자 사용</strong>
                  <span>밝은 이미지 위에서도 텍스트가 묻히지 않도록 깊이를 더합니다.</span>
                </div>
                <input
                  checked={selectedTextLayer.shadowEnabled}
                  onChange={(event) => updateOverlay(selectedTextLayer.id, { shadowEnabled: event.target.checked })}
                  type="checkbox"
                />
              </label>

              {selectedTextLayer.shadowEnabled ? (
                <>
                  {renderColorPaletteField({
                    label: "그림자색",
                    layerId: selectedTextLayer.id,
                    role: "shadow",
                    currentColor: selectedTextLayer.shadowColor,
                    recommendedColors: [colorRecommendations.darkColor, "#000000", colorRecommendations.accentColor],
                    onSelect: (color) => updateOverlay(selectedTextLayer.id, { shadowColor: color })
                  })}
                  <div className={styles.floatingCompactGrid}>
                    <label className={styles.floatingField}>
                      <span className={styles.optionMiniLabel}>강도</span>
                      <div className={styles.rangeField}>
                        <input className={styles.rangeInput} max={1} min={0} step={0.05} type="range" value={selectedTextLayer.shadowOpacity} onChange={(event) => updateOverlay(selectedTextLayer.id, { shadowOpacity: Number(event.target.value) || 0 })} />
                        <input className={styles.input} max={1} min={0} step={0.05} type="number" value={selectedTextLayer.shadowOpacity} onChange={(event) => updateOverlay(selectedTextLayer.id, { shadowOpacity: Number(event.target.value) || 0 })} />
                      </div>
                    </label>
                    <label className={styles.floatingField}>
                      <span className={styles.optionMiniLabel}>흐림</span>
                      <div className={styles.rangeField}>
                        <input className={styles.rangeInput} max={40} min={0} step={1} type="range" value={selectedTextLayer.shadowBlur} onChange={(event) => updateOverlay(selectedTextLayer.id, { shadowBlur: Number(event.target.value) || 0 })} />
                        <input className={styles.input} max={40} min={0} step={1} type="number" value={selectedTextLayer.shadowBlur} onChange={(event) => updateOverlay(selectedTextLayer.id, { shadowBlur: Number(event.target.value) || 0 })} />
                      </div>
                    </label>
                    <label className={styles.floatingField}>
                      <span className={styles.optionMiniLabel}>거리</span>
                      <div className={styles.rangeField}>
                        <input className={styles.rangeInput} max={24} min={-24} step={1} type="range" value={selectedTextLayer.shadowOffsetY} onChange={(event) => updateOverlay(selectedTextLayer.id, { shadowOffsetY: Number(event.target.value) || 0 })} />
                        <input className={styles.input} max={24} min={-24} step={1} type="number" value={selectedTextLayer.shadowOffsetY} onChange={(event) => updateOverlay(selectedTextLayer.id, { shadowOffsetY: Number(event.target.value) || 0 })} />
                      </div>
                    </label>
                  </div>
                </>
              ) : null}
            </div>

            <div className={styles.floatingField}>
              <span className={styles.optionMiniLabel}>정렬</span>
              <div className={styles.alignButtonGroup}>
                {ALIGN_OPTIONS.map(({ value, label, Icon }) => (
                  <button
                    className={selectedTextLayer.textAlign === value ? styles.alignButtonActive : styles.alignButton}
                    key={value}
                    onClick={() => handleTextAlignChange(selectedTextLayer, value)}
                    type="button"
                  >
                    <Icon size={15} />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : selectedShapeLayer ? (
          <div className={styles.workbenchSectionStack}>
            <div className={styles.toolbarRow}>
              <p className={styles.floatingHint}>사각형은 이미지 위, 텍스트 아래에 깔리는 독립 배경 오브젝트입니다.</p>
              <button className={styles.inlineDangerButton} onClick={() => deleteOverlay(selectedShapeLayer.id)} type="button">
                <Trash2 size={14} />
                삭제
              </button>
            </div>

            <div className={styles.optionSurface}>
              <div className={styles.optionSectionHeader}>
                <div>
                  <span className={styles.optionSectionEyebrow}>Shape fill</span>
                  <strong>배경 사각형 색상</strong>
                </div>
                <Palette size={16} />
              </div>
              {renderColorPaletteField({
                label: "채우기 색상",
                layerId: selectedShapeLayer.id,
                role: "shape",
                currentColor: selectedShapeLayer.fillColor,
                recommendedColors: shapeColorRecommendations,
                onSelect: (color) => updateOverlay(selectedShapeLayer.id, { fillColor: color })
              })}
            </div>

            <div className={styles.floatingCompactGrid}>
              <label className={styles.floatingField}>
                <span className={styles.optionMiniLabel}>투명도</span>
                <div className={styles.rangeField}>
                  <input className={styles.rangeInput} max={1} min={0} step={0.05} type="range" value={selectedShapeLayer.fillOpacity} onChange={(event) => updateOverlay(selectedShapeLayer.id, { fillOpacity: Number(event.target.value) || 0 })} />
                  <input className={styles.input} max={1} min={0} step={0.05} type="number" value={selectedShapeLayer.fillOpacity} onChange={(event) => updateOverlay(selectedShapeLayer.id, { fillOpacity: Number(event.target.value) || 0 })} />
                </div>
              </label>
              <label className={styles.floatingField}>
                <span className={styles.optionMiniLabel}>모서리</span>
                <div className={styles.rangeField}>
                  <input className={styles.rangeInput} max={48} min={0} step={1} type="range" value={selectedShapeLayer.borderRadius} onChange={(event) => updateOverlay(selectedShapeLayer.id, { borderRadius: Number(event.target.value) || 0 })} />
                  <input className={styles.input} max={48} min={0} step={1} type="number" value={selectedShapeLayer.borderRadius} onChange={(event) => updateOverlay(selectedShapeLayer.id, { borderRadius: Number(event.target.value) || 0 })} />
                </div>
              </label>
            </div>
          </div>
        ) : (
          <div className={styles.inspectorEmpty}>
            <Type size={18} />
            <div>
              <strong>텍스트나 사각형을 선택해 주세요</strong>
              <p>캔버스의 텍스트나 배경 사각형을 클릭하면 이 패널에서 바로 편집할 수 있습니다.</p>
              <div className={styles.inspectorEmptyActions}>
                <button className={styles.copyUtilityButton} onClick={handleAddShapeLayer} type="button">
                  <Square size={15} />
                  배경 사각형 추가
                </button>
              </div>
            </div>
          </div>
        );
      case "copy":
        return (
          <div className={styles.copyLibrary}>
            <div className={styles.copySection}>
              <p className={styles.cardLabel}>Layout Object</p>
              <button className={styles.copyUtilityButton} onClick={handleAddShapeLayer} type="button">
                <Palette size={15} />
                배경 사각형 추가
              </button>
            </div>

            <div className={styles.copySection}>
              <p className={styles.cardLabel}>Headline</p>
              <button
                className={styles.copyBlock}
                onClick={() =>
                  handleAddTextOverlay(
                    {
                      ko: currentSection.headline,
                      en: currentSection.headline_en
                    },
                    "headline"
                  )
                }
                type="button"
              >
                {getLocalizedCopy(currentSection.headline, currentSection.headline_en, defaultCopyLanguage)}
              </button>
            </div>

            <div className={styles.copySection}>
              <p className={styles.cardLabel}>Subheadline</p>
              <button
                className={styles.copyBlockSoft}
                onClick={() =>
                  handleAddTextOverlay(
                    {
                      ko: currentSection.subheadline,
                      en: currentSection.subheadline_en
                    },
                    "subheadline"
                  )
                }
                type="button"
              >
                {getLocalizedCopy(currentSection.subheadline, currentSection.subheadline_en, defaultCopyLanguage)}
              </button>
            </div>

            {currentSection.bullets.length ? (
              <div className={styles.copySection}>
                <p className={styles.cardLabel}>Key Points</p>
                <div className={styles.bulletStack}>
                  {getLocalizedBullets(currentSection, defaultCopyLanguage).map((bullet, index) => (
                    <button
                      className={styles.bulletButton}
                      key={`${bullet}-${index}`}
                      onClick={() =>
                        handleAddTextOverlay(
                          {
                            ko: currentSection.bullets[index] ?? bullet,
                            en: currentSection.bullets_en[index] ?? currentSection.bullets[index] ?? bullet
                          },
                          "keypoint"
                        )
                      }
                      type="button"
                    >
                      <CheckCircle2 size={14} />
                      {bullet}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {currentSection.trust_or_objection_line ? (
              <div className={styles.trustBox}>
                <p className={styles.cardLabel}>Trust / Objection</p>
                <p>
                  {getLocalizedCopy(
                    currentSection.trust_or_objection_line,
                    currentSection.trust_or_objection_line_en,
                    defaultCopyLanguage
                  )}
                </p>
              </div>
            ) : null}

            {currentSection.CTA ? (
              <button className={styles.ctaPreview} type="button">
                {getLocalizedCopy(currentSection.CTA, currentSection.CTA_en, defaultCopyLanguage)}
              </button>
            ) : null}
          </div>
        );
      case "guide":
      default:
        return (
          <div className={styles.workbenchSectionStack}>
            <div className={styles.guidelineGrid}>
              <div>
                <strong>Guide Mode</strong>
                <p>{currentOptions.guidePriorityMode === "guide-first" ? "디자인 가이드 우선" : "컷 타입 우선"}</p>
              </div>
              <div>
                <strong>Image Purpose</strong>
                <p>{currentSection.purpose}</p>
              </div>
              <div>
                <strong>Layout Notes</strong>
                <p>{currentOptions.guidePriorityMode === "guide-first" ? currentSection.layout_notes : "이번 생성에는 적용하지 않음"}</p>
              </div>
              <div>
                <strong>Style Guide</strong>
                <p>{currentOptions.guidePriorityMode === "guide-first" ? currentSection.style_guide : "이번 생성에는 적용하지 않음"}</p>
              </div>
            </div>

            {currentSection.compliance_notes ? (
              <div className={styles.warningBox}>
                <strong>Compliance Notes</strong>
                <p>{currentSection.compliance_notes}</p>
              </div>
            ) : null}
          </div>
        );
    }
  };

  const selectedModelSummary = currentOptions.withModel
    ? usesReferenceModel
      ? referenceModelUsage === "all-sections"
        ? "업로드 모델 일관성 유지"
        : "히어로우 업로드 모델 사용"
      : `${getModelCountryLabel(currentOptions.modelCountry)} ${getModelAgeLabel(currentOptions.modelAgeRange)} ${getModelGenderLabel(currentOptions.modelGender)}`
    : "모델 없이 제품 중심";

  const handleGenerateImage = async () => {
    setIsGeneratingImage(true);
    setErrorMessage("");

    try {
      const response = await apiJson<PdpGenerateImageResponse>("/pdp/images", {
        method: "POST",
        body: JSON.stringify({
          originalImageBase64: initialResult.originalImage,
          section: currentSection,
          aspectRatio,
          desiredTone: desiredTone || undefined,
          options: {
            ...currentOptions,
            headline: currentSection.headline,
            subheadline: currentSection.subheadline,
            isRegeneration: Boolean(currentSection.generatedImage),
            referenceModelImageBase64: usesReferenceModel ? referenceModelImage?.base64 : undefined,
            referenceModelImageMimeType: usesReferenceModel ? referenceModelImage?.mimeType : undefined,
            referenceModelImageFileName: usesReferenceModel ? referenceModelImage?.fileName : undefined
          }
        })
      }, { geminiApiKey });

      setIsGeneratingImage(false);

      if (!response.ok) {
        setErrorMessage(response.message);
        return;
      }

      setSections((current) =>
        current.map((section, index) =>
          index === currentSectionIndex
            ? {
                ...section,
                generatedImage: toDataUrl(response.mimeType, response.imageBase64)
              }
            : section
        )
      );
      setNotice(`${getDisplaySectionName(currentSection)} 이미지를 새 옵션으로 업데이트했습니다.`);
    } catch (error) {
      setIsGeneratingImage(false);
      setErrorMessage(error instanceof Error ? error.message : "이미지를 다시 만들지 못했습니다.");
    }
  };

  const handleAddTextOverlay = (
    translations: Record<PdpCopyLanguage, string>,
    type: "headline" | "subheadline" | "keypoint" | "default" = "default"
  ) => {
    if (!currentSection.generatedImage) {
      setErrorMessage("이미지를 먼저 생성해야 텍스트를 올릴 수 있습니다.");
      return;
    }

    const defaultFontSize =
      type === "headline" ? 42 : type === "subheadline" ? 24 : type === "keypoint" ? 18 : 20;
    const normalizedTranslations = type === "keypoint"
      ? {
          ko: `• ${translations.ko}`,
          en: `• ${translations.en}`
        }
      : translations;
    const displayText = normalizedTranslations[defaultCopyLanguage] || normalizedTranslations.ko;
    const defaultFontWeight = type === "subheadline" ? "500" : "700";
    const estimatedBox = estimateOverlayBox(displayText, {
      fontSize: defaultFontSize,
      fontWeight: defaultFontWeight,
      fontFamily: "'Pretendard', sans-serif",
      lineHeight: 1.2,
      maxWidth: type === "headline" ? 360 : type === "subheadline" ? 320 : 280
    });

    const newOverlay: TextOverlay = {
      id: crypto.randomUUID(),
      kind: "text",
      text: displayText,
      language: defaultCopyLanguage,
      translations: normalizedTranslations,
      x: 52,
      y: 52,
      width: estimatedBox.width,
      height: estimatedBox.height,
      fontSize: defaultFontSize,
      color: "#ffffff",
      backgroundColor: shapeColorRecommendations[0] ?? "#102532",
      backgroundEnabled: false,
      backgroundOpacity: 0.72,
      backgroundRadius: 18,
      fontFamily: "'Pretendard', sans-serif",
      fontWeight: defaultFontWeight,
      textAlign: "left",
      lineHeight: 1.2,
      shadowEnabled: true,
      shadowColor: colorRecommendations.darkColor,
      shadowOpacity: 0.42,
      shadowBlur: 18,
      shadowOffsetY: 6
    };

    setOverlaysBySection((current) => ({
      ...current,
      [currentSectionIndex]: [...(current[currentSectionIndex] ?? []), normalizeTextOverlay(newOverlay)]
    }));
    setSelectedOverlayId(newOverlay.id);
    setWorkbenchState((current) => ({
      ...current,
      isOpen: true
    }));
    setNotice("텍스트를 추가했습니다. 위치와 크기를 직접 조절해 레이아웃을 완성해 보세요.");
  };

  const handleAddShapeLayer = () => {
    if (!currentSection.generatedImage) {
      setErrorMessage("이미지를 먼저 생성해야 배경 사각형을 배치할 수 있습니다.");
      return;
    }

    const newShape: ShapeLayer = normalizeShapeLayer({
      id: crypto.randomUUID(),
      kind: "shape",
      x: 64,
      y: 64,
      width: 260,
      height: 120,
      fillColor: shapeColorRecommendations[0] ?? colorRecommendations.darkColor,
      fillOpacity: 1,
      borderRadius: 0
    });

    setOverlaysBySection((current) => ({
      ...current,
      [currentSectionIndex]: [...(current[currentSectionIndex] ?? []), newShape]
    }));
    setSelectedOverlayId(newShape.id);
    setEditingOverlayId(null);
    setWorkbenchTab("layer");
    setWorkbenchState((current) => ({
      ...current,
      isOpen: true
    }));
    setNotice("배경 사각형을 추가했습니다. 드래그와 리사이즈로 자유롭게 레이아웃을 만들 수 있습니다.");
  };

  const updateOverlay = (overlayId: string, updates: Partial<CanvasLayer>) => {
    setOverlaysBySection((current) => ({
      ...current,
      [currentSectionIndex]: (current[currentSectionIndex] ?? []).map((overlay) =>
        overlay.id === overlayId ? normalizeCanvasLayer({ ...overlay, ...updates }) : overlay
      )
    }));
  };

  const deleteOverlay = (overlayId: string) => {
    setOverlaysBySection((current) => ({
      ...current,
      [currentSectionIndex]: (current[currentSectionIndex] ?? []).filter((overlay) => overlay.id !== overlayId)
    }));
    if (selectedOverlayId === overlayId) {
      setSelectedOverlayId(null);
      setEditingOverlayId(null);
    }
  };

  const handleResizeStart = (overlay: CanvasLayer) => {
    resizeSessionRef.current[overlay.id] = {
      width: toNumericSize(overlay.width, 320),
      height: toNumericSize(overlay.height, 92),
      fontSize: isTextLayer(overlay) ? overlay.fontSize : 0
    };
  };

  const handleResize = (
    overlay: CanvasLayer,
    direction: string,
    ref: HTMLElement,
    position: { x: number; y: number }
  ) => {
    const base = resizeSessionRef.current[overlay.id] ?? {
      width: toNumericSize(overlay.width, 320),
      height: toNumericSize(overlay.height, 92),
      fontSize: isTextLayer(overlay) ? overlay.fontSize : 0
    };

    const nextWidth = ref.offsetWidth;
    const nextHeight = ref.offsetHeight;
    const isHorizontalOnly = direction === "left" || direction === "right";
    const isVerticalOnly = direction === "top" || direction === "bottom";

    if (isHorizontalOnly) {
      updateOverlay(overlay.id, {
        width: nextWidth,
        x: position.x
      });
      return;
    }

    if (isVerticalOnly) {
      updateOverlay(overlay.id, {
        height: nextHeight,
        y: position.y
      });
      return;
    }

    if (isShapeLayer(overlay)) {
      updateOverlay(overlay.id, {
        width: nextWidth,
        height: nextHeight,
        x: position.x,
        y: position.y
      });
      return;
    }

    const scale = Math.max(nextWidth / Math.max(base.width, 1), nextHeight / Math.max(base.height, 1));
    const nextFontSize = clampValue(Math.round(base.fontSize * scale), 10, 180);

    updateOverlay(overlay.id, {
      width: nextWidth,
      height: nextHeight,
      x: position.x,
      y: position.y,
      fontSize: nextFontSize
    });
  };

  const handleResizeStop = (overlayId: string) => {
    delete resizeSessionRef.current[overlayId];
  };

  const handleOverlayDrag = (overlay: CanvasLayer, x: number, y: number) => {
    updateOverlay(overlay.id, {
      x,
      y
    });
  };

  const captureSectionBlob = async (sectionIndex: number) => {
    const section = sections[sectionIndex];
    if (!section?.generatedImage) {
      throw new Error("이미지가 없는 섹션은 다운로드할 수 없습니다.");
    }

    const width = imageContainerRef.current?.clientWidth ?? 460;
    const layers = overlaysBySection[sectionIndex] ?? [];
    const exportNode = await buildExportNode({
      imageSrc: section.generatedImage,
      width,
      layers
    });

    document.body.appendChild(exportNode);

    try {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve());
        });
      });

      const canvas = await html2canvas(exportNode, {
        useCORS: true,
        allowTaint: true,
        backgroundColor: null,
        scale: 2
      });

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, "image/jpeg", 0.92);
      });

      if (!blob) {
        throw new Error("다운로드용 이미지를 만들지 못했습니다.");
      }

      return blob;
    } finally {
      exportNode.remove();
    }
  };

  const handleDownload = async () => {
    if (!currentSection.generatedImage) {
      return;
    }

    try {
      setSelectedOverlayId(null);
      setEditingOverlayId(null);
      setActiveColorPalette(null);
      const blob = await captureSectionBlob(currentSectionIndex);
      downloadBlob(blob, `pdp-${sanitizeSectionFileName(currentSection.section_id)}.jpg`);
      setNotice(`${getDisplaySectionName(currentSection)} 컷을 다운로드했습니다.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "이미지를 다운로드하지 못했습니다.");
    }
  };

  const handleDownloadAll = async () => {
    const downloadableSections = sections
      .map((section, index) => ({ section, index }))
      .filter((entry) => Boolean(entry.section.generatedImage));

    if (!downloadableSections.length) {
      setErrorMessage("다운로드할 이미지가 아직 없습니다.");
      return;
    }

    try {
      setIsDownloadingAll(true);
      setSelectedOverlayId(null);
      setEditingOverlayId(null);
      setActiveColorPalette(null);

      const zip = new JSZip();

      for (const { section, index } of downloadableSections) {
        const blob = await captureSectionBlob(index);
        zip.file(`pdp-${String(index + 1).padStart(2, "0")}-${sanitizeSectionFileName(section.section_id)}.jpg`, blob);
      }

      const archive = await zip.generateAsync({ type: "blob" });
      downloadBlob(archive, `pdp-sections-${new Date().toISOString().slice(0, 10)}.zip`);
      setNotice(`${downloadableSections.length}개 섹션 이미지를 ZIP으로 다운로드했습니다.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "전체 이미지를 ZIP으로 다운로드하지 못했습니다.");
    } finally {
      setIsDownloadingAll(false);
    }
  };

  return (
    <main className={styles.page}>
      <section className={styles.editorShell} onClick={clearLayerSelection}>
        <header className={styles.editorHeader} onClick={stopShellClick}>
          <div>
            <h1 className={styles.editorHeading}>
              <button className={styles.brandHomeButton} onClick={onReset} type="button">
                한이룸의 상세페이지 마법사 2.0
              </button>
            </h1>
            <p className={styles.editorSubcopy}>섹션 컷을 고르고 텍스트를 배치한 뒤 바로 완성본을 저장하세요.</p>
          </div>

          <div className={styles.editorHeaderMeta}>
            <span className={styles.metaPill}>비율 {aspectRatio}</span>
            <span className={styles.metaPill}>톤 {toneLabel}</span>
            <span className={styles.metaPill}>API {apiConnectionLabel}</span>
            <span className={styles.metaPill}>생성됨 {generatedCount}/{sections.length}</span>
            {lastSavedAt ? <span className={styles.metaPill}>최근 저장 {formatSavedAt(lastSavedAt)}</span> : null}
            {saveState === "saving" ? <span className={styles.metaPill}>저장 중</span> : null}
          </div>

          <div className={styles.topbarActions}>
            {onOpenSettings ? (
              <button className={`${styles.secondaryButton} ${styles.headerActionButton}`} onClick={onOpenSettings} type="button">
                <Settings2 size={16} />
                설정
              </button>
            ) : null}
            {onManualSave ? (
              <button className={`${styles.secondaryButton} ${styles.headerActionButton} ${styles.headerSaveButton}`} disabled={saveState === "saving"} onClick={onManualSave} type="button">
                {saveState === "saving" ? <Loader2 className={styles.spinIcon} size={16} /> : <Save size={16} />}
                작업 저장하기
              </button>
            ) : null}
            <button
              className={`${styles.secondaryButton} ${styles.headerActionButton} ${styles.zipDownloadButton}`}
              disabled={!generatedCount || isDownloadingAll}
              onClick={handleDownloadAll}
              type="button"
            >
              {isDownloadingAll ? <Loader2 className={styles.spinIcon} size={16} /> : <Download size={16} />}
              전체 이미지 ZIP
            </button>
            <button className={styles.primaryButton} onClick={handleDownload} type="button" disabled={!currentSection.generatedImage}>
              <Download size={16} />
              현재 섹션 다운로드
            </button>
          </div>
        </header>

        {showSaveToast ? <div className={styles.saveToast}>저장되었습니다.</div> : null}

        <div className={styles.noticeRow} onClick={stopShellClick}>
          <div className={styles.noticeBanner}>{notice}</div>
          {errorMessage ? (
            <div className={styles.errorBanner}>
              <AlertCircle size={16} />
              {errorMessage}
            </div>
          ) : null}
        </div>

        <div className={styles.editorLayout}>
          <aside className={styles.sectionRail} onClick={stopShellClick}>
            <div className={styles.railCard}>
              <p className={styles.sidebarLabel}>현재 섹션</p>
              <h2 className={styles.railTitle}>{getDisplaySectionName(currentSection)}</h2>
              <p className={styles.railDescription}>{getDisplaySectionGoal(currentSection)}</p>
              <div className={styles.progressTrack}>
                <div className={styles.progressFill} style={{ width: `${progressPercent}%` }} />
              </div>
                <div className={styles.metricGrid}>
                  <div className={styles.metricCard}>
                    <span>현재 섹션</span>
                  <strong>
                    {currentSectionIndex + 1}/{sections.length}
                  </strong>
                  </div>
                  <div className={styles.metricCard}>
                    <span>레이어</span>
                    <strong>{currentLayers.length}</strong>
                  </div>
                </div>
              </div>

            <div className={styles.sectionRailCard}>
              <p className={styles.sidebarLabel}>섹션 목록</p>
              <div className={styles.sectionList}>
                {sections.map((section, index) => (
                  <button
                    className={index === currentSectionIndex ? styles.sectionButtonActive : styles.sectionButton}
                    key={section.section_id}
                    onClick={() => setCurrentSectionIndex(index)}
                    type="button"
                  >
                    <span className={styles.sectionStep}>
                      {section.generatedImage && index !== currentSectionIndex ? <CheckCircle2 size={12} /> : index + 1}
                    </span>
                    <span className={styles.sectionButtonCopy}>
                      <strong>{getDisplaySectionName(section)}</strong>
                      <small>{getDisplaySectionGoal(section) || "전환 목적을 정리한 섹션"}</small>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <details className={styles.analysisDisclosure}>
              <summary className={styles.disclosureSummary}>
                <Sparkles size={16} />
                AI 분석 요약 보기
              </summary>
              <div className={styles.analysisBody}>
                <p className={styles.summaryText}>{initialResult.blueprint.executiveSummary}</p>

                {blueprintList.length ? (
                  <div className={styles.blueprintList}>
                    {blueprintList.map((item) => (
                      <span key={item}>{item}</span>
                    ))}
                  </div>
                ) : null}

                <div className={styles.scoreStack}>
                  {initialResult.blueprint.scorecard.map((item) => (
                    <article className={styles.scoreCard} key={`${item.category}-${item.score}`}>
                      <div className={styles.scoreRow}>
                        <strong>{item.category}</strong>
                        <span
                          className={
                            item.score.startsWith("A")
                              ? styles.scoreBadgeStrong
                              : item.score.startsWith("B")
                                ? styles.scoreBadgeMid
                                : styles.scoreBadgeSoft
                          }
                        >
                          {item.score}
                        </span>
                      </div>
                      <p>{item.reason}</p>
                    </article>
                  ))}
                </div>
              </div>
            </details>
          </aside>

          <section className={styles.canvasColumn}>
            <article className={styles.canvasPanel}>
              <div className={styles.canvasHeader}>
                <div>
                  <p className={styles.panelLabel}>편집 섹션</p>
                  <h2 className={styles.panelTitle}>{getDisplaySectionName(currentSection)}</h2>
                  <p className={styles.panelDescription}>{getDisplaySectionGoal(currentSection)}</p>
                </div>

                <div className={styles.canvasActions}>
                  <button
                    className={styles.navButton}
                    disabled={currentSectionIndex === 0}
                    onClick={() => setCurrentSectionIndex((current) => Math.max(0, current - 1))}
                    type="button"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <span className={styles.metaPill}>
                    {currentSectionIndex + 1}/{sections.length}
                  </span>
                  <button
                    className={styles.navButton}
                    disabled={currentSectionIndex === sections.length - 1}
                    onClick={() => setCurrentSectionIndex((current) => Math.min(sections.length - 1, current + 1))}
                    type="button"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>

              <div className={styles.canvasToolbar}>
                <button
                  className={workbenchTab === "image" && workbenchState.isOpen ? styles.workbenchDockButtonActive : styles.workbenchDockButton}
                  onClick={() => openWorkbench("image")}
                  type="button"
                >
                  <Settings2 size={15} />
                  이미지
                </button>
                <button
                  className={workbenchTab === "layer" && workbenchState.isOpen ? styles.workbenchDockButtonActive : styles.workbenchDockButton}
                  onClick={() => openWorkbench("layer")}
                  type="button"
                >
                  <Type size={15} />
                  텍스트 편집
                </button>
                <button
                  className={workbenchTab === "copy" && workbenchState.isOpen ? styles.workbenchDockButtonActive : styles.workbenchDockButton}
                  onClick={() => openWorkbench("copy")}
                  type="button"
                >
                  <Sparkles size={15} />
                  카피
                </button>
                <button className={styles.workbenchDockCreateButton} onClick={handleAddShapeLayer} type="button">
                  <Square size={15} />
                  배경 사각형 추가
                </button>
                <button
                  className={workbenchTab === "guide" && workbenchState.isOpen ? styles.workbenchDockButtonActive : styles.workbenchDockButton}
                  onClick={() => openWorkbench("guide")}
                  type="button"
                >
                  <Palette size={15} />
                  가이드
                </button>
              </div>

              <div className={styles.previewStage} ref={previewStageRef}>
                {currentSection.generatedImage ? (
                  <div className={styles.imageCanvas} ref={imageContainerRef}>
                    <img
                      alt={currentSection.section_name}
                      className={styles.sectionImage}
                      draggable={false}
                      src={currentSection.generatedImage}
                    />

                    {[...currentShapeLayers, ...currentTextLayers].map((overlay) => (
                      <Rnd
                        bounds="parent"
                        className={`${styles.overlayBox} ${isShapeLayer(overlay) ? styles.shapeLayerBox : styles.textLayerBox} ${selectedOverlayId === overlay.id ? styles.overlaySelected : ""}`}
                        enableUserSelectHack={false}
                        enableResizing={
                          selectedOverlayId === overlay.id
                            ? {
                                top: true,
                                right: true,
                                bottom: true,
                                left: true,
                                topRight: true,
                                bottomRight: true,
                                bottomLeft: true,
                                topLeft: true
                              }
                            : false
                        }
                        key={overlay.id}
                        onClick={(event: ReactMouseEvent<HTMLDivElement>) => {
                          event.stopPropagation();
                          setSelectedOverlayId(overlay.id);
                        }}
                        onDragStart={() => {
                          setSelectedOverlayId(overlay.id);
                          setActiveColorPalette(null);
                        }}
                        onDrag={(_, data) => handleOverlayDrag(overlay, data.x, data.y)}
                        onDragStop={(_, data) => handleOverlayDrag(overlay, data.x, data.y)}
                        onResize={(_, direction, ref, __, position) => handleResize(overlay, direction, ref, position)}
                        onResizeStart={() => {
                          handleResizeStart(overlay);
                        }}
                        onResizeStop={(_, direction, ref, __, position) => {
                          handleResize(overlay, direction, ref, position);
                          handleResizeStop(overlay.id);
                        }}
                        position={{ x: overlay.x, y: overlay.y }}
                        resizeHandleClasses={{
                          top: styles.resizeHandleTop,
                          bottom: styles.resizeHandleBottom,
                          left: styles.resizeHandleLeft,
                          right: styles.resizeHandleRight,
                          topLeft: styles.resizeHandleTopLeft,
                          topRight: styles.resizeHandleTopRight,
                          bottomLeft: styles.resizeHandleBottomLeft,
                          bottomRight: styles.resizeHandleBottomRight
                        }}
                        style={{
                          zIndex: isShapeLayer(overlay)
                            ? selectedOverlayId === overlay.id
                              ? 2
                              : 1
                            : selectedOverlayId === overlay.id
                              ? 5
                              : 4
                        }}
                        size={{ width: overlay.width, height: overlay.height }}
                      >
                        {isShapeLayer(overlay) ? (
                          <div className={`${styles.overlayContent} ${styles.overlayDragSurface}`}>
                            <div className={styles.shapeLayerSurface} style={buildShapeLayerStyle(overlay)} />
                          </div>
                        ) : (
                          <div
                            className={`${editingOverlayId === overlay.id ? styles.overlayEditing : styles.overlayContent} ${styles.overlayDragSurface}`}
                            onDoubleClick={(event) => {
                              event.stopPropagation();
                              setSelectedOverlayId(overlay.id);
                              setEditingOverlayId(overlay.id);
                            }}
                            style={buildOverlayShellStyle(overlay)}
                          >
                            {overlay.backgroundEnabled ? (
                              <div className={styles.overlayBackdrop} style={buildOverlayBackgroundStyle(overlay)} />
                            ) : null}
                            {editingOverlayId === overlay.id ? (
                              <textarea
                                autoFocus
                                className={styles.overlayTextarea}
                                onBlur={() => setEditingOverlayId(null)}
                                onChange={(event) => updateTextOverlayContent(overlay.id, event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter" && !event.shiftKey) {
                                    event.preventDefault();
                                    setEditingOverlayId(null);
                                  }
                                }}
                                style={buildOverlayTextStyle(overlay)}
                                value={overlay.text}
                              />
                            ) : (
                              <div className={styles.overlayTextLayer} style={buildOverlayTextStyle(overlay)}>
                                {overlay.text}
                              </div>
                            )}
                          </div>
                        )}
                      </Rnd>
                    ))}

                  </div>
                ) : (
                  <div className={styles.placeholderPanel}>
                    <div className={styles.placeholderIcon}>
                      <ImageIcon size={28} />
                    </div>
                    <strong>이 섹션의 이미지를 아직 만들지 않았습니다.</strong>
                    <p>이미지 생성 옵션을 정하고 이미지를 만들면, 캔버스 안에서 바로 텍스트를 얹고 편집할 수 있습니다.</p>
                  </div>
                )}

                {workbenchState.isOpen ? (
                  <Rnd
                    bounds="parent"
                    className={styles.workbenchShell}
                    dragHandleClassName={styles.workbenchHandle}
                    enableResizing={{
                      top: false,
                      right: true,
                      bottom: true,
                      left: false,
                      topRight: false,
                      bottomRight: true,
                      bottomLeft: false,
                      topLeft: false
                    }}
                    minHeight={420}
                    minWidth={320}
                    onDragStop={(_, data) =>
                      setWorkbenchState((current) => ({
                        ...current,
                        x: data.x,
                        y: data.y
                      }))
                    }
                    onResizeStop={(_, __, ref, ___, position) =>
                      setWorkbenchState((current) => ({
                        ...current,
                        x: position.x,
                        y: position.y,
                        width: ref.offsetWidth,
                        height: ref.offsetHeight
                      }))
                    }
                    position={{ x: workbenchState.x, y: workbenchState.y }}
                    size={{ width: workbenchState.width, height: workbenchState.height }}
                  >
                    <div className={styles.workbenchPanel} onClick={(event: ReactMouseEvent<HTMLDivElement>) => event.stopPropagation()}>
                      <div className={styles.workbenchHandle}>
                        <div className={styles.workbenchHandleCopy}>
                          <span className={styles.optionMiniLabel}>Canvas Workbench</span>
                          <strong>
                            {workbenchTab === "image"
                              ? "이미지 옵션"
                              : workbenchTab === "layer"
                                ? "텍스트 편집"
                                : workbenchTab === "copy"
                                  ? "카피 라이브러리"
                                  : "섹션 가이드"}
                          </strong>
                        </div>
                        <div className={styles.workbenchHeaderActions}>
                          <button
                            className={styles.inlineButton}
                            onClick={workbenchTab === "layer" && selectedLayer ? snapWorkbenchToOverlay : snapWorkbenchToEdge}
                            type="button"
                          >
                            <RefreshCw size={14} />
                            옆으로 붙이기
                          </button>
                          <button
                            className={styles.inlineButton}
                            onClick={() =>
                              setWorkbenchState((current) => ({
                                ...current,
                                isOpen: false
                              }))
                            }
                            type="button"
                          >
                            닫기
                          </button>
                        </div>
                      </div>

                      <div className={styles.workbenchTabs}>
                        <button
                          className={workbenchTab === "image" ? styles.workbenchTabActive : styles.workbenchTab}
                          onClick={() => setWorkbenchTab("image")}
                          type="button"
                        >
                          <Settings2 size={15} />
                          이미지
                        </button>
                        <button
                          className={workbenchTab === "layer" ? styles.workbenchTabActive : styles.workbenchTab}
                          onClick={() => setWorkbenchTab("layer")}
                          type="button"
                        >
                          <Type size={15} />
                          텍스트 편집
                        </button>
                        <button
                          className={workbenchTab === "copy" ? styles.workbenchTabActive : styles.workbenchTab}
                          onClick={() => setWorkbenchTab("copy")}
                          type="button"
                        >
                          <Sparkles size={15} />
                          카피
                        </button>
                        <button
                          className={workbenchTab === "guide" ? styles.workbenchTabActive : styles.workbenchTab}
                          onClick={() => setWorkbenchTab("guide")}
                          type="button"
                        >
                          <Palette size={15} />
                          가이드
                        </button>
                      </div>

                      <div className={styles.workbenchBody}>{renderWorkbenchBody()}</div>
                    </div>
                  </Rnd>
                ) : null}
              </div>

              <div className={styles.canvasFooter}>
                <span className={styles.footerStatus}>{currentSection.generatedImage ? "이미지 준비 완료" : "이미지 생성 필요"}</span>
                <span className={styles.footerStatus}>레이어 {currentLayers.length}개</span>
                <span className={styles.footerStatus}>{workbenchState.isOpen ? "플로팅 워크벤치 열림" : "플로팅 워크벤치 닫힘"}</span>
              </div>
            </article>
          </section>
        </div>
      </section>
    </main>
  );
}

function buildOverlayShellStyle(overlay: TextOverlay): CSSProperties {
  const padding = getOverlayPadding(overlay.fontSize);

  return {
    position: "relative",
    width: "100%",
    height: "100%",
    padding: `${padding.vertical}px ${padding.horizontal}px`
  };
}

function buildOverlayBackgroundStyle(overlay: TextOverlay): CSSProperties {
  return {
    backgroundColor: toRgba(overlay.backgroundColor, overlay.backgroundOpacity),
    borderRadius: `${overlay.backgroundRadius}px`
  };
}

function buildShapeLayerStyle(layer: ShapeLayer): CSSProperties {
  return {
    width: "100%",
    height: "100%",
    backgroundColor: toRgba(layer.fillColor, layer.fillOpacity),
    borderRadius: `${layer.borderRadius}px`
  };
}

async function buildExportNode(input: {
  imageSrc: string;
  width: number;
  layers: CanvasLayer[];
}) {
  const image = await loadImage(input.imageSrc);
  const width = Math.max(1, Math.round(input.width));
  const height = Math.max(1, Math.round((image.naturalHeight / Math.max(image.naturalWidth, 1)) * width));

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-100000px";
  container.style.top = "0";
  container.style.width = `${width}px`;
  container.style.height = `${height}px`;
  container.style.background = "transparent";
  container.style.overflow = "hidden";
  container.style.pointerEvents = "none";
  container.style.zIndex = "-1";

  const imageEl = document.createElement("img");
  imageEl.src = input.imageSrc;
  imageEl.alt = "";
  imageEl.draggable = false;
  imageEl.style.display = "block";
  imageEl.style.width = "100%";
  imageEl.style.height = "100%";
  imageEl.style.objectFit = "cover";
  container.appendChild(imageEl);

  const shapeLayers = input.layers.filter(isShapeLayer);
  const textLayers = input.layers.filter(isTextLayer);

  for (const layer of [...shapeLayers, ...textLayers]) {
    const layerEl = document.createElement("div");
    layerEl.style.position = "absolute";
    layerEl.style.left = `${layer.x}px`;
    layerEl.style.top = `${layer.y}px`;
    layerEl.style.width = `${toNumericSize(layer.width, width)}px`;
    layerEl.style.height = `${toNumericSize(layer.height, height)}px`;

    if (isShapeLayer(layer)) {
      const shapeSurface = document.createElement("div");
      shapeSurface.style.width = "100%";
      shapeSurface.style.height = "100%";
      shapeSurface.style.backgroundColor = toRgba(layer.fillColor, layer.fillOpacity);
      shapeSurface.style.borderRadius = `${layer.borderRadius}px`;
      shapeSurface.style.border = "1px solid rgba(255, 255, 255, 0.18)";
      shapeSurface.style.boxShadow = "inset 0 1px 0 rgba(255, 255, 255, 0.14), 0 12px 28px rgba(8, 16, 28, 0.18)";
      layerEl.appendChild(shapeSurface);
    } else {
      const shell = document.createElement("div");
      const shellStyle = buildOverlayShellStyle(layer);
      applyInlineStyle(shell, shellStyle);
      shell.style.overflow = "visible";

      if (layer.backgroundEnabled) {
        const backdrop = document.createElement("div");
        backdrop.style.position = "absolute";
        backdrop.style.inset = "0";
        const backdropStyle = buildOverlayBackgroundStyle(layer);
        applyInlineStyle(backdrop, backdropStyle);
        shell.appendChild(backdrop);
      }

      const textEl = document.createElement("div");
      textEl.textContent = layer.text;
      const textStyle = buildOverlayTextStyle(layer);
      applyInlineStyle(textEl, textStyle);
      textEl.style.position = "relative";
      textEl.style.zIndex = "1";
      shell.appendChild(textEl);
      layerEl.appendChild(shell);
    }

    container.appendChild(layerEl);
  }

  return container;
}

function applyInlineStyle(target: HTMLElement, style: CSSProperties) {
  Object.entries(style).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }

    const cssKey = key.replace(/[A-Z]/g, (segment) => `-${segment.toLowerCase()}`);
    target.style.setProperty(cssKey, String(value));
  });
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function sanitizeSectionFileName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "section";
}

function buildOverlayTextStyle(overlay: TextOverlay): CSSProperties {
  return {
    display: "block",
    width: "100%",
    height: "100%",
    color: overlay.color,
    fontFamily: overlay.fontFamily,
    fontSize: `${overlay.fontSize}px`,
    fontWeight: overlay.fontWeight,
    lineHeight: overlay.lineHeight,
    textAlign: overlay.textAlign,
    whiteSpace: "pre-wrap",
    wordBreak: "keep-all",
    textShadow: overlay.shadowEnabled
      ? `0px ${overlay.shadowOffsetY}px ${overlay.shadowBlur}px ${toRgba(overlay.shadowColor, overlay.shadowOpacity)}`
      : "none"
  };
}

function normalizeOverlayRecord(record: Record<number, CanvasLayer[]>) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(record).map(([key, overlays]) => [
      Number(key),
      (Array.isArray(overlays) ? overlays : []).map((overlay) => normalizeCanvasLayer(overlay))
    ])
  ) as Record<number, CanvasLayer[]>;
}

function normalizeCanvasLayer(layer: Partial<CanvasLayer> & Pick<CanvasLayer, "id" | "x" | "y" | "width" | "height">) {
  if (layer.kind === "shape") {
    return normalizeShapeLayer(layer as Partial<ShapeLayer> & Pick<ShapeLayer, "id" | "x" | "y" | "width" | "height">);
  }

  return normalizeTextOverlay(
    layer as Partial<TextOverlay> &
      Pick<TextOverlay, "id" | "text" | "x" | "y" | "width" | "height" | "fontSize" | "color" | "fontFamily" | "fontWeight" | "textAlign" | "lineHeight" | "backgroundColor">
  );
}

function normalizeTextOverlay(overlay: Partial<TextOverlay> & Pick<TextOverlay, "id" | "text" | "x" | "y" | "width" | "height" | "fontSize" | "color" | "fontFamily" | "fontWeight" | "textAlign" | "lineHeight" | "backgroundColor">): TextOverlay {
  const hasLegacyBackground = Boolean(overlay.backgroundColor && overlay.backgroundColor !== "transparent");
  const translations = normalizeOverlayTranslations(overlay.translations, overlay.text);
  const language = overlay.language === "en" ? "en" : "ko";

  return {
    ...overlay,
    kind: "text",
    language,
    text: translations[language] || translations.ko,
    translations,
    color: overlay.color ?? "#ffffff",
    backgroundColor: overlay.backgroundColor === "transparent" ? "#102532" : overlay.backgroundColor,
    backgroundEnabled: overlay.backgroundEnabled ?? hasLegacyBackground,
    backgroundOpacity: overlay.backgroundOpacity ?? 0.72,
    backgroundRadius: overlay.backgroundRadius ?? 18,
    shadowEnabled: overlay.shadowEnabled ?? false,
    shadowColor: overlay.shadowColor ?? "#102532",
    shadowOpacity: overlay.shadowOpacity ?? 0.4,
    shadowBlur: overlay.shadowBlur ?? 18,
    shadowOffsetY: overlay.shadowOffsetY ?? 6
  };
}

function applyLanguageToTextOverlay(overlay: TextOverlay, nextLanguage: PdpCopyLanguage): TextOverlay {
  const translations = normalizeOverlayTranslations(
    {
      ...overlay.translations,
      [overlay.language]: overlay.text
    },
    overlay.text
  );
  const nextText = translations[nextLanguage] || translations.ko;

  return normalizeTextOverlay({
    ...overlay,
    language: nextLanguage,
    text: nextText,
    translations: {
      ...translations,
      [nextLanguage]: nextText
    }
  });
}

function normalizeShapeLayer(layer: Partial<ShapeLayer> & Pick<ShapeLayer, "id" | "x" | "y" | "width" | "height">): ShapeLayer {
  return {
    ...layer,
    kind: "shape",
    fillColor: layer.fillColor ?? "#102532",
    fillOpacity: layer.fillOpacity ?? 1,
    borderRadius: layer.borderRadius ?? 0
  };
}

function getOverlayPadding(fontSize: number) {
  return {
    horizontal: clampValue(Math.round(fontSize * 0.32), 10, 24),
    vertical: clampValue(Math.round(fontSize * 0.18), 8, 18)
  };
}

function normalizeOverlayTranslations(
  translations: Partial<Record<PdpCopyLanguage, string>> | undefined,
  fallbackText: string
) {
  const ko = translations?.ko?.trim() ? translations.ko : fallbackText;
  const en = translations?.en?.trim() ? translations.en : ko;

  return {
    ko,
    en
  } satisfies Record<PdpCopyLanguage, string>;
}

function clampValue(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function toNumericSize(value: number | string, fallback: number) {
  if (typeof value === "number") {
    return value;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function estimateOverlayBox(
  text: string,
  options: {
    fontSize: number;
    fontWeight: string;
    fontFamily: string;
    lineHeight: number;
    maxWidth: number;
  }
) {
  const horizontalPadding = 20;
  const verticalPadding = 12;
  const availableLineWidth = Math.max(120, options.maxWidth - horizontalPadding);
  const lines = text.split("\n").map((line) => line.trimEnd());
  const measure = createTextMeasure(options);

  let wrappedLineCount = 0;
  let widestLine = 0;

  lines.forEach((line) => {
    const targetLine = line || " ";
    const measuredWidth = measure(targetLine);
    widestLine = Math.max(widestLine, Math.min(measuredWidth, availableLineWidth));
    wrappedLineCount += Math.max(1, Math.ceil(measuredWidth / availableLineWidth));
  });

  const lineHeightPx = options.fontSize * options.lineHeight;

  return {
    width: Math.round(
      clampValue(
        Math.max(widestLine + horizontalPadding, Math.min(options.maxWidth, Math.max(220, options.fontSize * 8))),
        96,
        options.maxWidth
      )
    ),
    height: Math.round(clampValue(wrappedLineCount * lineHeightPx + verticalPadding, 40, 220))
  };
}

function createTextMeasure(options: { fontSize: number; fontWeight: string; fontFamily: string }) {
  if (typeof document === "undefined") {
    return (text: string) => Math.max(options.fontSize * 1.6, text.length * options.fontSize * 0.58);
  }

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    return (text: string) => Math.max(options.fontSize * 1.6, text.length * options.fontSize * 0.58);
  }

  context.font = `${options.fontWeight} ${options.fontSize}px ${options.fontFamily}`;
  return (text: string) => context.measureText(text).width;
}

async function extractImageColorRecommendations(imageSrc: string): Promise<ImageColorRecommendations> {
  if (typeof document === "undefined") {
    return DEFAULT_COLOR_RECOMMENDATIONS;
  }

  try {
    const image = await loadImage(imageSrc);
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });

    if (!context) {
      return DEFAULT_COLOR_RECOMMENDATIONS;
    }

    const width = 48;
    const height = Math.max(48, Math.round((image.naturalHeight / Math.max(image.naturalWidth, 1)) * 48));
    canvas.width = width;
    canvas.height = height;
    context.drawImage(image, 0, 0, width, height);

    const { data } = context.getImageData(0, 0, width, height);
    const buckets = new Map<string, { count: number; r: number; g: number; b: number }>();

    for (let index = 0; index < data.length; index += 16) {
      const alpha = data[index + 3];
      if (alpha < 24) {
        continue;
      }

      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const key = `${Math.round(r / 32)}-${Math.round(g / 32)}-${Math.round(b / 32)}`;
      const current = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
      current.count += 1;
      current.r += r;
      current.g += g;
      current.b += b;
      buckets.set(key, current);
    }

    const swatches = Array.from(buckets.values())
      .map((bucket) => ({
        count: bucket.count,
        color: {
          r: Math.round(bucket.r / bucket.count),
          g: Math.round(bucket.g / bucket.count),
          b: Math.round(bucket.b / bucket.count)
        }
      }))
      .sort((left, right) => right.count - left.count);

    if (!swatches.length) {
      return DEFAULT_COLOR_RECOMMENDATIONS;
    }

    const dominant = swatches[0]?.color ?? hexToRgb(DEFAULT_COLOR_RECOMMENDATIONS.darkColor);
    const accent =
      swatches
        .slice(0, 8)
        .sort((left, right) => getSaturation(right.color) - getSaturation(left.color))[0]?.color ?? dominant;
    const dark = swatches.find((swatch) => getRelativeLuminance(swatch.color) < 0.34)?.color ?? darkenRgb(dominant, 0.58);
    const light = swatches.find((swatch) => getRelativeLuminance(swatch.color) > 0.72)?.color ?? lightenRgb(dominant, 0.68);

    const accentHex = rgbToHex(boostColorPresence(accent));
    const darkHex = rgbToHex(darkenRgb(dark, 0.08));
    const lightHex = rgbToHex(lightenRgb(light, 0.04));
    const complementHex = rgbToHex(rotateHue(accent, 180));
    const mutedAccentHex = rgbToHex(mixRgb(accent, dark, 0.36));
    const warmTintHex = rgbToHex(lightenRgb(mixRgb(accent, light, 0.5), 0.12));
    const deepContrastHex = rgbToHex(darkenRgb(mixRgb(dominant, accent, 0.22), 0.22));

    return {
      photoColors: uniqueColors(swatches.slice(0, 6).map((swatch) => rgbToHex(swatch.color))),
      recommendedTextColors: uniqueColors([
        "#ffffff",
        getRelativeLuminance(dominant) < 0.48 ? "#f9f7f1" : "#102532",
        lightHex,
        darkHex,
        accentHex
      ]),
      recommendedShapeColors: uniqueColors([
        darkHex,
        mutedAccentHex,
        rgbToHex(mixRgb(light, dark, 0.2)),
        warmTintHex,
        deepContrastHex,
        complementHex
      ]),
      accentColor: accentHex,
      darkColor: darkHex,
      lightColor: lightHex
    };
  } catch {
    return DEFAULT_COLOR_RECOMMENDATIONS;
  }
}

function sortColorsByContrast(colors: string[], against: string | null) {
  if (!against) {
    return uniqueColors(colors);
  }

  const target = hexToRgb(against);
  return uniqueColors(colors).sort(
    (left, right) => contrastScore(hexToRgb(right), target) - contrastScore(hexToRgb(left), target)
  );
}

function uniqueColors(colors: string[]) {
  return Array.from(new Set(colors.map((color) => color.toLowerCase())));
}

function contrastScore(left: { r: number; g: number; b: number }, right: { r: number; g: number; b: number }) {
  return Math.abs(getRelativeLuminance(left) - getRelativeLuminance(right));
}

function getRelativeLuminance(color: { r: number; g: number; b: number }) {
  const [r, g, b] = [color.r, color.g, color.b].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function getSaturation(color: { r: number; g: number; b: number }) {
  const [r, g, b] = [color.r / 255, color.g / 255, color.b / 255];
  return Math.max(r, g, b) - Math.min(r, g, b);
}

function lightenRgb(color: { r: number; g: number; b: number }, amount: number) {
  return {
    r: Math.round(color.r + (255 - color.r) * amount),
    g: Math.round(color.g + (255 - color.g) * amount),
    b: Math.round(color.b + (255 - color.b) * amount)
  };
}

function darkenRgb(color: { r: number; g: number; b: number }, amount: number) {
  return {
    r: Math.round(color.r * (1 - amount)),
    g: Math.round(color.g * (1 - amount)),
    b: Math.round(color.b * (1 - amount))
  };
}

function mixRgb(left: { r: number; g: number; b: number }, right: { r: number; g: number; b: number }, ratio: number) {
  return {
    r: Math.round(left.r * (1 - ratio) + right.r * ratio),
    g: Math.round(left.g * (1 - ratio) + right.g * ratio),
    b: Math.round(left.b * (1 - ratio) + right.b * ratio)
  };
}

function boostColorPresence(color: { r: number; g: number; b: number }) {
  const saturation = getSaturation(color);
  if (saturation > 0.3) {
    return color;
  }

  const max = Math.max(color.r, color.g, color.b);
  const next = { ...color };
  if (max === color.r) {
    next.r = clampValue(next.r + 28, 0, 255);
  } else if (max === color.g) {
    next.g = clampValue(next.g + 28, 0, 255);
  } else {
    next.b = clampValue(next.b + 28, 0, 255);
  }
  return next;
}

function rotateHue(color: { r: number; g: number; b: number }, degrees: number) {
  const { h, s, l } = rgbToHsl(color);
  return hslToRgb({
    h: (h + degrees + 360) % 360,
    s,
    l
  });
}

function rgbToHsl(color: { r: number; g: number; b: number }) {
  const r = color.r / 255;
  const g = color.g / 255;
  const b = color.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

  let h = 0;
  if (delta !== 0) {
    if (max === r) {
      h = 60 * (((g - b) / delta) % 6);
    } else if (max === g) {
      h = 60 * ((b - r) / delta + 2);
    } else {
      h = 60 * ((r - g) / delta + 4);
    }
  }

  return {
    h: h < 0 ? h + 360 : h,
    s,
    l
  };
}

function hslToRgb(color: { h: number; s: number; l: number }) {
  const c = (1 - Math.abs(2 * color.l - 1)) * color.s;
  const x = c * (1 - Math.abs(((color.h / 60) % 2) - 1));
  const m = color.l - c / 2;

  let rPrime = 0;
  let gPrime = 0;
  let bPrime = 0;

  if (color.h < 60) {
    rPrime = c;
    gPrime = x;
  } else if (color.h < 120) {
    rPrime = x;
    gPrime = c;
  } else if (color.h < 180) {
    gPrime = c;
    bPrime = x;
  } else if (color.h < 240) {
    gPrime = x;
    bPrime = c;
  } else if (color.h < 300) {
    rPrime = x;
    bPrime = c;
  } else {
    rPrime = c;
    bPrime = x;
  }

  return {
    r: Math.round((rPrime + m) * 255),
    g: Math.round((gPrime + m) * 255),
    b: Math.round((bPrime + m) * 255)
  };
}

function hexToRgb(value: string) {
  const normalized = value.replace("#", "");
  const hex = normalized.length === 3 ? normalized.split("").map((segment) => `${segment}${segment}`).join("") : normalized;
  const numeric = Number.parseInt(hex, 16);

  return {
    r: (numeric >> 16) & 255,
    g: (numeric >> 8) & 255,
    b: numeric & 255
  };
}

function rgbToHex(color: { r: number; g: number; b: number }) {
  return `#${[color.r, color.g, color.b]
    .map((channel) => clampValue(channel, 0, 255).toString(16).padStart(2, "0"))
    .join("")}`;
}

function toRgba(hex: string, alpha: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${clampValue(alpha, 0, 1)})`;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("이미지 색상을 분석하지 못했습니다."));
    image.src = src;
  });
}

function formatSavedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "방금";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function anchorWorkbenchToOverlay(
  overlay: CanvasLayer,
  canvasEl: HTMLDivElement | null,
  stageEl: HTMLDivElement | null,
  workbench: FloatingWorkbenchState
) {
  const workbenchWidth = workbench.width;
  const workbenchHeight = workbench.height;
  const gap = 18;
  const stageWidth = stageEl?.clientWidth ?? 1240;
  const stageHeight = stageEl?.clientHeight ?? 720;
  const canvasLeft = canvasEl?.offsetLeft ?? 0;
  const canvasTop = canvasEl?.offsetTop ?? 0;
  const overlayWidth = toNumericSize(overlay.width, 320);

  let x = canvasLeft + overlay.x + overlayWidth + gap;
  if (x + workbenchWidth > stageWidth - 16) {
    x = canvasLeft + overlay.x - workbenchWidth - gap;
  }
  if (x < 12) {
    x = clampValue(canvasLeft + overlay.x + 12, 12, Math.max(12, stageWidth - workbenchWidth - 16));
  }

  const y = clampValue(canvasTop + overlay.y, 12, Math.max(12, stageHeight - workbenchHeight - 16));

  return {
    x: Math.round(x),
    y: Math.round(y)
  };
}

function isTextLayer(layer: CanvasLayer): layer is TextOverlay {
  return layer.kind === "text";
}

function isShapeLayer(layer: CanvasLayer): layer is ShapeLayer {
  return layer.kind === "shape";
}

function getWorkbenchPosition(stageEl: HTMLDivElement | null) {
  const width = 332;
  const height = 500;
  const stageWidth = stageEl?.clientWidth ?? 1240;
  const stageHeight = stageEl?.clientHeight ?? 720;

  return {
    x: Math.max(16, stageWidth - width - 20),
    y: 20,
    width,
    height: Math.min(height, Math.max(420, stageHeight - 40)),
    isOpen: true
  };
}

function clampWorkbenchToStage(workbench: FloatingWorkbenchState, stageEl: HTMLDivElement | null) {
  if (!stageEl) {
    return workbench;
  }

  const maxX = Math.max(16, stageEl.clientWidth - workbench.width - 16);
  const maxY = Math.max(16, stageEl.clientHeight - workbench.height - 16);

  return {
    ...workbench,
    x: clampValue(workbench.x, 16, maxX),
    y: clampValue(workbench.y, 16, maxY)
  };
}

function normalizeImageOptions(
  options: ImageGenOptions | undefined,
  fallbackWithModel: boolean
): ImageGenOptions & { guidePriorityMode: NonNullable<ImageGenOptions["guidePriorityMode"]> } {
  return {
    style: options?.style ?? "studio",
    withModel: options?.withModel ?? fallbackWithModel,
    modelGender: options?.modelGender ?? "female",
    modelAgeRange: options?.modelAgeRange ?? "20s",
    modelCountry: options?.modelCountry ?? "korea",
    guidePriorityMode: options?.guidePriorityMode ?? "guide-first",
    headline: options?.headline,
    subheadline: options?.subheadline,
    isRegeneration: options?.isRegeneration,
    referenceModelImageBase64: options?.referenceModelImageBase64,
    referenceModelImageMimeType: options?.referenceModelImageMimeType,
    referenceModelImageFileName: options?.referenceModelImageFileName
  };
}

function normalizeSectionOptions(
  record: Record<number, ImageGenOptions>,
  referenceModelUsage: ReferenceModelUsage | null
) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return {} as Record<number, ImageGenOptions>;
  }

  return Object.fromEntries(
    Object.entries(record).map(([key, options]) => [
      Number(key),
      normalizeImageOptions(options, referenceModelUsage === "all-sections" ? true : Number(key) === 0)
    ])
  ) as Record<number, ImageGenOptions>;
}

function normalizeSectionCopyFields(section: GeneratedResult["blueprint"]["sections"][number]) {
  const { on_image_text: _legacyOnImageText, ...rest } =
    section as GeneratedResult["blueprint"]["sections"][number] & { on_image_text?: string };

  return {
    ...rest,
    headline_en: section.headline_en || section.headline,
    subheadline_en: section.subheadline_en || section.subheadline,
    bullets_en: Array.isArray(section.bullets_en) && section.bullets_en.length ? section.bullets_en : section.bullets,
    trust_or_objection_line_en: section.trust_or_objection_line_en || section.trust_or_objection_line,
    CTA_en: section.CTA_en || section.CTA
  };
}

function getLocalizedCopy(korean: string, english: string | undefined, language: PdpCopyLanguage) {
  if (language === "en") {
    return english?.trim() || korean;
  }

  return korean;
}

function getLocalizedBullets(section: GeneratedResult["blueprint"]["sections"][number], language: PdpCopyLanguage) {
  if (language === "en" && Array.isArray(section.bullets_en) && section.bullets_en.length) {
    return section.bullets_en;
  }

  return section.bullets;
}

function getDisplaySectionName(section: GeneratedResult["blueprint"]["sections"][number]) {
  if (containsHangul(section.section_name)) {
    return section.section_name;
  }

  const normalized = section.section_name.replace(/^S\d+[_-]?/i, "");
  const tokens = normalized.split(/[_-]+/).filter(Boolean);

  if (!tokens.length) {
    return section.section_name;
  }

  const mappedTokens = tokens.map((token) => translateSectionToken(token));

  if (mappedTokens.length >= 2 && mappedTokens[0] === "베네핏" && /^\d+$/.test(tokens[1] ?? "")) {
    const descriptor = mappedTokens.slice(2).join(" ");
    return descriptor ? `베네핏 ${tokens[1]} · ${descriptor}` : `베네핏 ${tokens[1]}`;
  }

  return mappedTokens.join(" ");
}

function getDisplaySectionGoal(section: GeneratedResult["blueprint"]["sections"][number]) {
  if (containsHangul(section.goal)) {
    return section.goal;
  }

  if (containsHangul(section.headline)) {
    return section.headline;
  }

  if (containsHangul(section.subheadline)) {
    return section.subheadline;
  }

  return section.goal;
}

function getModelGenderLabel(gender?: ImageGenOptions["modelGender"]) {
  return gender === "male" ? "남자 모델" : "여자 모델";
}

function getModelAgeLabel(ageRange?: ImageGenOptions["modelAgeRange"]) {
  if (ageRange === "teen") {
    return "10대 후반";
  }
  if (ageRange === "30s") {
    return "30대";
  }
  if (ageRange === "40s") {
    return "40대";
  }
  if (ageRange === "50s_plus") {
    return "50대+";
  }

  return "20대";
}

function getModelCountryLabel(country?: ImageGenOptions["modelCountry"]) {
  if (country === "japan") {
    return "일본";
  }
  if (country === "usa") {
    return "미국";
  }
  if (country === "france") {
    return "프랑스";
  }
  if (country === "germany") {
    return "독일";
  }
  if (country === "africa") {
    return "아프리카";
  }

  return "한국";
}

function containsHangul(value: string) {
  return /[가-힣]/.test(value);
}

function translateSectionToken(token: string) {
  const normalized = token.trim().toLowerCase();

  if (normalized === "hero") {
    return "히어로";
  }
  if (normalized === "benefit") {
    return "베네핏";
  }
  if (normalized === "evidence") {
    return "근거";
  }
  if (normalized === "review" || normalized === "reviews") {
    return "후기";
  }
  if (normalized === "routine" || normalized === "howto" || normalized === "usage") {
    return "사용법";
  }
  if (normalized === "checklist") {
    return "체크리스트";
  }
  if (normalized === "cta") {
    return "구매 유도";
  }
  if (normalized === "windproof") {
    return "방풍";
  }
  if (normalized === "lightweight") {
    return "경량";
  }
  if (normalized === "style") {
    return "스타일";
  }
  if (normalized === "waterproof") {
    return "방수";
  }
  if (normalized === "comfort") {
    return "편안함";
  }
  if (normalized === "fit") {
    return "핏";
  }

  return /^\d+$/.test(token) ? token : token;
}
