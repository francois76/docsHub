"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GitBranch, RefreshCw, BookOpen, AlertTriangle, X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Repo {
  name: string;
  type: string;
  defaultBranch: string;
  docsDir: string;
}

interface Props {
  currentRepo: string;
  currentBranch: string;
  onSync?: () => void;
}

export function TopBar({ currentRepo, currentBranch, onSync }: Props) {
  const router = useRouter();
  const [repos, setRepos] = useState<Repo[]>([]);
  const [branches, setBranches] = useState<{ name: string }[]>([]);
  const [branchError, setBranchError] = useState<{ code: string; hint: string } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/repos")
      .then((r) => r.json())
      .then((d) => setRepos(d.repos ?? []));
  }, []);

  const loadBranches = useCallback(() => {
    if (!currentRepo) return;
    setBranchError(null);
    fetch(`/api/repos/${encodeURIComponent(currentRepo)}/branches`)
      .then((r) => r.json())
      .then((d) => {
        setBranches(d.branches ?? []);
        if (d.error) {
          setBranchError({ code: d.error, hint: d.hint ?? "Impossible de charger les branches." });
        }
      });
  }, [currentRepo]);

  useEffect(() => {
    loadBranches();
  }, [loadBranches]);

  const handleRepoChange = (name: string) => {
    const repo = repos.find((r) => r.name === name);
    router.push(
      `/docs/${encodeURIComponent(name)}/${repo?.defaultBranch ?? "main"}`
    );
  };

  const handleBranchChange = (branch: string) => {
    router.push(
      `/docs/${encodeURIComponent(currentRepo)}/${encodeURIComponent(branch)}`
    );
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      const res = await fetch(`/api/repos/${encodeURIComponent(currentRepo)}/sync`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setSyncError(data.error ?? "Erreur inconnue lors de la synchronisation.");
      } else {
        // Reload branches after successful sync
        loadBranches();
        onSync?.();
      }
    } catch {
      setSyncError("Impossible de contacter le serveur.");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <>
      <header className="h-14 border-b flex items-center px-4 gap-3 bg-background sticky top-0 z-30 relative overflow-hidden">
        <div className="flex items-center gap-2 text-primary font-bold text-lg mr-4">
          <BookOpen className="h-5 w-5" />
          <span>docsHub</span>
        </div>

        {/* Repo selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground hidden sm:inline">Repo</span>
          <Select value={currentRepo} onValueChange={handleRepoChange}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Select repository…" />
            </SelectTrigger>
            <SelectContent>
              {repos.map((repo) => (
                <SelectItem key={repo.name} value={repo.name}>
                  {repo.name}
                  <span className="ml-2 text-xs text-muted-foreground">
                    ({repo.type})
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Branch selector */}
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-muted-foreground" />
          <Select value={currentBranch} onValueChange={handleBranchChange}>
            <SelectTrigger className={cn("w-44", branchError && "border-amber-500")}>
              <SelectValue placeholder={branchError ? "Aucune branche" : "Select branch…"} />
            </SelectTrigger>
            <SelectContent>
              {branches.length === 0 && branchError ? (
                <div className="px-3 py-2 text-xs text-muted-foreground italic">
                  Aucune branche disponible
                </div>
              ) : (
                branches.map((b) => (
                  <SelectItem key={b.name} value={b.name}>
                    {b.name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          {branchError && (
            <span
              title={branchError.hint}
              className="flex items-center text-amber-500 cursor-help"
            >
              <AlertTriangle className="h-4 w-4" />
            </span>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSync}
            disabled={syncing}
            className="gap-1"
          >
            <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
            <span className="hidden sm:inline">{syncing ? "Sync…" : "Sync"}</span>
          </Button>
        </div>

        {/* Indeterminate progress bar */}
        {syncing && (
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary/20 overflow-hidden">
            <div className="h-full bg-primary animate-indeterminate" />
          </div>
        )}
      </header>

      {/* Sync error modal */}
      {syncError && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setSyncError(null)}
        >
          <div
            className="bg-background rounded-lg shadow-xl max-w-md w-full p-6 flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5 shrink-0" />
                <h2 className="font-semibold">Erreur de synchronisation</h2>
              </div>
              <button
                onClick={() => setSyncError(null)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">{syncError}</p>
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={() => setSyncError(null)}>
                Fermer
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
