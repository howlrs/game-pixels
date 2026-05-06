// パズル選択画面の最下部に表示する控えめなフッター。
// ゲームプレイ中の HUD/Canvas を邪魔しないよう、PuzzleSelect 内のスクロール末尾にだけ置く。

const SITE_LAUNCH_YEAR = 2026;
const SITE_OWNER = 'howlrs (寺島和宏)';

export function Footer() {
  const currentYear = new Date().getFullYear();
  const yearRange =
    currentYear > SITE_LAUNCH_YEAR ? `${SITE_LAUNCH_YEAR}–${currentYear}` : `${SITE_LAUNCH_YEAR}`;

  return (
    <footer className="app-footer" aria-label="サイト情報">
      <ul className="app-footer-links">
        <li>
          <a
            href="https://product.howlrs.net/policy"
            target="_blank"
            rel="noopener noreferrer"
            className="app-footer-link"
          >
            Privacy &amp; Policy
          </a>
        </li>
        <li>
          <a
            href="https://product.howlrs.net/contact"
            target="_blank"
            rel="noopener noreferrer"
            className="app-footer-link"
          >
            Contact
          </a>
        </li>
        <li>
          <a
            href="https://product.howlrs.net/articles/pixels"
            target="_blank"
            rel="noopener noreferrer"
            className="app-footer-link"
          >
            About
          </a>
        </li>
        <li>
          <a
            href="https://github.com/howlrs"
            target="_blank"
            rel="noopener noreferrer"
            className="app-footer-link"
          >
            GitHub
          </a>
        </li>
      </ul>
      <small className="app-footer-copyright">
        © {yearRange} {SITE_OWNER}. All rights reserved.
      </small>
    </footer>
  );
}
