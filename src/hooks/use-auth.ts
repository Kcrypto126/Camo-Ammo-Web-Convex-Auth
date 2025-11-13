import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useMemo } from "react";

export function useAuth() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { signIn, signOut } = useAuthActions();
  const user = useQuery(api.users.getCurrentUser, isAuthenticated ? {} : "skip");

  return useMemo(
    () => ({
      isLoading,
      isAuthenticated,
      user,
      signIn,
      signOut,
    }),
    [isLoading, isAuthenticated, user, signIn, signOut]
  );
}

type UseUserProps = {
  /**
   * Whether to automatically redirect to the login if the user is not authenticated
   */
  shouldRedirect?: boolean;
};

export function useUser({ shouldRedirect }: UseUserProps = {}) {
  const { user, isLoading, isAuthenticated } = useAuth();

  return useMemo(() => {
    const id = user?._id;
    const name = user?.name;
    const email = user?.email;
    const avatar = user?.avatar;
    
    return {
      ...(user ?? {}),
      id,
      name,
      email,
      avatar,
      isAuthenticated,
      isLoading,
    };
  }, [user, isAuthenticated, isLoading]);
}
