import { AlertMessage } from "@/components/Alerts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { i18n, Locale } from "@/lib/i18n-config";
import {
  $createAlert,
  $updateAlert,
  getAlertsQueryOptions,
  GetAlertsResponse,
} from "@/serverFunctions/alert";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { format } from "date-fns";
import { Save } from "lucide-react";
import { useEffect, useState } from "react";
import { Textarea } from "../../../components/ui/textarea";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { Card } from "@/components/Card";

interface AlertContentProps {
  alert?: GetAlertsResponse[number];
}

export function AlertContent({ alert }: AlertContentProps) {
  const queryClient = useQueryClient();
  const { user } = useRouteContext({ from: "__root__" });

  const [isActive, setIsActive] = useState(alert?.isActive || false);
  const [translations, setTranslations] = useState({
    en: {
      title: "",
      message: "",
    },
    ja: {
      title: "",
      message: "",
    },
  });

  // Update form when alert changes
  useEffect(() => {
    if (alert) {
      setIsActive(alert.isActive);
      const enTranslation = alert.translations.find((t) => t.locale === "en");
      const jaTranslation = alert.translations.find((t) => t.locale === "ja");

      setTranslations({
        en: {
          title: enTranslation?.title || "",
          message: enTranslation?.message || "",
        },
        ja: {
          title: jaTranslation?.title || "",
          message: jaTranslation?.message || "",
        },
      });
    } else {
      // Reset form for new alert
      setIsActive(false);
      setTranslations({
        en: { title: "", message: "" },
        ja: { title: "", message: "" },
      });
    }
  }, [alert]);

  const { mutate: updateAlert, isPending: isUpdating } = useMutation({
    mutationFn: (data: any) => $updateAlert({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries(getAlertsQueryOptions({ limit: 100 }));
    },
  });

  const { mutate: createAlert, isPending: isCreating } = useMutation({
    mutationFn: (data: any) => $createAlert({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries(getAlertsQueryOptions({ limit: 100 }));
    },
  });

  const handleSave = () => {
    const translationsArray = [
      {
        locale: "en",
        title: translations.en.title,
        message: translations.en.message,
      },
      {
        locale: "ja",
        title: translations.ja.title,
        message: translations.ja.message,
      },
    ].filter((t) => t.title.trim() || t.message.trim());

    if (alert) {
      // Update existing alert
      updateAlert({
        alertId: alert.id,
        isActive,
        translations: translationsArray,
      });
    } else {
      // Create new alert
      if (!user?.id) {
        window.alert("Please log in to create alerts");
        return;
      }

      createAlert({
        authorId: user.id,
        translations: translationsArray,
      });
    }
  };

  const isLoading = isUpdating || isCreating;

  const hasContent =
    translations.en.title ||
    translations.en.message ||
    translations.ja.title ||
    translations.ja.message;

  const [selectedLocale, setSelectedLocale] = useState<Locale>(
    i18n.defaultLocale
  );

  if (!alert && !hasContent) {
    return (
      <div className="text-muted-foreground flex h-64 flex-col items-center justify-center">
        <p>Select an alert to edit or create a new one</p>
      </div>
    );
  }

  return (
    <Card
      className="flex-1 space-y-6"
      captionSize={"sm"}
      caption={
        <div className="flex items-center gap-5">
          <span className="text-sm">Content</span>
          <LocaleSwitcher
            locale={selectedLocale}
            onSwitchLocale={setSelectedLocale}
          />
        </div>
      }
    >
      {/* Header with status and actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {alert?.createdAt && (
            <span className="text-muted-foreground text-sm">
              Created: {format(new Date(alert.createdAt), "MMM dd, yyyy")}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={handleSave} disabled={isLoading}>
            <Save className="mr-2 h-4 w-4" />
            {isLoading ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      {/* Language tabs */}
      <Tabs value={selectedLocale} className="w-full">
        {i18n.locales.map((locale) => (
          <TabsContent key={locale} value={locale} className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={translations[locale]?.title || ""}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setTranslations((prev) => ({
                    ...prev,
                    [locale]: { ...prev[locale], title: e.target.value },
                  }))
                }
                placeholder={`Enter alert title in ${locale}`}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="en-message">Message</Label>
              <Textarea
                id="message"
                value={translations[locale]?.message || ""}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  setTranslations((prev) => ({
                    ...prev,
                    [locale]: { ...prev[locale], message: e.target.value },
                  }))
                }
                placeholder={`Enter alert message in ${locale}`}
                rows={4}
              />
            </div>
            <div className="space-y-4">
              <Label>Preview</Label>

              <AlertMessage {...translations[locale]} alertId="" />
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </Card>
  );
}
