export const INDIAN_STATES = [
  "Andaman and Nicobar Islands",
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chandigarh",
  "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jammu and Kashmir",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Ladakh",
  "Lakshadweep",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Puducherry",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
] as const;

export const PO_STATUS = {
  DRAFT: "Draft",
  RECEIVED: "Received",
} as const;

export const MI_STATUS = {
  DRAFT: "Draft",
  ISSUED: "Issued",
} as const;

export const INVOICE_STATUS = {
  DRAFT: "Draft",
  FINALIZED: "Finalized",
  CANCELLED: "Cancelled",
} as const;

export const PAYMENT_STATUS = {
  UNPAID: "Unpaid",
  PARTIAL: "Partial",
  PAID: "Paid",
} as const;

export const LEDGER_TYPE = {
  PO_INWARD: "PO_INWARD",
  ISSUE: "ISSUE",
  REVERSAL: "REVERSAL",
  ADJUSTMENT: "ADJUSTMENT",
} as const;
