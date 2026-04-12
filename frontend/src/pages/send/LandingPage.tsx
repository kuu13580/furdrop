import { Link, useParams } from "react-router";

export default function LandingPage() {
  const { handle } = useParams();

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-sm space-y-6 px-4 text-center">
        <div className="mx-auto h-20 w-20 rounded-full bg-gray-200" />
        <h1 className="text-xl font-bold">{handle}</h1>
        <p className="text-gray-600">写真を{handle}さんに送れます</p>
        <Link
          to={`/send/${handle}/upload`}
          className="block rounded-lg bg-blue-600 px-4 py-3 font-medium text-white"
        >
          写真を送る
        </Link>
      </div>
    </div>
  );
}
