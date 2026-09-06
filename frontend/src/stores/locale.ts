import { atom } from "jotai";
import { authApi } from "../lib/api";
import { auth } from "../lib/firebase";
import { type Locale, persistLocale, resolveInitialLocale } from "../lib/i18n";

export const localeAtom = atom<Locale>(resolveInitialLocale(window.location.search));

/**
 * ロケールを切り替えて永続化する。
 *
 * URL からの `?lang=` の除去は App の LocaleUrlSync が Router 経由で行う。
 * ここで history を直接触ると React Router の searchParams と食い違い、
 * 以降の setSearchParams で消したはずの `?lang=` が復活しうる。
 */
export const setLocaleAtom = atom(null, (_get, set, next: Locale) => {
  set(localeAtom, next);
  persistLocale(next);
  syncLocaleToServer(next);
});

/**
 * サーバーにも表示言語を伝える (R09)。
 *
 * サーバーは受信者の言語を知らないので、これが無いと通知メールを何語で送るか決められない。
 * `setLocaleAtom` は言語切替の**唯一の書き込み経路**なので、ここに置けばヘッダーのトグルも
 * `?lang=` 由来の切替も漏れなく拾える。
 *
 * 投げっぱなしにする — 失敗しても画面の言語切替は成立させる (次に切り替えたときに追いつく)。
 * 未ログイン時と未登録時は送らない (前者はトークンが無い、後者は 404 になる)。
 */
function syncLocaleToServer(locale: Locale): void {
  if (!auth.currentUser) return;
  authApi.updateOptions({ locale }).catch(() => {});
}
