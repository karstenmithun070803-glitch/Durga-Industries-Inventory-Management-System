"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { upsertCompanySettings } from "@/lib/actions/settings.actions";
import type { CompanySetting } from "@/lib/actions/settings.actions";

interface Props {
  initialSettings: CompanySetting;
}

export function SettingsClient({ initialSettings }: Props) {
  const [companyName, setCompanyName] = useState(initialSettings.company_name);
  const [address, setAddress] = useState(initialSettings.address ?? "");
  const [gstin, setGstin] = useState(initialSettings.gstin ?? "");
  const [isSaving, setIsSaving] = useState(false);

  async function handleSave() {
    if (!companyName.trim()) {
      toast.error("Company name is required.");
      return;
    }
    if (gstin && gstin.length !== 15) {
      toast.error("GSTIN must be 15 characters.");
      return;
    }
    setIsSaving(true);
    try {
      await upsertCompanySettings({
        company_name: companyName.trim(),
        address: address.trim() || null,
        gstin: gstin.trim() || null,
      });
      toast.success("Company settings saved.");
    } catch {
      toast.error("Failed to save settings.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-lg">
      <h1 className="text-lg font-semibold text-slate-800 mb-6">Company Settings</h1>

      <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <div>
          <label className="text-xs text-slate-500 block mb-1">Company Name</label>
          <Input
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="e.g. DURGA INDUSTRIES"
            className="text-sm"
          />
        </div>

        <div>
          <label className="text-xs text-slate-500 block mb-1">Address</label>
          <textarea
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Full business address"
            rows={3}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
          />
        </div>

        <div>
          <label className="text-xs text-slate-500 block mb-1">GSTIN</label>
          <Input
            value={gstin}
            onChange={(e) => setGstin(e.target.value.toUpperCase())}
            placeholder="15-character GSTIN"
            maxLength={15}
            className="text-sm font-mono"
          />
          {gstin && gstin.length !== 15 && (
            <p className="text-xs text-amber-600 mt-1">{gstin.length}/15 characters</p>
          )}
        </div>

        <div className="pt-2">
          <Button size="sm" onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving…" : "Save Settings"}
          </Button>
        </div>
      </div>

      <p className="text-xs text-slate-400 mt-4">
        These details appear on all generated PDFs (invoices, purchase orders).
      </p>
    </div>
  );
}
