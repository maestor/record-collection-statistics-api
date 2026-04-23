export interface DiscogsIdentity {
  id: number;
  username: string;
  resource_url: string;
  consumer_name: string;
}

export interface DiscogsCollectionField {
  id: number;
  name: string;
  type: string;
  position: number;
  public: boolean;
  options?: string[];
  lines?: number;
}

export interface DiscogsCollectionFieldValue {
  field_id: number | string;
  value: string;
}

export interface DiscogsBasicInformation {
  id: number;
  master_id?: number;
  master_url?: string;
  resource_url: string;
  thumb?: string;
  cover_image?: string;
  title: string;
  year?: number;
  formats?: Array<{
    name: string;
    qty?: string;
    text?: string;
    descriptions?: string[];
  }>;
  labels?: Array<{
    name: string;
    catno?: string;
    entity_type?: string;
    entity_type_name?: string;
    id?: number;
    resource_url?: string;
  }>;
  artists?: Array<{
    name: string;
    anv?: string;
    join?: string;
    role?: string;
    tracks?: string;
    id?: number;
    resource_url?: string;
  }>;
  genres?: string[];
  styles?: string[];
}

export interface DiscogsCollectionRelease {
  id: number;
  instance_id: number;
  folder_id: number;
  date_added: string;
  rating: number;
  basic_information: DiscogsBasicInformation;
  notes?: DiscogsCollectionFieldValue[];
}

export interface DiscogsCollectionReleasesPage {
  pagination: {
    page: number;
    pages: number;
    per_page: number;
    items: number;
  };
  releases: DiscogsCollectionRelease[];
}

export interface DiscogsCollectionFieldsResponse {
  fields: DiscogsCollectionField[];
}

export interface DiscogsReleaseArtist {
  name: string;
  anv?: string;
  join?: string;
  role?: string;
  tracks?: string;
  id?: number;
  resource_url?: string;
  thumbnail_url?: string;
}

export interface DiscogsReleaseLabel {
  name: string;
  catno?: string;
  entity_type?: string;
  entity_type_name?: string;
  id?: number;
  resource_url?: string;
  thumbnail_url?: string;
}

export interface DiscogsReleaseDetail {
  id: number;
  status?: string;
  year?: number;
  resource_url?: string;
  uri?: string;
  artists?: DiscogsReleaseArtist[];
  artists_sort?: string;
  labels?: DiscogsReleaseLabel[];
  formats?: Array<{
    name: string;
    qty?: string;
    text?: string;
    descriptions?: string[];
  }>;
  community?: {
    have?: number;
    want?: number;
    rating?: {
      count?: number;
      average?: number;
    };
    data_quality?: string;
  };
  master_id?: number;
  master_url?: string;
  title: string;
  country?: string;
  released?: string;
  data_quality?: string;
  identifiers?: Array<{
    type: string;
    value: string;
    description?: string;
  }>;
  videos?: Array<{
    uri: string;
    title: string;
    description?: string;
    duration?: number;
    embed?: boolean;
  }>;
  genres?: string[];
  styles?: string[];
  tracklist?: Array<{
    position?: string;
    type_?: string;
    title: string;
    duration?: string;
    extraartists?: DiscogsReleaseArtist[];
  }>;
  images?: Array<{
    type?: string;
    uri?: string;
    resource_url?: string;
    uri150?: string;
    width?: number;
    height?: number;
  }>;
  thumb?: string;
  lowest_price?: number;
  num_for_sale?: number;
}
