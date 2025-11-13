import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth.ts";
import { Spinner } from "@/components/ui/spinner.tsx";

export default function AuthCallback() {
  const navigate = useNavigate();
  const { isLoading, isAuthenticated } = useAuth();

  useEffect(() => {
    // Redirect to home after auth completes
    if (!isLoading && isAuthenticated) {
      navigate("/", { replace: true });
    }
    // Handle auth errors
    else if (!isLoading && !isAuthenticated) {
      navigate("/", { replace: true });
    }
  }, [isLoading, isAuthenticated, navigate]);

  return (
    <div className="flex items-center justify-center h-svh">
      <Spinner className="size-8" />
    </div>
  );
}
