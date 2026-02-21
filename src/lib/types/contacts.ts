export type Contact = {
  id?: number;
  full_name: string;
  title?: string | null;
  company: string;
  email?: string | null;
  source?: string | null;
  linkedin_url?: string | null;
  relevance_notes?: string | null;
  created_at?: string;
};

export type DiscoverResponse = {
  requested_company: string;
  contacts: Contact[];
};
