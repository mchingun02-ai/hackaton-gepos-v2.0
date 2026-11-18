import { NextResponse } from "next/server";
import { status } from "@/lib/catalog/server";

export async function GET() {
  return NextResponse.json(status());
}
