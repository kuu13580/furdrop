const sizes = {
  sm: "h-4 w-4",
  md: "h-6 w-6",
  lg: "h-8 w-8",
} as const;

type Props = {
  size?: keyof typeof sizes;
  className?: string;
};

export default function LoadingSpinner({ size = "md", className = "" }: Props) {
  return (
    <svg
      className={`animate-spin text-gray-400 ${sizes[size]} ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      role="img"
      aria-label="読み込み中"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
