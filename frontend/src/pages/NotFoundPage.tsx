import { Link } from "react-router";

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="space-y-4 text-center">
        <h1 className="text-6xl font-bold text-gray-300">404</h1>
        <p className="text-gray-600">ページが見つかりません</p>
        <Link to="/" className="inline-block text-blue-600 underline">
          トップに戻る
        </Link>
      </div>
    </div>
  );
}
