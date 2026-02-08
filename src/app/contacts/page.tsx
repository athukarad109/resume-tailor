"use client";

import { useState } from "react";

import type { Contact, DiscoverResponse } from "@/lib/types/contacts";

export default function ContactDiscoveryPage() {
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [location, setLocation] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);

    const res = await fetch("/api/contacts/discover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company,
        role: role || null,
        location: location || null,
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      setError(detail || "No contacts found yet.");
      setContacts([]);
      setIsLoading(false);
      return;
    }

    const data = (await res.json()) as DiscoverResponse;
    setContacts(data.contacts);
    setIsLoading(false);
  };

  return (
    <main style={{ padding: "2rem", maxWidth: 760, margin: "0 auto" }}>
      <h1 style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>Contact Discovery</h1>
      <p style={{ marginBottom: "2rem" }}>
        Start with a company and optional role/location. The worker will return any discovered contacts.
      </p>

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: "0.75rem" }}>
        <label>
          Company
          <input
            value={company}
            onChange={(event) => setCompany(event.target.value)}
            required
            placeholder="Acme Inc"
            style={{ display: "block", width: "100%", padding: "0.5rem" }}
          />
        </label>
        <label>
          Role (optional)
          <input
            value={role}
            onChange={(event) => setRole(event.target.value)}
            placeholder="Engineering Manager"
            style={{ display: "block", width: "100%", padding: "0.5rem" }}
          />
        </label>
        <label>
          Location (optional)
          <input
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            placeholder="Austin, TX"
            style={{ display: "block", width: "100%", padding: "0.5rem" }}
          />
        </label>
        <button type="submit" disabled={!company || isLoading}>
          {isLoading ? "Searching..." : "Find contacts"}
        </button>
      </form>

      {error && (
        <div style={{ marginTop: "1rem", color: "crimson" }}>
          <strong>Notice:</strong> {error}
        </div>
      )}

      {contacts.length > 0 && (
        <section style={{ marginTop: "2rem" }}>
          <h2 style={{ marginBottom: "1rem" }}>Matches</h2>
          <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: "1rem" }}>
            {contacts.map((contact) => (
              <li
                key={contact.id}
                style={{ border: "1px solid #ddd", padding: "1rem", borderRadius: 8 }}
              >
                <div style={{ fontWeight: 600 }}>{contact.full_name}</div>
                <div>{contact.title ?? ""}</div>
                <div>{contact.company}</div>
                {contact.email && <div>{contact.email}</div>}
                {contact.source && <div style={{ color: "#666" }}>Source: {contact.source}</div>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
