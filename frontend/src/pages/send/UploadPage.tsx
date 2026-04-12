import { useParams } from "react-router";

export default function UploadPage() {
  const { handle } = useParams();

  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 py-8">
      <h1 className="text-xl font-bold">{handle}さんへ</h1>
      <p className="text-gray-500">TODO: ファイル選択 + 送信者情報入力</p>
    </div>
  );
}
