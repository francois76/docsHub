"use client";

import { signIn, getProviders, type ClientSafeProvider } from "next-auth/react";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
// eslint-disable-next-line sonarjs/deprecation
import { Github } from "lucide-react"; // Brand icons deprecated in lucide v1 — will be replaced

interface RepoEntry { name: string; type: string; }

function SignInContent(): React.JSX.Element {
  const searchParams = useSearchParams();
  const repoParameter = searchParams.get("repo");
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";

  const [providers, setProviders] = useState<Record<string, ClientSafeProvider>>({});
  const [repoType, setRepoType] = useState<string | null>(null);

  useEffect(() => {
    void getProviders().then((p) => { setProviders(p ?? {}); });
  }, []);

  useEffect(() => {
    if (repoParameter) {
      void fetch("/api/repos")
        .then((r) => r.json() as Promise<{ repos?: RepoEntry[] }>)
        .then((d) => {
          const repo = d.repos?.find(
            (r) => r.name === repoParameter
          );
          if (repo) setRepoType(repo.type);
        });
    }
  }, [repoParameter]);

  /* Filter providers to only show the one matching the repo type */
  const filteredProviders = Object.values(providers).filter((p: ClientSafeProvider) => {
    if (!repoType) return true; // no context → show all configured
    if (repoType === "github") return p.id === "github";
    if (repoType === "gitlab") return p.id === "gitlab";
    return false;
  });

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center max-w-sm p-8 border rounded-xl bg-card shadow-sm">
        <h1 className="text-2xl font-bold mb-2">Connexion</h1>
        <p className="text-muted-foreground text-sm mb-6">
          Connectez-vous pour activer les revues de PR.
        </p>
        <div className="flex flex-col gap-3">
          {filteredProviders.map((provider: ClientSafeProvider) => (
            <Button
              key={provider.id}
              onClick={() => signIn(provider.id, { callbackUrl })}
              variant="outline"
              className="gap-2"
            >
              {/* eslint-disable-next-line @typescript-eslint/no-deprecated, sonarjs/deprecation */}
              {provider.id === "github" && <Github className="h-4 w-4" />}
              Se connecter avec {provider.name}
            </Button>
          ))}
          {filteredProviders.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Aucun fournisseur d&apos;authentification configuré pour ce
              projet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen text-muted-foreground">
          Chargement…
        </div>
      }
    >
      <SignInContent />
    </Suspense>
  );
}
