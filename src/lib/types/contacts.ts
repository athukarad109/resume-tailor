export type Contact = {
  id: number;
  full_name: string;
  title?: string | null;
  company: string;
  email?: string | null;
  source?: string | null;
  created_at: string;
};

export type DiscoverResponse = {
  requested_company: string;
  contacts: Contact[];
};
