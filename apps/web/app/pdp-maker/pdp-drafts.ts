"use client";

import type {
  AspectRatio,
  GeneratedResult,
  ImageGenOptions,
  PdpCopyLanguage,
  ReferenceModelUsage,
  SectionBlueprint
} from "@runacademy/shared";

const PDP_DRAFT_DB = "hanirum-pdp-maker";
const PDP_DRAFT_STORE = "drafts";
const PDP_DRAFT_VERSION = 2;

export type PdpAppState = "upload" | "processing" | "editor";
export type OverlayTextAlign = "left" | "center" | "right";
export type WorkbenchTab = "image" | "layer" | "copy" | "guide";
export type CanvasLayerKind = "text" | "shape";

interface CanvasLayerBase {
  id: string;
  kind: CanvasLayerKind;
  x: number;
  y: number;
  width: number | string;
  height: number | string;
}

export interface TextOverlay extends CanvasLayerBase {
  kind: "text";
  text: string;
  language: PdpCopyLanguage;
  translations: Record<PdpCopyLanguage, string>;
  fontSize: number;
  color: string;
  backgroundColor: string;
  backgroundEnabled: boolean;
  backgroundOpacity: number;
  backgroundRadius: number;
  fontFamily: string;
  fontWeight: string;
  textAlign: OverlayTextAlign;
  lineHeight: number;
  shadowEnabled: boolean;
  shadowColor: string;
  shadowOpacity: number;
  shadowBlur: number;
  shadowOffsetY: number;
}

export interface ShapeLayer extends CanvasLayerBase {
  kind: "shape";
  fillColor: string;
  fillOpacity: number;
  borderRadius: number;
}

export type CanvasLayer = TextOverlay | ShapeLayer;

export interface FloatingWorkbenchState {
  x: number;
  y: number;
  width: number;
  height: number;
  isOpen: boolean;
}

export interface PdpEditorDraftState {
  currentSectionIndex: number;
  sections: SectionBlueprint[];
  sectionOptions: Record<number, ImageGenOptions>;
  overlaysBySection: Record<number, CanvasLayer[]>;
  defaultCopyLanguage: PdpCopyLanguage;
  notice: string;
  workbenchTab: WorkbenchTab;
  workbenchState: FloatingWorkbenchState;
}

export interface PreparedImageDraft {
  base64: string;
  mimeType: string;
  previewUrl: string;
  fileName: string;
}

export interface PdpDraftRecord {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  appState: PdpAppState;
  preparedImage: PreparedImageDraft | null;
  modelImage: PreparedImageDraft | null;
  modelImageUsage: ReferenceModelUsage | null;
  result: GeneratedResult | null;
  additionalInfo: string;
  desiredTone: string;
  aspectRatio: AspectRatio;
  notice: string;
  editorState: PdpEditorDraftState | null;
}

export interface PdpDraftSummary {
  id: string;
  title: string;
  updatedAt: string;
  createdAt: string;
  aspectRatio: AspectRatio;
  sectionCount: number;
  stageLabel: string;
  thumbnailUrl: string | null;
}

export type PdpDraftInput = Omit<PdpDraftRecord, "id" | "title" | "createdAt" | "updatedAt"> & {
  id?: string;
  createdAt?: string;
};

export async function listPdpDrafts(): Promise<PdpDraftSummary[]> {
  const records = await withStore("readonly", (store) => requestAsPromise<PdpDraftRecord[]>(store.getAll()));
  return records
    .map((record) => normalizeDraftRecord(record))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map((record) => ({
      id: record.id,
      title: record.title,
      updatedAt: record.updatedAt,
      createdAt: record.createdAt,
      aspectRatio: record.aspectRatio,
      sectionCount: record.editorState?.sections.length ?? record.result?.blueprint.sections.length ?? 0,
      stageLabel: record.result ? "편집 중" : "설정 초안",
      thumbnailUrl:
        record.editorState?.sections[0]?.generatedImage ??
        record.result?.blueprint.sections[0]?.generatedImage ??
        record.preparedImage?.previewUrl ??
        record.result?.originalImage ??
        null
    }));
}

export async function getPdpDraft(id: string): Promise<PdpDraftRecord | null> {
  return withStore("readonly", (store) =>
    requestAsPromise<PdpDraftRecord | undefined>(store.get(id)).then((record) => (record ? normalizeDraftRecord(record) : null))
  );
}

