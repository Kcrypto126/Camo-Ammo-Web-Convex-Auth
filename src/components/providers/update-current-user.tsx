import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api.js";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { Spinner } from "../ui/spinner";

// This will automatically run and store the user
function useUpdateCurrentUserEffect() {
  const { isAuthenticated } = useConvexAuth();
  const updateCurrentUser = useMutation(api.users.updateCurrentUser);
  const currentUser = useQuery(
    api.users.getCurrentUser,
    isAuthenticated ? {} : "skip",
  );
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [userCreated, setUserCreated] = useState(false);

  // Check if user already exists (created by auth callbacks)
  useEffect(() => {
    if (currentUser !== undefined) {
      if (currentUser !== null) {
        console.log("[UpdateCurrentUser] User found via getCurrentUser query");
        setUserCreated(true);
        setIsCreatingUser(false);
      }
      // If currentUser is null, it means either:
      // - No identity (not authenticated)
      // - Identity exists but no email (auth callbacks haven't finished)
      // In both cases, we'll wait for updateCurrentUser or auth callbacks
    }
  }, [currentUser]);

  useEffect(() => {
    if (!isAuthenticated) {
      setUserCreated(false);
      return;
    }

    // If user already exists, we're done
    if (currentUser !== undefined && currentUser !== null) {
      return;
    }

    // Try updateCurrentUser once - if email is available, it will create/update the user
    // If email isn't available, we'll rely on auth callbacks and the query
    let timeoutId: NodeJS.Timeout | null = null;

    async function tryUpdateUser() {
      setIsCreatingUser(true);
      try {
        const result = await updateCurrentUser();
        if (result !== null) {
          // Successfully created/updated user
          setUserCreated(true);
          setIsCreatingUser(false);
        } else {
          // Email not available - auth callbacks will handle user creation
          // The getCurrentUser query will detect when user is created
          console.log(
            "[UpdateCurrentUser] Email not available, waiting for auth callbacks to create user",
          );
          setIsCreatingUser(false);
          // Don't set userCreated - will be set by the getCurrentUser query effect
        }
      } catch (error) {
        console.error("[UpdateCurrentUser] Failed to update user:", error);
        // If error is UNAUTHENTICATED, identity might not be ready yet
        // Wait a bit and try once more, then rely on query
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        if (errorMessage.includes("UNAUTHENTICATED")) {
          console.log(
            "[UpdateCurrentUser] Identity not ready yet, will wait for auth callbacks",
          );
          setIsCreatingUser(false);
        } else {
          setUserCreated(false);
          setIsCreatingUser(false);
        }
      }
    }

    // Add a small delay to ensure identity is fully available
    timeoutId = setTimeout(() => {
      tryUpdateUser();
    }, 200);

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [isAuthenticated, updateCurrentUser, currentUser]);

  return { isCreatingUser, userCreated };
}

function LoadingPage() {
  return (
    <div className="flex items-center justify-center h-svh">
      <Spinner className="size-8" />
    </div>
  );
}

// Component that automatically stores the user when authenticated
export function UpdateCurrentUserProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated } = useConvexAuth();
  const { isCreatingUser, userCreated } = useUpdateCurrentUserEffect();
  const currentUser = useQuery(
    api.users.getCurrentUser,
    isAuthenticated ? {} : "skip",
  );

  // Add timeout state - must be at top level (Rules of Hooks)
  const [hasTimedOut, setHasTimedOut] = useState(false);

  // Timeout effect - wait for auth callbacks to complete
  useEffect(() => {
    if (currentUser === null && isAuthenticated && !userCreated) {
      const timeout = setTimeout(() => {
        console.warn(
          "[UpdateCurrentUser] Timeout waiting for user creation, proceeding anyway",
        );
        setHasTimedOut(true);
      }, 10000); // 10 second timeout

      return () => clearTimeout(timeout);
    } else {
      setHasTimedOut(false);
    }
  }, [currentUser, isAuthenticated, userCreated]);

  // State 1: User unauthenticated - render children
  if (!isAuthenticated) {
    return <>{children}</>;
  }

  // State 2: User authenticated and exists in DB - render children
  // Check both userCreated state and currentUser query
  if (userCreated || (currentUser !== undefined && currentUser !== null)) {
    return <>{children}</>;
  }

  // State 3: User authenticated but not in DB yet - show loading
  // But only if we're actively creating or if query is still loading
  if (isCreatingUser || currentUser === undefined) {
    return <LoadingPage />;
  }

  // If currentUser is null (defined but no user), auth callbacks are handling it
  // If timed out, show children anyway (auth might complete later)
  if (hasTimedOut) {
    console.log("[UpdateCurrentUser] Timeout reached, rendering children");
    return <>{children}</>;
  }

  return <LoadingPage />;
}
