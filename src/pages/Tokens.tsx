import { useI18n } from "@/i18n";
import { Card, CardContent, EmptyState } from "@/components/ui";
import { Ticket } from "lucide-react";

export function Tokens() {
  const { t } = useI18n();
  return (
    <div className="p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-text-primary">{t("nav_tokens")}</h1>
        <p className="text-sm text-text-secondary mt-1">Token management for community distributions</p>
      </div>

      <Card>
        <CardContent className="p-0">
          <EmptyState
            icon={<Ticket className="h-12 w-12 mx-auto" />}
            title="Token management coming soon"
            description="This feature is under development. Token distribution events for Eid, Ramadan, and other occasions will be available here."
          />
        </CardContent>
      </Card>
    </div>
  );
}