export async function savePdpDraft(input: PdpDraftInput): Promise<PdpDraftRecord> {
  const now = new Date().toISOString();
  const nextRecord: PdpDraftRecord = {
    id: input.id ?? crypto.randomUUID(),
    title: buildDraftTitle(input),
    createdAt: input.createdAt ?? now,
    updatedAt: now,
    appState: input.appState,
    preparedImage: input.preparedImage,
    modelImage: input.modelImage,
    modelImageUsage: input.modelImageUsage,
    result: input.result,
    additionalInfo: input.additionalInfo,
    desiredTone: input.desiredTone,
    aspectRatio: input.aspectRatio,
    notice: input.notice,
    editorState: input.editorState
  };

  const normalizedRecord = normalizeDraftRecord(nextRecord);

  await withStore("readwrite", (store) => requestAsPromise(store.put(normalizedRecord)));
  return normalizedRecord;
}

export async function deletePdpDraft(id: string): Promise<void> {
  await withStore("readwrite", (store) => requestAsPromise(store.delete(id)));
}

function buildDraftTitle(input: PdpDraftInput) {
  const rawFileName = input.preparedImage?.fileName ?? "";
  const cleanedFileName = rawFileName.replace(/\.[^.]+$/, "").trim();
  const fallbackSection = input.editorState?.sections[0]?.section_name ?? input.result?.blueprint.sections[0]?.section_name ?? "상세페이지 초안";
  return cleanedFileName || fallbackSection;
}

function normalizeDraftRecord(record: PdpDraftRecord): PdpDraftRecord {
  const preparedImage = normalizePreparedImage(record.preparedImage);
  const modelImage = normalizePreparedImage(record.modelImage);
  const result = normalizeGeneratedResult(record.result, preparedImage, record.editorState);
  const normalizedSections = Array.isArray(result?.blueprint.sections)
    ? result.blueprint.sections
    : Array.isArray(record.editorState?.sections)
      ? record.editorState.sections
      : [];

  return {
    id: record.id,
    title: record.title?.trim() || buildFallbackDraftTitle(preparedImage, normalizedSections),
    createdAt: record.createdAt || new Date().toISOString(),
    updatedAt: record.updatedAt || record.createdAt || new Date().toISOString(),
    appState: record.appState === "processing" || record.appState === "editor" ? record.appState : "upload",
    preparedImage,
    modelImage,
    modelImageUsage: record.modelImageUsage === "all-sections" || record.modelImageUsage === "hero-only" ? record.modelImageUsage : null,
    result,
    additionalInfo: record.additionalInfo ?? "",
    desiredTone: record.desiredTone ?? "",
    aspectRatio: normalizeAspectRatio(record.aspectRatio),
    notice: record.notice ?? "저장된 작업을 불러왔습니다.",
    editorState: normalizeEditorState(record.editorState, result)
  };
}

function normalizePreparedImage(image: PreparedImageDraft | null | undefined) {
  if (!image?.base64 || !image.mimeType) {
    return null;
  }

  const previewUrl = image.previewUrl || `data:${image.mimeType};base64,${image.base64}`;

  return {
    base64: image.base64,
    mimeType: image.mimeType,
    previewUrl,
    fileName: image.fileName || "image"
  };
}

function normalizeGeneratedResult(
  result: GeneratedResult | null | undefined,
  preparedImage: PreparedImageDraft | null,
  editorState: PdpEditorDraftState | null | undefined
): GeneratedResult | null {
  if (result?.blueprint?.sections?.length) {
    return {
      originalImage: result.originalImage || preparedImage?.previewUrl || toDataUrl(preparedImage),
      blueprint: {
        executiveSummary: result.blueprint.executiveSummary ?? "",
        scorecard: Array.isArray(result.blueprint.scorecard) ? result.blueprint.scorecard : [],
        blueprintList: Array.isArray(result.blueprint.blueprintList) ? result.blueprint.blueprintList : [],
        sections: result.blueprint.sections
      }
    };
  }

  if (preparedImage && editorState?.sections?.length) {
    return {
      originalImage: preparedImage.previewUrl || toDataUrl(preparedImage),
      blueprint: {
        executiveSummary: "",
        scorecard: [],
        blueprintList: [],
        sections: editorState.sections
      }
    };
  }

  return null;
}

