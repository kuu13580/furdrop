/** Wrangler は .txt を文字列モジュールとして取り込む (bundling の既定動作)。 */
declare module "*.txt" {
  const content: string;
  export default content;
}
