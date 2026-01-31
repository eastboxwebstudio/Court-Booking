interface Fetcher {
  fetch(request: Request): Promise<Response>;
}

export interface Env {
  ASSETS: Fetcher;
}

export default {
  async fetch(request: Request, env: Env) {
    // Since we are using Google Sheets as the backend, 
    // this Worker simply serves the frontend files.
    return env.ASSETS.fetch(request);
  },
};