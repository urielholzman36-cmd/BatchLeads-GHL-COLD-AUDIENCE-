import { NextRequest, NextResponse } from "next/server";
import { createContact, sendSMS } from "@/lib/ghl-client";
import { getDb, insertSendLog } from "@/lib/db";
import type { ScoredLead, SendResult } from "@/lib/types";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || !Array.isArray(body.leads) || body.leads.length === 0) {
    return NextResponse.json(
      { error: "leads array is required and must not be empty" },
      { status: 400 }
    );
  }

  const leads: ScoredLead[] = body.leads;
  const db = getDb();
  const results: SendResult[] = [];

  for (const lead of leads) {
    const sentAt = new Date().toISOString();
    let ghlContactId: string | null = null;
    let status: "sent" | "failed" = "failed";
    let error: string | null = null;

    try {
      ghlContactId = await createContact({
        firstName: lead.firstName,
        lastName: lead.lastName,
        phone: lead.phone,
        address1: lead.propertyAddress,
        city: lead.city,
        state: lead.state,
        postalCode: lead.zip,
      });

      await sendSMS(ghlContactId, lead.message);
      status = "sent";
    } catch (err) {
      error = String(err);
      console.error(`[send] failed for lead ${lead.id}:`, err);
    }

    const result: SendResult = {
      leadId: lead.id,
      firstName: lead.firstName,
      lastName: lead.lastName,
      phone: lead.phone,
      address: lead.propertyAddress,
      score: lead.score,
      message: lead.message,
      ghlContactId,
      status,
      error,
      sentAt,
    };

    insertSendLog(db, result);
    results.push(result);
  }

  return NextResponse.json({ results });
}
