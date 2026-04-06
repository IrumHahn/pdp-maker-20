import Link from "next/link";
import type { Metadata } from "next";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "한이룸 상세페이지 마법사 20",
  description: "제품 이미지를 바탕으로 상세페이지 구조와 카피를 설계하는 전용 프로젝트"
};

export default function HomePage() {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.hero}>
          <span className={styles.eyebrow}>Hanirum Creative Workspace</span>
          <h1 className={styles.title}>PDP Maker 20</h1>
          <p className={styles.description}>
            제품 이미지 편집, 섹션 구조 설계, 텍스트 배치 조정, 상세페이지 초안 생성을
            한 화면에서 다루는 상세페이지 마법사 전용 프로젝트입니다.
          </p>
          <div className={styles.badges}>
            <span>이미지 편집</span>
            <span>텍스트 레이아웃</span>
            <span>상세페이지 초안</span>
          </div>
        </section>

        <section className={styles.grid}>
          <Link className={styles.card} href="/pdp-maker">
            <div>
              <p className={styles.cardLabel}>Main Workspace</p>
              <h2>상세페이지 마법사</h2>
              <p>
                제품 이미지를 바탕으로 히어로, 베네핏, 근거 섹션을 구성하고 카피와 폰트 리듬을 다듬습니다.
              </p>
            </div>
            <span className={styles.cardAction}>/pdp-maker</span>
          </Link>

          <section className={styles.card} aria-label="프로젝트 경계">
            <div>
              <p className={styles.cardLabel}>Project Boundary</p>
              <h2>소싱 기능은 분리됨</h2>
              <p>
                소싱 워크스페이스, 네이버 트렌드 백필, Google Sheets 동기화는
                {" "}
                <strong>sourcing-maker-10</strong>
                에서만 운영합니다.
              </p>
            </div>
            <span className={styles.cardAction}>separate project</span>
          </section>
        </section>
      </div>
    </main>
  );
}
