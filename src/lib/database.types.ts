// Tabellernas form, för hand och avsiktligt.
//
// Supabase kan generera den här filen ur databasen, men då säger den bara vad
// som RÅKAR stå där just nu. Skriven för hand blir den i stället en spegel av
// supabase/migrations/, och avviker de åt från varandra blir det ett typfel vid
// bygget i stället för ett "column does not exist" mitt i en kundorder.
//
// Ändras schemat: skriv en ny migration och uppdatera den här filen i samma
// ändring.
//
// TYPALIAS, inte interface. En interface får ingen implicit indexsignatur och
// uppfyller därför inte supabase-js krav Record<string, unknown>. Skillnaden
// syns inte i filen — den syns genom att klienten tyst faller tillbaka på any
// och varje update() blir "never".

type Table<Row, Insert, Update> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  // Kräver av supabase-js. Vi läser aldrig relaterade rader via inbäddade
  // frågor – orderraderna hämtas med ett eget anrop – så listan är tom.
  Relationships: [];
};

export type CustomerAccount = {
  id: string;
  kundnr: string;
  company_name: string;
  login_name: string;
  pin_hash: string;
  pin_salt: string;
  contact_email: string | null;
  /** Sådant innesälj måste veta vid varje order. Visas i adminvyn. */
  note: string | null;
  active: boolean;
  failed_count: number;
  locked_until: string | null;
  last_login_at: string | null;
  created_at: string;
}

export type Order = {
  id: string;
  account_id: string;
  order_number: string;
  reference: string;
  /** Kundens eget märke eller ordernummer. Frivilligt. */
  marking: string | null;
  /** Vald godsmottagare, kopierad vid beställning. */
  recipient_code: string | null;
  recipient_name: string | null;
  recipient_address: string | null;
  status: "utkast" | "mottagen" | "skickad" | "misslyckad";
  sent_at: string | null;
  email_to: string | null;
  xml: string | null;
  error: string | null;
  /** Satt när någon på Göhlins tagit hand om ordern. Null = ligger kvar. */
  handled_at: string | null;
  handled_by: string | null;
  created_at: string;
}

export type DeliveryRecipient = {
  id: string;
  account_id: string;
  /** Mot.nr i Monitor. */
  code: string;
  name: string;
  street: string;
  zip_city: string;
  active: boolean;
  sort_order: number;
  created_at: string;
}

export type StaffAccount = {
  id: string;
  login_name: string;
  name: string;
  pin_hash: string;
  pin_salt: string;
  active: boolean;
  failed_count: number;
  locked_until: string | null;
  last_login_at: string | null;
  created_at: string;
}

export type OrderLine = {
  id: string;
  order_id: string;
  article_number: string;
  article_name: string;
  unit: string;
  quantity: number;
  raw_scan: string | null;
  sort_order: number;
  created_at: string;
}

export type Article = {
  number: string;
  name: string;
  unit: string;
  lookup_key: string;
  active: boolean;
  updated_at: string;
}

/** Kolumner databasen fyller i själv (id, ordernummer, tidsstämplar). */
type Genererad = "id" | "created_at";

export type Database = {
  public: {
    Tables: {
      customer_accounts: Table<
        CustomerAccount,
        Omit<CustomerAccount, Genererad | "active" | "failed_count" | "locked_until" | "last_login_at" | "contact_email" | "note"> &
          Partial<CustomerAccount>,
        Partial<CustomerAccount>
      >;
      orders: Table<
        Order,
        Omit<
          Order,
          | Genererad
          | "order_number"
          | "marking"
          | "recipient_code"
          | "recipient_name"
          | "recipient_address"
          | "status"
          | "sent_at"
          | "email_to"
          | "xml"
          | "error"
          | "handled_at"
          | "handled_by"
        > &
          Partial<Order>,
        Partial<Order>
      >;
      order_lines: Table<
        OrderLine,
        Omit<OrderLine, Genererad | "article_name" | "unit" | "raw_scan" | "sort_order"> &
          Partial<OrderLine>,
        Partial<OrderLine>
      >;
      articles: Table<Article, Article, Partial<Article>>;
      delivery_recipients: Table<
        DeliveryRecipient,
        Omit<DeliveryRecipient, Genererad | "active" | "sort_order" | "street" | "zip_city"> &
          Partial<DeliveryRecipient>,
        Partial<DeliveryRecipient>
      >;
      staff_accounts: Table<
        StaffAccount,
        Omit<
          StaffAccount,
          Genererad | "active" | "failed_count" | "locked_until" | "last_login_at"
        > &
          Partial<StaffAccount>,
        Partial<StaffAccount>
      >;
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
}
