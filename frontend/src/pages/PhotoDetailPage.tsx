import { useParams } from "react-router";

export default function PhotoDetailPage() {
  const { photoId } = useParams();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">フォト詳細</h1>
      <p className="text-gray-500">Photo ID: {photoId}</p>
    </div>
  );
}
