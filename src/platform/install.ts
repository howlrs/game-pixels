// docs §13.9.3 / §14.10.1: ホーム画面追加 (PWA インストール) 促進。
// Step E では「beforeinstallprompt を捕捉して保持し、必要時に prompt() を発火する API」だけ提供する。
// 実際の促進 UI (モーダル + iOS の手順案内) は Round 5 以降。

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: ReadonlyArray<string>;
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

let savedEvent: BeforeInstallPromptEvent | null = null;
let attached = false;

/**
 * モジュールトップレベルで beforeinstallprompt を捕捉する (Step E / Gemini Pro 指摘)。
 * Chrome は React マウント前に発火するケースがあるため、React の useEffect では遅すぎる。
 * かつ React の StrictMode で double mount/unmount を踏んでも一度捕捉したイベントは消さない設計。
 */
function attachOnce(): void {
  if (attached || typeof window === 'undefined') return;
  attached = true;
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault(); // Chrome の自動バナーを抑止し、自前タイミングで promptInstall() する
    savedEvent = e as BeforeInstallPromptEvent;
    console.info('[install] beforeinstallprompt captured (module-level)');
  });
}
attachOnce();

/**
 * React の useEffect から呼び出して、ログ出力等の補助を行う。
 * 主要な listener は attachOnce() で既にモジュールトップレベルで登録済のため、
 * cleanup 関数では何もしない (savedEvent を消さない = StrictMode で event が消えるバグ回避)。
 */
export function mountInstallPromptCapture(): () => void {
  if (typeof window === 'undefined') return () => {};
  // 既にイベント発火済 (Chrome がマウント前に発火していた) かをログで通知
  if (savedEvent !== null) {
    console.info('[install] beforeinstallprompt was captured before mount');
  }
  return () => {
    /* no-op: savedEvent も listener もモジュールスコープで保持し続ける */
  };
}

/** PWA インストールが利用可能か (Chrome 系のみ。iOS Safari は常に false)。 */
export function canPromptInstall(): boolean {
  return savedEvent !== null;
}

/**
 * PWA インストールを促す (Chrome 系)。
 * iOS Safari は手動操作必須なので、呼び出し側で別途モーダル表示してください。
 */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!savedEvent) return 'unavailable';
  await savedEvent.prompt();
  const choice = await savedEvent.userChoice;
  savedEvent = null; // 1 度しか使えない
  return choice.outcome;
}

/** PWA standalone モードで起動しているか (= ホーム画面追加済) */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches;
}
