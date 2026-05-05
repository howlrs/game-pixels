// docs §92.3.2: visibilitychange で suspend のみ実行。
// resume は「TAP TO RESUME」のタップハンドラ内で同期実行 (Round 3 / Gemini Pro 指摘)。

export function mountVisibilityHandler(): void {
  if (typeof document === 'undefined') return;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      // 実装着手後: pauseGame() / Howler.mute(true) / audioContext.suspend() を呼ぶ
      // eslint-disable-next-line no-console
      console.info('[visibility] hidden — pause requested');
    } else {
      // 実装着手後: showResumePrompt() を呼ぶ (resume() は呼ばない)
      // eslint-disable-next-line no-console
      console.info('[visibility] visible — resume prompt requested');
    }
  });
}
