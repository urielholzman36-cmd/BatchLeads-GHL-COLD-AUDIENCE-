"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import SendProgress from "@/components/send-progress";
import type { ScoredLead, SendResult } from "@/lib/types";

export default function SendPage() {
  const router = useRouter();
  const [total, setTotal] = useState(0);
  const [current, setCurrent] = useState(0);
  const [results, setResults] = useState<SendResult[]>([]);
  const [done, setDone] = useState(false);
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    const stored = sessionStorage.getItem("outreach_send");
    if (!stored) {
      router.replace("/");
      return;
    }

    let leads: ScoredLead[];
    try {
      leads = JSON.parse(stored);
    } catch {
      router.replace("/");
      return;
    }

    if (leads.length === 0) {
      router.replace("/");
      return;
    }

    setTotal(leads.length);
    sendLeads(leads);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function sendLeads(leads: ScoredLead[]) {
    const allResults: SendResult[] = [];

    for (let i = 0; i < leads.length; i++) {
      setCurrent(i + 1);
      try {
        const res = await fetch("/api/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leads: [leads[i]] }),
        });
        const data = await res.json();
        const result: SendResult = data.results?.[0] ?? {
          leadId: leads[i].id,
          firstName: leads[i].firstName,
          lastName: leads[i].lastName,
          phone: leads[i].phone,
          address: leads[i].propertyAddress,
          score: leads[i].score,
          message: leads[i].message,
          ghlContactId: null,
          status: "failed",
          error: "No result returned",
          sentAt: new Date().toISOString(),
        };
        allResults.push(result);
        setResults([...allResults]);
      } catch (err) {
        allResults.push({
          leadId: leads[i].id,
          firstName: leads[i].firstName,
          lastName: leads[i].lastName,
          phone: leads[i].phone,
          address: leads[i].propertyAddress,
          score: leads[i].score,
          message: leads[i].message,
          ghlContactId: null,
          status: "failed",
          error: err instanceof Error ? err.message : "Unknown error",
          sentAt: new Date().toISOString(),
        });
        setResults([...allResults]);
      }
    }

    sessionStorage.removeItem("outreach_send");
    setDone(true);
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Sending Messages</h1>
        {done && (
          <Link
            href="/"
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium px-5 py-2.5 rounded-lg transition-colors"
          >
            New Upload
          </Link>
        )}
      </div>

      <SendProgress total={total} current={current} results={results} done={done} />

      {done && (
        <div className="mt-4 flex gap-3">
          <Link href="/" className="text-sm text-gray-500 hover:underline">
            Upload new leads
          </Link>
        </div>
      )}
    </div>
  );
}
