"use client";

import { type DragEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Clock3, Copy, FolderOpen, Loader2, RectangleHorizontal, RectangleVertical, Settings2, Smartphone, Sparkles, Square, Trash2, Upload, Wand2 } from "lucide-react";
import type { AspectRatio, GeneratedResult, PdpAnalyzeResponse, ReferenceModelUsage } from "@runacademy/shared";
import type { PdpAppState, PdpDraftSummary, PdpEditorDraftState, PreparedImageDraft } from "./pdp-drafts";
import { deletePdpDraft, getPdpDraft, listPdpDrafts, savePdpDraft } from "./pdp-drafts";
import { PdpEditor } from "./PdpEditor";
import { PdpSettingsSheet } from "./PdpSettingsSheet";
import styles from "./pdp-maker.module.css";
import {
  loadPdpClientSettings,
  resolveGeminiApiKeyHeaderValue,
  savePdpClientSettings,
  type PdpClientSettings
} from "./pdp-settings";
import { RATIO_OPTIONS, TONE_OPTIONS, apiJson, prepareImageFile } from "./pdp-utils";

type PreparedImage = PreparedImageDraft;

export function PdpMakerClient() {
  const [appState, setAppState] = useState<PdpAppState>("upload");
  const [preparedImage, setPreparedImage] = useState<PreparedImage | null>(null);
  const [modelImage, setModelImage] = useState<PreparedImage | null>(null);
  const [modelImageUsage, setModelImageUsage] = useState<ReferenceModelUsage | null>(null);
  const [result, setResult] = useState<GeneratedResult | null>(null);
  const [additionalInfo, setAdditionalInfo] = useState("");
  const [desiredTone, setDesiredTone] = useState("");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("9:16");
  const [notice, setNotice] = useState("브라우저에 초안이 저장되며, 저장한 작업은 이 화면에서 이어서 열 수 있습니다.");
  const [errorMessage, setErrorMessage] = useState("");
  const [errorDetail, setErrorDetail] = useState("");
  const [showErrorDetail, setShowErrorDetail] = useState(false);
  const [loadingStep, setLoadingStep] = useState("제품 이미지를 분석하는 중입니다.");
  const [drafts, setDrafts] = useState<PdpDraftSummary[]>([]);
  const [isLoadingDrafts, setIsLoadingDrafts] = useState(true);
  const [isLoadingDraft, setIsLoadingDraft] = useState(false);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [draftCreatedAt, setDraftCreatedAt] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [editorDraftState, setEditorDraftState] = useState<PdpEditorDraftState | null>(null);
  const [editorSessionKey, setEditorSessionKey] = useState(0);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [manualSaveToastToken, setManualSaveToastToken] = useState(0);
  const [isDirty, setIsDirty] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [clientSettings, setClientSettings] = useState<PdpClientSettings>(() => loadPdpClientSettings());
  const isApplyingDraftRef = useRef(false);
  const saveInFlightRef = useRef(false);

  const selectedRatio = useMemo(() => RATIO_OPTIONS.find((option) => option.value === aspectRatio) ?? RATIO_OPTIONS[2], [aspectRatio]);
  const selectedToneLabel = desiredTone || "AI 자동 추천";
  const preparedImageDisplayName = preparedImage ? formatCompactFileName(preparedImage.fileName) : "";
  const modelImageDisplayName = modelImage ? formatCompactFileName(modelImage.fileName) : "";
  const hasDraftContent = Boolean(preparedImage || modelImage || result || additionalInfo.trim() || desiredTone.trim() || activeDraftId);
  const effectiveGeminiApiKey = resolveGeminiApiKeyHeaderValue(clientSettings);
  const hasAvailableGeminiKey = Boolean(effectiveGeminiApiKey);
  const canAnalyze = Boolean(preparedImage && (!modelImage || modelImageUsage) && hasAvailableGeminiKey);
  const apiConnectionLabel = effectiveGeminiApiKey ? "개인 API 키" : "키 필요";

  const refreshDrafts = useCallback(async () => {
    setIsLoadingDrafts(true);
    try {
      setDrafts(await listPdpDrafts());
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "저장된 작업 목록을 불러오지 못했습니다.");
    } finally {
      setIsLoadingDrafts(false);
    }
  }, []);

  useEffect(() => {
    void refreshDrafts();
  }, [refreshDrafts]);

  useEffect(() => {
    setClientSettings(loadPdpClientSettings());
  }, []);

  useEffect(() => {
    if (isApplyingDraftRef.current || !hasDraftContent) {
      return;
    }

    setIsDirty(true);
    setSaveState((current) => (current === "saved" ? "idle" : current));
  }, [additionalInfo, appState, aspectRatio, desiredTone, editorDraftState, hasDraftContent, modelImage, modelImageUsage, preparedImage, result]);

  const handlePreparedImage = async (file: File) => {
    try {
      if (!file.type.startsWith("image/")) {
        setErrorMessage("이미지 파일만 업로드할 수 있습니다.");
        return;
      }

      const nextImage = await prepareImageFile(file);
      setPreparedImage(nextImage);
      setErrorMessage("");
      setErrorDetail("");
      setShowErrorDetail(false);
      setNotice(`${file.name} 이미지를 준비했습니다. 설정을 확인한 뒤 AI 분석을 시작해 보세요.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "이미지를 준비하지 못했습니다.");
      setErrorDetail(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
    }
  };

  const handleModelImage = async (file: File) => {
    try {
      if (!file.type.startsWith("image/")) {
        setErrorMessage("이미지 파일만 업로드할 수 있습니다.");
        return;
      }

      const nextImage = await prepareImageFile(file);
      setModelImage(nextImage);
      setModelImageUsage(null);
      setErrorMessage("");
      setErrorDetail("");
      setShowErrorDetail(false);
      setNotice(`${file.name} 모델 이미지를 준비했습니다. 히어로우 전용 또는 전체 일관성 유지 방식을 선택해 주세요.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "모델 이미지를 준비하지 못했습니다.");
      setErrorDetail(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
    }
  };

  const buildDraftInput = useCallback(() => {
    if (!hasDraftContent) {
      return null;
    }

    return {
      id: activeDraftId ?? undefined,
      createdAt: draftCreatedAt ?? undefined,
      appState: result ? "editor" : appState === "processing" ? "upload" : appState,
      preparedImage,
      modelImage,
      modelImageUsage,
      result,
      additionalInfo,
      desiredTone,
      aspectRatio,
      notice: editorDraftState?.notice ?? notice,
      editorState: result ? editorDraftState ?? createDefaultEditorDraftState(result) : null
    };
  }, [activeDraftId, additionalInfo, appState, aspectRatio, desiredTone, draftCreatedAt, editorDraftState, hasDraftContent, modelImage, modelImageUsage, notice, preparedImage, result]);

  const persistDraft = useCallback(
    async (mode: "manual" | "auto" | "switch" = "manual", options?: { showToast?: boolean }) => {
      const input = buildDraftInput();
      if (!input || saveInFlightRef.current) {
        return null;
      }

      saveInFlightRef.current = true;
      setSaveState("saving");

      try {
        const savedDraft = await savePdpDraft(input);
        isApplyingDraftRef.current = true;
        setActiveDraftId(savedDraft.id);
        setDraftCreatedAt(savedDraft.createdAt);
        setLastSavedAt(savedDraft.updatedAt);
        setSaveState("saved");
        setIsDirty(false);
        if (mode === "manual") {
          setNotice("현재 작업을 저장했습니다. 시작 화면에서 이어서 작업할 수 있습니다.");
          if (options?.showToast) {
            setManualSaveToastToken(Date.now());
          }
        }
        await refreshDrafts();
        return savedDraft;
      } catch (error) {
        setSaveState("error");
        setErrorMessage("작업을 저장하지 못했습니다.");
        setErrorDetail(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
        return null;
      } finally {
        saveInFlightRef.current = false;
        requestAnimationFrame(() => {
          isApplyingDraftRef.current = false;
        });
      }
    },
    [buildDraftInput, refreshDrafts]
  );

  const confirmSaveBeforeLeaving = useCallback(async () => {
    if (!isDirty || !hasDraftContent) {
      return true;
    }

    const shouldSave = window.confirm("저장되지 않은 작업이 있습니다.\n확인: 저장 후 이동\n취소: 저장하지 않고 이동");
    if (!shouldSave) {
      return true;
    }

    const savedDraft = await persistDraft("manual");
    return Boolean(savedDraft);
  }, [hasDraftContent, isDirty, persistDraft]);

  const resetWorkspace = useCallback(() => {
    isApplyingDraftRef.current = true;
    setAppState("upload");
    setPreparedImage(null);
    setModelImage(null);
    setModelImageUsage(null);
    setResult(null);
    setAdditionalInfo("");
    setDesiredTone("");
    setAspectRatio("9:16");
    setNotice("새 이미지로 다시 시작할 수 있습니다.");
    setErrorMessage("");
    setErrorDetail("");
    setShowErrorDetail(false);
    setEditorDraftState(null);
    setActiveDraftId(null);
    setDraftCreatedAt(null);
    setLastSavedAt(null);
    setSaveState("idle");
    setIsDirty(false);
    setEditorSessionKey((current) => current + 1);
    requestAnimationFrame(() => {
      isApplyingDraftRef.current = false;
    });
  }, []);

  const handleLoadDraft = useCallback(
    async (draftId: string) => {
      const canContinue = await confirmSaveBeforeLeaving();
      if (!canContinue) {
        return;
      }

      setIsLoadingDraft(true);
      setErrorMessage("");
      setErrorDetail("");
      setShowErrorDetail(false);

      try {
        const draft = await getPdpDraft(draftId);
        if (!draft) {
          setErrorMessage("저장된 작업을 찾지 못했습니다.");
          await refreshDrafts();
          return;
        }

        isApplyingDraftRef.current = true;
        setActiveDraftId(draft.id);
        setDraftCreatedAt(draft.createdAt);
        setLastSavedAt(draft.updatedAt);
        setPreparedImage(draft.preparedImage);
        setModelImage(draft.modelImage ?? null);
        setModelImageUsage(draft.modelImageUsage ?? null);
        setResult(draft.result);
        setAdditionalInfo(draft.additionalInfo);
        setDesiredTone(draft.desiredTone);
        setAspectRatio(draft.aspectRatio);
        setNotice(draft.notice);
        setEditorDraftState(draft.editorState);
        setAppState(draft.result ? "editor" : "upload");
        setSaveState("saved");
        setIsDirty(false);
        setEditorSessionKey((current) => current + 1);
      } catch (error) {
        setErrorMessage("저장된 작업을 불러오지 못했습니다.");
        setErrorDetail(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
      } finally {
        requestAnimationFrame(() => {
          isApplyingDraftRef.current = false;
          setIsLoadingDraft(false);
        });
      }
    },
    [confirmSaveBeforeLeaving, refreshDrafts]
  );

  const handleDeleteDraft = useCallback(
    async (draftId: string) => {
      const shouldDelete = window.confirm("이 저장된 작업을 삭제할까요?");
      if (!shouldDelete) {
        return;
      }

      try {
        await deletePdpDraft(draftId);
        if (activeDraftId === draftId) {
          resetWorkspace();
        }
        await refreshDrafts();
      } catch (error) {
        setErrorMessage("저장된 작업을 삭제하지 못했습니다.");
        setErrorDetail(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
      }
    },
    [activeDraftId, refreshDrafts, resetWorkspace]
  );

  useEffect(() => {
    if (!isDirty || !hasDraftContent) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasDraftContent, isDirty]);

  useEffect(() => {
    if (!hasDraftContent) {
      return;
    }

    const timer = window.setInterval(() => {
      if (!isDirty) {
        return;
      }

      void persistDraft("auto");
    }, 30000);

    return () => window.clearInterval(timer);
  }, [hasDraftContent, isDirty, persistDraft]);

  const handleAnalyze = async () => {
    if (!preparedImage) {
      setErrorMessage("먼저 제품 이미지를 업로드해 주세요.");
      return;
    }

    if (!hasAvailableGeminiKey) {
      setErrorMessage("설정 메뉴에서 본인 Gemini API 키를 먼저 입력해 주세요.");
      return;
    }

    if (modelImage && !modelImageUsage) {
      setErrorMessage("모델 이미지를 사용할 방식을 먼저 선택해 주세요.");
      return;
    }

    setAppState("processing");
    setErrorMessage("");
    setErrorDetail("");
    setShowErrorDetail(false);
    setLoadingStep("제품을 분석하고 상세페이지 구조를 설계하는 중입니다.");

    try {
      const response = await apiJson<PdpAnalyzeResponse>("/pdp/analyze", {
        method: "POST",
        body: JSON.stringify({
          imageBase64: preparedImage.base64,
          mimeType: preparedImage.mimeType,
          modelImageBase64: modelImage?.base64,
          modelImageMimeType: modelImage?.mimeType,
          modelImageFileName: modelImage?.fileName,
          additionalInfo: additionalInfo.trim() || undefined,
          desiredTone: desiredTone.trim() || undefined,
          aspectRatio
        })
      }, { geminiApiKey: effectiveGeminiApiKey });

      if (!response.ok) {
        setAppState("upload");
        setErrorMessage(response.message);
        setErrorDetail(response.detail ?? "");
        return;
      }

      setResult(response.result);
      setEditorDraftState(null);
      setEditorSessionKey((current) => current + 1);
      setNotice("분석이 완료되었습니다. 섹션별 이미지를 재생성하거나 텍스트를 직접 배치해 보세요.");
      setAppState("editor");
    } catch (error) {
      setAppState("upload");
      setErrorMessage("API 서버와 통신하지 못했습니다.");
      setErrorDetail(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
    }
  };

  const handleReset = async () => {
    const canContinue = await confirmSaveBeforeLeaving();
    if (!canContinue) {
      return;
    }

    resetWorkspace();
  };

  const handleGoToMain = async () => {
    const canContinue = await confirmSaveBeforeLeaving();
    if (!canContinue) {
      return;
    }

    resetWorkspace();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSaveSettings = (nextSettings: PdpClientSettings) => {
    savePdpClientSettings(nextSettings);
    setClientSettings(loadPdpClientSettings());
    setNotice("개인 Gemini API 키를 저장했습니다. 이 브라우저에서는 입력한 키로 바로 작업할 수 있습니다.");
  };

  if (appState === "editor" && result) {
    return (
      <>
        <PdpEditor
          key={`${activeDraftId ?? "new"}-${editorSessionKey}`}
          aspectRatio={aspectRatio}
          geminiApiKey={effectiveGeminiApiKey}
          desiredTone={desiredTone}
          initialDraftState={editorDraftState}
          initialResult={result}
          lastSavedAt={lastSavedAt}
          manualSaveToastToken={manualSaveToastToken}
          onDraftStateChange={setEditorDraftState}
          onManualSave={() => void persistDraft("manual", { showToast: true })}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onReset={() => void handleReset()}
          apiConnectionLabel={apiConnectionLabel}
          referenceModelImage={modelImage}
          referenceModelUsage={modelImageUsage}
          saveState={saveState}
        />
        <PdpSettingsSheet
          onOpenChange={setIsSettingsOpen}
          onSave={handleSaveSettings}
          open={isSettingsOpen}
          settings={clientSettings}
        />
      </>
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <header className={styles.toolHeader}>
          <div className={styles.toolHeaderCopy}>
            <h1 className={styles.toolTitle}>
              <button className={styles.brandHomeButton} onClick={() => void handleGoToMain()} type="button">
                한이룸의 상세페이지 마법사 2.0
              </button>
            </h1>
          </div>

          <div className={styles.toolHeaderActions}>
            <span className={styles.metaPill}>API {apiConnectionLabel}</span>
            <button className={`${styles.secondaryButton} ${styles.headerActionButton}`} onClick={() => setIsSettingsOpen(true)} type="button">
              <Settings2 size={16} />
              설정
            </button>
          </div>
        </header>

        {appState !== "processing" ? (
          <section className={styles.savedDraftsPanel}>
            <div className={styles.savedDraftsHeader}>
              <div>
                <span className={styles.panelLabel}>저장된 작업</span>
                <h2 className={styles.savedDraftsTitle}>이어서 작업하기</h2>
                <p className={styles.panelDescription}>수동 저장과 30초 자동 저장으로 남겨둔 초안을 바로 이어서 열 수 있습니다.</p>
              </div>
              <div className={styles.savedDraftsMeta}>
                <span className={styles.metaPill}>자동 저장 30초</span>
                {lastSavedAt ? <span className={styles.metaPill}>최근 저장 {formatSavedDraftDate(lastSavedAt)}</span> : null}
              </div>
            </div>

            {isLoadingDrafts ? (
              <div className={styles.savedDraftsEmpty}>
                <Loader2 className={styles.spinIcon} size={16} />
                저장된 작업을 불러오는 중입니다.
              </div>
            ) : drafts.length ? (
              <div className={styles.savedDraftGrid}>
                {drafts.map((draft) => (
                  <article className={styles.savedDraftCard} key={draft.id}>
                    <div className={styles.savedDraftPreview}>
                      <div className={styles.savedDraftPreviewFrame}>
                        {draft.thumbnailUrl ? <img alt={draft.title} src={draft.thumbnailUrl} /> : <Sparkles size={18} />}
                      </div>
                      <div className={styles.savedDraftPreviewMeta}>
                        <span className={styles.savedDraftStageBadge}>{draft.stageLabel}</span>
                        <span className={styles.savedDraftAspectBadge}>{draft.aspectRatio}</span>
                      </div>
                    </div>
                    <div className={styles.savedDraftCopy}>
                      <div className={styles.savedDraftHeaderRow}>
                        <strong title={draft.title}>{draft.title}</strong>
                        <span className={styles.savedDraftCountBadge}>{draft.sectionCount}섹션</span>
                      </div>
                      <p className={styles.savedDraftTimestamp}>{formatSavedDraftDate(draft.updatedAt)}</p>
                      <div className={styles.savedDraftMetaRow}>
                        <span>최근 저장</span>
                        <span>{formatSavedDraftDate(draft.updatedAt)}</span>
                      </div>
                    </div>
                    <div className={styles.savedDraftActions}>
                      <button className={styles.inlineButton} onClick={() => void handleLoadDraft(draft.id)} type="button" disabled={isLoadingDraft}>
                        <FolderOpen size={14} />
                        불러오기
                      </button>
                      <button className={styles.inlineDangerButton} onClick={() => void handleDeleteDraft(draft.id)} type="button">
                        <Trash2 size={14} />
                        삭제
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className={styles.savedDraftsEmpty}>
                <Clock3 size={16} />
                아직 저장된 작업이 없습니다. 이미지를 올리고 저장하면 이곳에서 다시 이어서 열 수 있습니다.
              </div>
            )}
          </section>
        ) : null}

        {appState === "processing" ? (
          <section className={styles.processingPanel}>
            <div className={styles.processingIcon}>
              <Loader2 className={styles.spinIcon} size={32} />
            </div>
            <div>
              <h2>AI가 상세페이지 구조를 만드는 중입니다</h2>
              <p>{loadingStep}</p>
            </div>
            <div className={styles.progressTrack}>
              <div className={styles.progressFill} />
            </div>
          </section>
        ) : (
          <div className={styles.setupGrid}>
            <section className={styles.uploadStage}>
              <div className={styles.panelIntro}>
                <div className={styles.sectionHeading}>
                  <span className={styles.sectionStep}>1</span>
                  <div className={styles.sectionHeadingCopy}>
                    <h2>원본 이미지 업로드</h2>
                    <p>한 장만 올려도 됩니다. 업로드 후 AI 전송용으로 자동 압축합니다.</p>
                  </div>
                </div>
              </div>

              <UploadDropzone
                description="드래그 앤 드롭 또는 클릭으로 JPG, PNG, WEBP 파일을 선택할 수 있습니다."
                hint={preparedImage?.fileName ? `선택됨: ${preparedImageDisplayName}` : "권장 최대 10MB"}
                onSelect={handlePreparedImage}
                selectedFileName={preparedImage?.fileName}
                title="제품 이미지를 업로드하세요"
              />

              {preparedImage ? (
                <div className={styles.uploadPreviewCard}>
                  <div className={styles.previewFrame}>
                    <img alt={preparedImage.fileName} className={styles.selectedImage} src={preparedImage.previewUrl} />
                  </div>
                  <div className={styles.uploadMeta}>
                    <strong title={preparedImage.fileName}>{preparedImageDisplayName}</strong>
                    <div className={styles.metaList}>
                      <div className={styles.metaItem}>
                        <span>전송 포맷</span>
                        <strong>JPEG 1024px</strong>
                      </div>
                      <div className={styles.metaItem}>
                        <span>비율</span>
                        <strong>{selectedRatio.label}</strong>
                      </div>
                      <div className={styles.metaItem}>
                        <span>톤</span>
                        <strong>{selectedToneLabel}</strong>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className={styles.emptyStatePanel}>
                  <Sparkles size={18} />
                  <div>
                    <strong>업로드 후 바로 미리보기가 들어옵니다.</strong>
                    <ul className={styles.emptyList}>
                      <li>배경이 너무 복잡하지 않은 제품컷이면 분석 품질이 더 안정적입니다.</li>
                      <li>투명 배경 PNG도 가능하지만, 제품이 충분히 크게 보이는 이미지를 추천합니다.</li>
                    </ul>
                  </div>
                </div>
              )}

              <div className={styles.optionalUploadBlock}>
                <div className={styles.optionalUploadHeader}>
                  <div>
                    <span className={styles.panelLabel}>선택 옵션</span>
                    <h3 className={styles.optionalUploadTitle}>모델 이미지 업로드</h3>
                    <p className={styles.optionalUploadDescription}>
                      인물 이미지를 올리면 첫 히어로우에만 쓰거나, 모델컷 전체를 같은 인물로 맞출 수 있습니다.
                    </p>
                  </div>
                  {modelImage ? (
                    <button
                      className={styles.inlineButton}
                      onClick={() => {
                        setModelImage(null);
                        setModelImageUsage(null);
                        setErrorMessage("");
                        setErrorDetail("");
                        setShowErrorDetail(false);
                        setNotice("모델 이미지를 제거했습니다. 일반 페르소나 설정으로 계속 편집할 수 있습니다.");
                      }}
                      type="button"
                    >
                      <Trash2 size={14} />
                      모델 이미지 제거
                    </button>
                  ) : null}
                </div>

                <UploadDropzone
                  compact
                  description="선택 사항입니다. 업로드한 인물 이미지는 모델컷 생성 시 참조 이미지로 사용됩니다."
                  hint={modelImage?.fileName ? `선택됨: ${modelImageDisplayName}` : "권장 최대 10MB"}
                  onSelect={handleModelImage}
                  selectedFileName={modelImage?.fileName}
                  title="모델 이미지를 업로드하세요"
                />

                {modelImage ? (
                  <div className={styles.uploadPreviewCard}>
                    <div className={styles.previewFrame}>
                      <img alt={modelImage.fileName} className={styles.selectedImage} src={modelImage.previewUrl} />
                    </div>
                    <div className={styles.uploadMeta}>
                      <strong title={modelImage.fileName}>{modelImageDisplayName}</strong>
                      <div className={styles.metaList}>
                        <div className={styles.metaItem}>
                          <span>적용 대상</span>
                          <strong>{modelImageUsage === "all-sections" ? "전체 모델컷" : modelImageUsage === "hero-only" ? "히어로우 섹션" : "선택 필요"}</strong>
                        </div>
                        <div className={styles.metaItem}>
                          <span>활용 방식</span>
                          <strong>참조 모델</strong>
                        </div>
                        <div className={styles.metaItem}>
                          <span>편집 영향</span>
                          <strong>
                            {modelImageUsage === "all-sections"
                              ? "타깃 페르소나 잠금"
                              : modelImageUsage === "hero-only"
                                ? "히어로우만 잠금"
                                : "선택 필요"}
                          </strong>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className={styles.emptyStatePanel}>
                    <Sparkles size={18} />
                    <div>
                      <strong>없어도 상세페이지 생성은 가능합니다.</strong>
                      <ul className={styles.emptyList}>
                        <li>히어로우에 특정 모델컷을 고정하고 싶을 때만 업로드하세요.</li>
                        <li>전체 일관성 유지를 고르면 모델컷 포함 시 동일 인물 기준으로 생성됩니다.</li>
                      </ul>
                    </div>
                  </div>
                )}

                {modelImage ? (
                  <div className={styles.modelUsagePanel}>
                    <div className={styles.modelUsageHeader}>
                      <strong>모델 이미지 사용 방식</strong>
                      <span>이미지를 업로드했다면 아래 두 옵션 중 하나를 선택해야 분석을 시작할 수 있습니다.</span>
                    </div>
                    <div className={styles.modelUsageGrid}>
                      <button
                        className={modelImageUsage === "hero-only" ? styles.modelUsageCardActive : styles.modelUsageCard}
                        onClick={() => {
                          setModelImageUsage("hero-only");
                          setErrorMessage("");
                        }}
                        type="button"
                      >
                        <strong>히어로우에만 사용</strong>
                        <span>맨 첫 히어로우 섹션의 모델컷에만 업로드한 인물을 적용합니다.</span>
                      </button>
                      <button
                        className={modelImageUsage === "all-sections" ? styles.modelUsageCardActive : styles.modelUsageCard}
                        onClick={() => {
                          setModelImageUsage("all-sections");
                          setErrorMessage("");
                        }}
                        type="button"
                      >
                        <strong>전체 일관성 유지</strong>
                        <span>모델컷 포함 시 업로드한 인물을 계속 사용하고 타깃 페르소나 설정은 비활성화됩니다.</span>
                      </button>
                    </div>
                    {!modelImageUsage ? (
                      <div className={styles.inlineWarning}>
                        <AlertCircle size={16} />
                        모델 이미지 사용 방식을 선택해야 AI 분석을 시작할 수 있습니다.
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {errorMessage ? (
                <div className={styles.errorPanel}>
                  <div className={styles.errorBanner}>
                    <AlertCircle size={16} />
                    {errorMessage}
                  </div>
                  {errorDetail ? (
                    <div className={styles.errorDetailWrap}>
                      <button className={styles.inlineButton} onClick={() => setShowErrorDetail((current) => !current)} type="button">
                        {showErrorDetail ? "로그 숨기기" : "로그 보기"}
                      </button>
                      {showErrorDetail ? (
                        <div className={styles.errorDetail}>
                          <div className={styles.errorDetailHeader}>
                            <strong>API Detail</strong>
                            <button className={styles.inlineButton} onClick={() => navigator.clipboard.writeText(errorDetail)} type="button">
                              <Copy size={14} />
                              복사
                            </button>
                          </div>
                          <pre>{errorDetail}</pre>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>

            <aside className={styles.controlRail}>
              <div className={styles.panelIntro}>
                <div className={styles.sectionHeading}>
                  <span className={styles.sectionStep}>2</span>
                  <div className={styles.sectionHeadingCopy}>
                    <h2>생성 설정</h2>
                    <p>상품 맥락과 원하는 분위기를 정하면 첫 분석 결과가 훨씬 정확해집니다.</p>
                  </div>
                </div>
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel} htmlFor="additionalInfo">
                  추가 정보
                </label>
                <textarea
                  className={styles.textarea}
                  id="additionalInfo"
                  onChange={(event) => setAdditionalInfo(event.target.value)}
                  placeholder="예: 20대 여성, 여름 시즌, 네이버 스마트스토어용, 프리미엄 보습 이미지 강조"
                  rows={5}
                  value={additionalInfo}
                />
              </div>

              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>원하는 톤</span>
                <div className={styles.toneGrid}>
                  {TONE_OPTIONS.map((tone) => {
                    const value = tone === "AI 자동 추천" ? "" : tone;
                    const isActive = desiredTone === value;

                    return (
                      <button
                        className={isActive ? styles.toneButtonActive : styles.toneButton}
                        key={tone}
                        onClick={() => setDesiredTone(value)}
                        type="button"
                      >
                        {tone}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>이미지 비율</span>
                <div className={styles.ratioGrid}>
                  {RATIO_OPTIONS.map((option) => (
                    <button
                      className={option.value === aspectRatio ? styles.ratioButtonActive : styles.ratioButton}
                      key={option.value}
                      onClick={() => setAspectRatio(option.value)}
                      type="button"
                    >
                      <span className={styles.ratioIcon}>{renderRatioIcon(option.icon)}</span>
                      <strong>{option.label}</strong>
                      <small>{option.description}</small>
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.noticePanel}>
                <div className={styles.noticeTitle}>
                  <Sparkles size={16} />
                  현재 세션 안내
                </div>
                <p>{notice}</p>
                <div className={styles.noticeMeta}>
                  <div className={styles.noticeMetaItem}>
                    <span>선택한 톤</span>
                    <strong>{selectedToneLabel}</strong>
                  </div>
                  <div className={styles.noticeMetaItem}>
                    <span>선택한 비율</span>
                    <strong>{selectedRatio.label}</strong>
                  </div>
                  <div className={styles.noticeMetaItem}>
                    <span>저장 상태</span>
                    <strong>{saveState === "saving" ? "저장 중" : lastSavedAt ? formatSavedDraftDate(lastSavedAt) : "미저장"}</strong>
                  </div>
                </div>
              </div>

              <button className={styles.primaryButtonWide} disabled={!canAnalyze} onClick={handleAnalyze} type="button">
                <Wand2 size={16} />
                AI 분석 시작하기
              </button>

              <p className={styles.helperCopy}>
                첫 분석에서는 블루프린트와 함께 첫 섹션 이미지까지 자동 생성됩니다. 모델 이미지를 올렸다면 사용 방식을 먼저 고른 뒤 시작해 주세요.
              </p>
            </aside>
          </div>
        )}

      </section>

      <PdpSettingsSheet
        onOpenChange={setIsSettingsOpen}
        onSave={handleSaveSettings}
        open={isSettingsOpen}
        settings={clientSettings}
      />
    </main>
  );
}

function UploadDropzone({
  compact = false,
  description,
  hint,
  onSelect,
  selectedFileName,
  title
}: {
  compact?: boolean;
  description: string;
  hint: string;
  onSelect: (file: File) => Promise<void>;
  selectedFileName?: string;
  title: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.type === "dragenter" || event.type === "dragover") {
      setDragActive(true);
    } else if (event.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);

    const file = event.dataTransfer.files?.[0];
    if (file) {
      await onSelect(file);
    }
  };

  return (
    <>
      <input
        accept="image/*"
        className={styles.hiddenInput}
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (file) {
            await onSelect(file);
          }
          event.target.value = "";
        }}
        ref={inputRef}
        type="file"
      />

      <button
        className={`${compact ? styles.dropzoneCompact : ""} ${dragActive ? styles.dropzoneActive : styles.dropzone}`.trim()}
        onClick={() => inputRef.current?.click()}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        type="button"
      >
        <div className={styles.dropzoneIcon}>
          <Upload size={24} />
        </div>
        <strong>{title}</strong>
        <p>{description}</p>
        <span className={styles.dropzoneHint}>{selectedFileName ? `선택됨: ${selectedFileName}` : hint}</span>
      </button>
    </>
  );
}

function renderRatioIcon(icon: "square" | "portrait" | "phone" | "landscape" | "wide") {
  if (icon === "square") {
    return <Square size={18} />;
  }
  if (icon === "portrait") {
    return <RectangleVertical size={18} />;
  }
  if (icon === "phone") {
    return <Smartphone size={18} />;
  }
  if (icon === "wide") {
    return <RectangleHorizontal size={18} style={{ transform: "scaleX(1.2)" }} />;
  }
  return <RectangleHorizontal size={18} />;
}

function createDefaultEditorDraftState(result: GeneratedResult): PdpEditorDraftState {
  return {
    currentSectionIndex: 0,
    sections: result.blueprint.sections.map((section) => ({ ...section })),
    sectionOptions: {},
    overlaysBySection: {},
    defaultCopyLanguage: "ko",
    notice: "섹션 컷을 고르고 텍스트를 배치한 뒤 바로 다운로드할 수 있습니다.",
    workbenchTab: "image",
    workbenchState: {
      x: 756,
      y: 24,
      width: 332,
      height: 500,
      isOpen: true
    }
  };
}

function formatSavedDraftDate(value: string) {
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

function formatCompactFileName(fileName: string, maxBaseLength = 30) {
  const trimmed = fileName.trim();
  if (!trimmed) {
    return fileName;
  }

  const lastDotIndex = trimmed.lastIndexOf(".");
  const hasExtension = lastDotIndex > 0 && lastDotIndex < trimmed.length - 1;
  const extension = hasExtension ? trimmed.slice(lastDotIndex) : "";
  const baseName = hasExtension ? trimmed.slice(0, lastDotIndex) : trimmed;

  if (baseName.length <= maxBaseLength) {
    return trimmed;
  }

  const leadingLength = Math.max(14, Math.floor(maxBaseLength * 0.58));
  const trailingLength = Math.max(8, maxBaseLength - leadingLength);
  return `${baseName.slice(0, leadingLength)}…${baseName.slice(-trailingLength)}${extension}`;
}
