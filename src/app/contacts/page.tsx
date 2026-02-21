"use client";

import { useState } from "react";

import type { Contact, DiscoverResponse } from "@/lib/types/contacts";

import styles from "./page.module.css";

export default function ContactDiscoveryPage() {
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [location, setLocation] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    setHasSearched(false);

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
    setHasSearched(true);
    setIsLoading(false);
  };

  return (
    <main className={styles.main}>
      <h1 className={styles.title}>Contact Discovery</h1>
      <p className={styles.subtitle}>
        Start with a company and optional role/location. The worker will return any discovered contacts.
      </p>

      <form onSubmit={handleSubmit} className={styles.form}>
        <label className={styles.label}>
          Company
          <input
            className={styles.input}
            value={company}
            onChange={(event) => setCompany(event.target.value)}
            required
            placeholder="Acme Inc"
          />
        </label>
        <label className={styles.label}>
          Role (optional)
          <input
            className={styles.input}
            value={role}
            onChange={(event) => setRole(event.target.value)}
            placeholder="Engineering Manager"
          />
        </label>
        <label className={styles.label}>
          Location (optional)
          <input
            className={styles.input}
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            placeholder="Austin, TX"
          />
        </label>
        <button type="submit" className={styles.submitBtn} disabled={!company || isLoading}>
          {isLoading ? "Searching…" : "Find contacts"}
        </button>
      </form>

      {error && (
        <div className={styles.error}>
          <strong>Notice:</strong> {error}
        </div>
      )}

      {hasSearched && !error && contacts.length === 0 && (
        <div className={styles.empty}>
          No contacts found for this company. Try a different company or role.
        </div>
      )}

      {contacts.length > 0 && (
        <section>
          <h2 className={styles.matchesTitle}>Matches</h2>
          <ul className={styles.list}>
            {contacts.map((contact, index) => (
              <li
                key={contact.id ?? `discovered-${index}-${contact.full_name}-${contact.company}`}
                className={styles.card}
              >
                <div className={styles.cardName}>{contact.full_name}</div>
                {contact.title && <div className={styles.cardTitle}>{contact.title}</div>}
                <div className={styles.cardCompany}>{contact.company}</div>
                {contact.email && <div>{contact.email}</div>}
                {contact.linkedin_url && (
                  <a
                    href={contact.linkedin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.cardLink}
                  >
                    LinkedIn →
                  </a>
                )}
                {contact.relevance_notes && (
                  <div className={styles.cardRelevance}>{contact.relevance_notes}</div>
                )}
                {contact.source && <div className={styles.cardSource}>Source: {contact.source}</div>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
