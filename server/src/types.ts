export type AppEnv = {
  Variables: {
    user: any;
    userId: string;
    authKind: 'session' | 'api_token';
  };
};
