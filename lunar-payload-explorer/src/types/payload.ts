// Shape of public/data/payloads/NNN_<name>_payload.json. The article is open-ended on purpose:
// new sections appear in the data without a type change (DR-4).

export type Article = Record<string, unknown>;

export interface ImageItem {
  id?: string;
  description?: string;
  image_type?: string;
  image_url: string;
  source_page_url?: string;
  publisher?: string;
  credit?: string;
  caption?: string;
  notes?: string;
  section_placements?: string[];
}

export interface Reference {
  title?: string;
  publisher?: string;
  url: string;
}

export interface PayloadDetail {
  catalogue_id?: number;
  category?: { number: number; name: string };
  payload: {
    number: number;
    name: string;
    article: Article;
    research_status?: Record<string, unknown>;
  };
}
