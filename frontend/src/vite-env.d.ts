/// <reference types="vite/client" />

declare module "*.md?raw" {
  const src: string;
  export default src;
}

declare module "*.po" {
  import type { Messages } from "@lingui/core";
  export const messages: Messages;
}

interface ImportMetaEnv {
  readonly VITE_FEEDBACK_URL?: string;
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  readonly VITE_FIREBASE_MEASUREMENT_ID?: string;
  readonly VITE_FIREBASE_VAPID_KEY?: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_PUBLIC_HOST?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
