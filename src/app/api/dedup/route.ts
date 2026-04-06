import { NextRequest, NextResponse } from "next/server";
import { searchContactByPhone } from "@/lib/ghl-client";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || !Array.isArray(body.phones)) {
    return NextResponse.json(
      { error: "phones array is required" },
      { status: 400 }
    );
  }

  const phones: string[] = body.phones;

  if (phones.length === 0) {
    return NextResponse.json(
      { error: "phones array must not be empty" },
      { status: 400 }
    );
  }

  const results: Record<string, boolean> = {};

  await Promise.all(
    phones.map(async (phone) => {
      const contact = await searchContactByPhone(phone);
      results[phone] = contact !== null;
    })
  );

  return NextResponse.json({ results });
}
