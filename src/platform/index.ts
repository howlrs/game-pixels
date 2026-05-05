// docs §14.1 platform/: PWA / Service Worker / 環境検出。

export { detectMobile, isProMotionLikely } from './detect.ts';
export type { DeviceClass } from './detect.ts';
export { mountVisibilityHandler } from './visibility.ts';
export {
  canPromptInstall,
  isStandalone,
  mountInstallPromptCapture,
  promptInstall,
} from './install.ts';
export { updateReduceMotion, isReduceMotionApplied } from './reduce-motion.ts';
