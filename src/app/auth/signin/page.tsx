"use client";

import { signIn, getProviders } from "next-auth/react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Github } from "lucide-react";

export default function SignInPage() {
  const [providers, setProviders] = useState<any>({});

  useEffect(() => {
    getProviders().then((p) => setProviders(p ?? {}));
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center max-w-sm p-8 border rounded-xl bg-card shadow-sm">
        <h1 className="text-2xl font-bold mb-2">Sign In</h1>
        <p className="text-muted-foreground text-sm mb-6">
          Sign in to enable PR reviews on your repositories.
        </p>
        <div className="flex flex-col gap-3">
          {Object.values(providers).map((provider: any) => (
            <Button
              key={provider.id}
              onClick={() => signIn(provider.id, { callbackUrl: "/" })}
              variant="outline"
              className="gap-2"
            >
              <Github className="h-4 w-4" />
              Sign in with {provider.name}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
