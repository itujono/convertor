export type Variables = {
  user: {
    id: string;
    email: string;
    plan: string;
    conversionCount: number;
    lastReset: Date;
  };
};

export type UserData = {
  id: string;
  plan: string;
  conversion_count: number;
  last_reset: string;
};
