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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-slate-500 block mb-1">{label}</label>
      {children}
    </div>
  );
}

export function SettingsClient({ initialSettings }: Props) {
  const [companyName, setCompanyName] = useState(initialSettings.company_name);
  const [address, setAddress] = useState(initialSettings.address ?? "");
  const [gstin, setGstin] = useState(initialSettings.gstin ?? "");
  const [panNo, setPanNo] = useState(initialSettings.pan_no ?? "");
  const [tanNo, setTanNo] = useState(initialSettings.tan_no ?? "");
  const [bankName, setBankName] = useState(initialSettings.bank_name ?? "");
  const [bankAccountNo, setBankAccountNo] = useState(initialSettings.bank_account_no ?? "");
  const [bankIfsc, setBankIfsc] = useState(initialSettings.bank_ifsc ?? "");
  const [bankBranch, setBankBranch] = useState(initialSettings.bank_branch ?? "");
  const [invoiceTerms, setInvoiceTerms] = useState(initialSettings.invoice_terms ?? "");
  const [isSaving, setIsSaving] = useState(false);

  async function handleSave() {
    if (!companyName.trim()) { toast.error("Company name is required."); return; }
    if (gstin && gstin.length !== 15) { toast.error("GSTIN must be 15 characters."); return; }
    setIsSaving(true);
    try {
      await upsertCompanySettings({
        company_name: companyName.trim(),
        address: address.trim() || null,
        gstin: gstin.trim() || null,
        pan_no: panNo.trim() || null,
        tan_no: tanNo.trim() || null,
        bank_name: bankName.trim() || null,
        bank_account_no: bankAccountNo.trim() || null,
        bank_ifsc: bankIfsc.trim().toUpperCase() || null,
        bank_branch: bankBranch.trim() || null,
        invoice_terms: invoiceTerms.trim() || null,
      });
      toast.success("Company settings saved.");
    } catch {
      toast.error("Failed to save settings.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-lg font-semibold text-slate-800 mb-6">Company Settings</h1>

      {/* Company Identity */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4 mb-4">
        <h2 className="text-sm font-medium text-slate-700">Company Identity</h2>
        <Field label="Company Name">
          <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="e.g. DURGA INDUSTRIES" className="text-sm" />
        </Field>
        <Field label="Address">
          <textarea
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Full business address"
            rows={3}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
          />
        </Field>
        <div className="grid grid-cols-3 gap-4">
          <Field label="GSTIN">
            <Input value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())} placeholder="15-char GSTIN" maxLength={15} className="text-sm font-mono" />
            {gstin && gstin.length !== 15 && <p className="text-xs text-amber-600 mt-1">{gstin.length}/15</p>}
          </Field>
          <Field label="PAN No.">
            <Input value={panNo} onChange={(e) => setPanNo(e.target.value.toUpperCase())} placeholder="AAAAA0000A" maxLength={10} className="text-sm font-mono" />
          </Field>
          <Field label="TAN No.">
            <Input value={tanNo} onChange={(e) => setTanNo(e.target.value.toUpperCase())} placeholder="AAAA00000A" maxLength={10} className="text-sm font-mono" />
          </Field>
        </div>
      </div>

      {/* Bank Details */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4 mb-4">
        <h2 className="text-sm font-medium text-slate-700">Bank Details <span className="text-xs text-slate-400 font-normal">(shown on invoice PDFs)</span></h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Bank Name">
            <Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="e.g. State Bank of India" className="text-sm" />
          </Field>
          <Field label="Account Number">
            <Input value={bankAccountNo} onChange={(e) => setBankAccountNo(e.target.value)} placeholder="e.g. 1234567890" className="text-sm font-mono" />
          </Field>
          <Field label="IFSC Code">
            <Input value={bankIfsc} onChange={(e) => setBankIfsc(e.target.value.toUpperCase())} placeholder="e.g. SBIN0001234" maxLength={11} className="text-sm font-mono" />
          </Field>
          <Field label="Branch">
            <Input value={bankBranch} onChange={(e) => setBankBranch(e.target.value)} placeholder="e.g. Karur Main Branch" className="text-sm" />
          </Field>
        </div>
      </div>

      {/* Invoice Terms */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4 mb-4">
        <h2 className="text-sm font-medium text-slate-700">Invoice Terms <span className="text-xs text-slate-400 font-normal">(shown in invoice PDF footer)</span></h2>
        <textarea
          value={invoiceTerms}
          onChange={(e) => setInvoiceTerms(e.target.value)}
          placeholder="e.g. Payment due within 30 days. Goods once sold will not be taken back."
          rows={3}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
        />
      </div>

      <Button size="sm" onClick={handleSave} disabled={isSaving}>
        {isSaving ? "Saving…" : "Save Settings"}
      </Button>

      <p className="text-xs text-slate-400 mt-4">
        These details appear on all generated PDFs (invoices, purchase orders).
      </p>
    </div>
  );
}
