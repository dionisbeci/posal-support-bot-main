
import { auth } from "@/lib/firebase";
import { onAuthStateChanged, sendPasswordResetEmail, User } from "firebase/auth";
import { useEffect, useState } from "react";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const resetPassword = async () => {
    if (user) {
      await sendPasswordResetEmail(auth, user.email!);
    }
  };

  return { user, loading, resetPassword };
}
