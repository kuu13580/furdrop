import { Link, useParams } from "react-router";

export default function DonePage() {
  const { handle } = useParams();

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-sm space-y-6 px-4 text-center">
        <div className="text-5xl">✓</div>
        <h1 className="text-xl font-bold">送信完了！</h1>
        <p className="text-gray-500">TODO: サムネイル一覧</p>
        <Link
          to={`/send/${handle}/upload`}
          className="block rounded-lg bg-blue-600 px-4 py-3 font-medium text-white"
        >
          別の写真を送る
        </Link>
      </div>
    </div>
  );
}
