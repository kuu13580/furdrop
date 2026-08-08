import babel from "@rolldown/plugin-babel";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // src 側が `msg` マクロを使うため、テストでも展開しておく。
  // 未展開だと @lingui/core/macro のランタイム shim が babel-plugin-macros を要求して落ちる。
  plugins: [babel({ plugins: ["@lingui/babel-plugin-lingui-macro"] })],
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
