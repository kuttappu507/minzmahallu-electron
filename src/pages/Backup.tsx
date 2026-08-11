import { useState } from "react";
import { Database, Loader2, CheckCircle2, FileArchive } from "lucide-react";
import { useI18n } from "@/i18n";
import { Card, CardContent, Button } from "@/components/ui";
import { toast } from "@/lib/toast";

export function Backup() {
  const { t } = useI18n();
  const [creating, setCreating] = useState(false);
  const [lastBackup, setLastBackup] = useState<string | null>(null);

  const handleCreateBackup = async () => {
    setCreating(true);
    try {
      const result = await window.mms.backup.create();
      const path = typeof result === "string" ? result : result?.path;
      setLastBackup(path);
      toast.success("Backup created successfully");
    } catch (err: any) {
      toast.error(err.message || "Failed to create backup");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">{t("bak_title")}</h1>
        <p className="text-sm text-text-secondary mt-1">Create database snapshots for safekeeping</p>
      </div>

      <Card className="max-w-2xl">
        <CardContent className="p-8">
          <div className="flex flex-col items-center text-center gap-4">
            <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-primary-subtle text-primary">
              <Database className="h-8 w-8" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text-primary">Database Backup</h2>
              <p className="text-sm text-text-secondary mt-1 max-w-md">
                Create a full snapshot of your mahallu database. The backup file is stored in your app data directory.
              </p>
            </div>
            <Button size="lg" onClick={handleCreateBackup} disabled={creating} className="mt-2">
              {creating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <FileArchive className="h-4 w-4" />
                  {t("bak_create_now")}
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {lastBackup && (
        <Card className="max-w-2xl">
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-text-primary">Latest backup created</p>
                <p className="text-xs text-text-tertiary mt-1 break-all font-mono bg-surface-hover rounded px-2 py-1">
                  {lastBackup}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
