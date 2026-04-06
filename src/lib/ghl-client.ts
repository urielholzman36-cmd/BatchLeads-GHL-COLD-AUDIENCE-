const BASE_URL = "https://services.leadconnectorhq.com";
const API_VERSION = "2021-07-28";

function getHeaders(): HeadersInit {
  const apiKey = process.env.GHL_API_KEY;
  if (!apiKey) throw new Error("GHL_API_KEY environment variable is not set");
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Version: API_VERSION,
  };
}

function getLocationId(): string {
  const locationId = process.env.GHL_LOCATION_ID;
  if (!locationId)
    throw new Error("GHL_LOCATION_ID environment variable is not set");
  return locationId;
}

export interface GHLContact {
  id: string;
  firstName: string;
}

/**
 * Search for an existing contact by phone number.
 * Returns basic contact info or null if not found.
 */
export async function searchContactByPhone(
  phone: string
): Promise<GHLContact | null> {
  const locationId = getLocationId();
  const url = new URL(`${BASE_URL}/contacts/search/duplicate`);
  url.searchParams.set("locationId", locationId);
  url.searchParams.set("number", phone);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: getHeaders(),
  });

  if (res.status === 404) return null;

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `GHL searchContactByPhone failed (${res.status}): ${text}`
    );
  }

  const data = await res.json();
  // GHL returns { contact: { id, firstName, ... } } or null
  const contact = data?.contact ?? data;
  if (!contact || !contact.id) return null;

  return {
    id: contact.id,
    firstName: contact.firstName ?? "",
  };
}

export interface CreateContactParams {
  firstName: string;
  lastName: string;
  phone: string;
  address1?: string;
  city?: string;
  state?: string;
  postalCode?: string;
}

/**
 * Create a new contact in GHL.
 * Returns the new contact's ID.
 */
export async function createContact(
  params: CreateContactParams
): Promise<string> {
  const locationId = getLocationId();

  const body = {
    locationId,
    firstName: params.firstName,
    lastName: params.lastName,
    phone: params.phone,
    address1: params.address1 ?? "",
    city: params.city ?? "",
    state: params.state ?? "",
    postalCode: params.postalCode ?? "",
    tags: ["vo360-outreach"],
    source: "vo360-outreach-v2",
  };

  const res = await fetch(`${BASE_URL}/contacts/`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GHL createContact failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  const contactId = data?.contact?.id ?? data?.id;
  if (!contactId) {
    throw new Error("GHL createContact: no contact ID in response");
  }

  return contactId;
}

/**
 * Send an SMS message to a contact via GHL conversations API.
 */
export async function sendSMS(
  contactId: string,
  message: string
): Promise<void> {
  const body = {
    type: "SMS",
    contactId,
    message,
  };

  const res = await fetch(`${BASE_URL}/conversations/messages`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GHL sendSMS failed (${res.status}): ${text}`);
  }
}
