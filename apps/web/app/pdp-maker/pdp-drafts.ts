"use client";

import type { AspectRatio, GeneratedResult, ImageGenOptions, SectionBlueprint } from "@runacademy/shared";

const PDP_DRAFT_DB = "hanirum-pdp-maker";
const PDP_DRAFT_STORE = "drafts";
const PDP_DRAFT_VERSION = 1;

export type PdpAppState = "upload" | "processing" | "editor";
export type OverlayTextAlign = "left" | "center" | "right";
export type WorkbenchTab = "image" | "layer" | "copy" | "guide";

export interface TextOverlay {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number | string;
  height: number | string;
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
  overlaysBySection: Record<number, TextOverlay[]>;
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
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map((record) => ({
      id: record.id,
      title: record.title,
      updatedAt: record.updatedAt,
      createdAt: record.createdAt,
      aspectRatio: record.aspectRatio,
      sectionCount: record.editorState?.sections.length ?? record.result?.blueprint.sections.length ?? 0,
      stageLabel: record.result ? "편집 중" : "설정 초안",
      thumbnailUrl: record.preparedImage?.previewUrl ?? record.result?.originalImage ?? null
    }));
}

export async function getPdpDraft(id: string): Promise<PdpDraftRecord | null> {
  return withStore("readonly", (store) => requestAsPromise<PdpDraftRecord | undefined>(store.get(id)).then((record) => record ?? null));
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
    result: input.result,
    additionalInfo: input.additionalInfo,
    desiredTone: input.desiredTone,
    aspectRatio: input.aspectRatio,
    notice: input.notice,
    editorState: input.editorState
  };

  await withStore("readwrite", (store) => requestAsPromise(store.put(nextRecord)));
  return nextRecord;
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