function normalizeEditorState(editorState: PdpEditorDraftState | null | undefined, result: GeneratedResult | null): PdpEditorDraftState | null {
  const sections = Array.isArray(editorState?.sections) && editorState.sections.length
    ? editorState.sections
    : result?.blueprint.sections?.length
      ? result.blueprint.sections
      : [];
  const sectionOptions =
    editorState?.sectionOptions && typeof editorState.sectionOptions === "object" && !Array.isArray(editorState.sectionOptions)
      ? editorState.sectionOptions
      : {};
  const overlaysBySection =
    editorState?.overlaysBySection && typeof editorState.overlaysBySection === "object" && !Array.isArray(editorState.overlaysBySection)
      ? editorState.overlaysBySection
      : {};

  if (!sections.length && !editorState) {
    return null;
  }

  return {
    currentSectionIndex:
      typeof editorState?.currentSectionIndex === "number" ? Math.max(0, Math.min(editorState.currentSectionIndex, Math.max(0, sections.length - 1))) : 0,
    sections,
    sectionOptions,
    overlaysBySection,
    defaultCopyLanguage: editorState?.defaultCopyLanguage === "en" ? "en" : "ko",
    notice: editorState?.notice ?? "저장된 작업을 이어서 편집할 수 있습니다.",
    workbenchTab:
      editorState?.workbenchTab === "copy" ||
      editorState?.workbenchTab === "guide" ||
      editorState?.workbenchTab === "layer" ||
      editorState?.workbenchTab === "image"
        ? editorState.workbenchTab
        : "image",
    workbenchState: {
      x: editorState?.workbenchState?.x ?? 756,
      y: editorState?.workbenchState?.y ?? 24,
      width: editorState?.workbenchState?.width ?? 332,
      height: editorState?.workbenchState?.height ?? 500,
      isOpen: editorState?.workbenchState?.isOpen ?? true
    }
  };
}

function buildFallbackDraftTitle(preparedImage: PreparedImageDraft | null, sections: SectionBlueprint[]) {
  const cleanedFileName = preparedImage?.fileName?.replace(/\.[^.]+$/, "").trim();
  return cleanedFileName || sections[0]?.section_name || "상세페이지 초안";
}

function normalizeAspectRatio(value: AspectRatio | string | undefined): AspectRatio {
  if (value === "1:1" || value === "3:4" || value === "4:3" || value === "9:16" || value === "16:9") {
    return value;
  }

  return "9:16";
}

function toDataUrl(image: PreparedImageDraft | null) {
  if (!image) {
    return "";
  }

  return `data:${image.mimeType};base64,${image.base64}`;
}

function openDraftDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("이 브라우저에서는 로컬 저장 기능을 사용할 수 없습니다."));
      return;
    }

    const request = indexedDB.open(PDP_DRAFT_DB, PDP_DRAFT_VERSION);

    request.onerror = () => reject(request.error ?? new Error("저장소를 열지 못했습니다."));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(PDP_DRAFT_STORE)) {
        database.createObjectStore(PDP_DRAFT_STORE, { keyPath: "id" });
      }
    };
  });
}

function withStore<T>(mode: IDBTransactionMode, handler: (store: IDBObjectStore) => Promise<T>) {
  return openDraftDb().then(
    (database) =>
      new Promise<T>((resolve, reject) => {
        const transaction = database.transaction(PDP_DRAFT_STORE, mode);
        const store = transaction.objectStore(PDP_DRAFT_STORE);
        let resultValue: T;

        transaction.oncomplete = () => {
          database.close();
          resolve(resultValue);
        };
        transaction.onerror = () => {
          database.close();
          reject(transaction.error ?? new Error("저장소 작업에 실패했습니다."));
        };
        transaction.onabort = () => {
          database.close();
          reject(transaction.error ?? new Error("저장소 작업이 중단되었습니다."));
        };

        handler(store)
          .then((result) => {
            resultValue = result;
          })
          .catch((error) => {
            database.close();
            reject(error);
          });
      })
  );
}

function requestAsPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB 요청에 실패했습니다."));
  });
}
