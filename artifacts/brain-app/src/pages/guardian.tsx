import { useLocation } from "wouter";

export function GuardianPage() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center px-6">
      <div className="max-w-md text-center space-y-6">
        <div className="text-5xl">🛡️</div>
        <h1 className="text-3xl font-black text-white">br(AI)n</h1>
        <p className="text-zinc-400">
          This is a private, locally-hosted care workspace. Sign in to access
          your workspace.
        </p>
        <button
          onClick={() => navigate("/")}
          className="w-full px-6 py-4 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-lg text-lg transition-all"
        >
          Go to Sign In
        </button>
      </div>
    </div>
  );
}
