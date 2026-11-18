import type { Method, Profile } from "@/lib/inventory/methods";
import type { Level } from "@/lib/inventory/reconcile";

export type Me = { authenticated: true; tenant: { id: string; name: string }; user: { name: string; role: "owner" | "manager" | "staff" | "device"; staffId: string }; scopes: string[] };

export type SessionStatus = "counting" | "review" | "approved" | "applied" | "cancelled";
export type SessionSummary = {
  id: string;
  no: number;
  name: string;
  scope: string;
  scopeRef: string | null;
  blind: boolean;
  status: SessionStatus;
  createdBy: string;
  createdAt: number;
  submittedBy: string | null;
  submittedAt: number | null;
  decidedBy: string | null;
  decidedAt: number | null;
  note: string | null;
  total: number;
  done: number;
  critical: number | null;
};

export type LineStatus = "pending" | "counted" | "recount" | "recounted" | "skipped";
export type PlaceQty = { place: string; qty: number; photo: boolean };
export type Line = {
  byPlace?: PlaceQty[];
  productId: string;
  name: string;
  barcode: string | null;
  unit: string;
  unitLabel: string;
  status: LineStatus;
  counted: number | null;
  profile: Profile & { method: Method };
  expected?: number;
  system?: number | null;
  variance?: number | null;
  level?: Level | null;
  value?: number | null;
  price?: number | null;
};
export type CountItem = { id: string; productId: string; method: Method; methodLabel: string; inputs: Record<string, number>; qty: number; source: string; photoId: string | null; confidence: number | null; place: string | null; by: string; at: number };
export type SessionFull = {
  session: Omit<SessionSummary, "total" | "done" | "critical">;
  places: string[];
  nextPlace: string;
  reveal: boolean;
  canApprove: boolean;
  progress: { total: number; done: number; pct: number };
  lines: Line[];
  counts: CountItem[];
};

export type Detection = {
  i: number;
  label: string;
  status: "matched" | "ambiguous" | "unknown";
  productId: string | null;
  name: string | null;
  via: string | null;
  score: number;
  candidates: { id: string; name: string; score: number }[];
  facings: number;
  rows: number;
  confidence: number;
  bbox: [number, number, number, number] | null;
  priceTag: number | null;
  depth: number | null;
  depthSource: "place" | "product" | "ai" | null;
  depthEst: number | null;
  depthConf: number;
  elsewhere: PlaceQty[];
  dupSuspect: { photoId: string; place: string } | null;
};
export type PhotoResp = {
  places?: string[];
  similar: { photoId: string; place: string; distance: number } | null;
  photo: { id: string; status: "done" | "failed"; w: number | null; h: number | null; place: string } | null;
  message: string | null;
  result: { place: string; detections: Detection[]; gaps: { near_label: string; price_tag_text: string | null; bbox: number[] | null }[]; quality: { blurry: boolean; too_dark: boolean; partial_shelf: boolean }; retake: string | null } | null;
};
export type ConfirmResp = { ok: boolean; place: string; replaced: number; saved: number; places: string[]; nextPlace: string };

export type Variance = {
  session: SessionSummary;
  total: number;
  counted: number;
  uncounted: number;
  levels: Record<Level, number>;
  shortage: number;
  surplus: number;
  net: number;
  methods: { method: string; label: string; count: number; pct: number }[];
  lines: (Line & { value: number | null })[];
  adjustments: { product_id: string; before: number; delta: number; after: number; value: number; status: string }[];
};
