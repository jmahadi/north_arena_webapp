export default function Loading() {
  return (
    <div className="fixed inset-0 bg-gray-900 flex flex-col items-center justify-center z-50">
      <div className="relative" style={{ width: 96, height: 96 }}>
        {/* Spinning ring */}
        <svg
          className="animate-spin"
          style={{ width: 96, height: 96 }}
          viewBox="0 0 50 50"
        >
          <circle
            cx="25"
            cy="25"
            r="20"
            fill="none"
            stroke="rgba(249, 115, 22, 0.3)"
            strokeWidth={5}
          />
          <circle
            cx="25"
            cy="25"
            r="20"
            fill="none"
            stroke="#f97316"
            strokeWidth={5}
            strokeLinecap="round"
            strokeDasharray="31.4 94.2"
          />
        </svg>
        {/* Center icon */}
        <div className="absolute inset-0 flex items-center justify-center">
          <svg
            className="animate-pulse"
            style={{ width: 48, height: 48 }}
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle cx="12" cy="12" r="10" stroke="white" strokeWidth="1.5" fill="none" />
            <circle cx="12" cy="12" r="3" fill="white" />
            <path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="white" strokeWidth="1" />
          </svg>
        </div>
      </div>
      <p className="mt-4 text-gray-400 text-sm font-medium">Loading...</p>
    </div>
  );
}
