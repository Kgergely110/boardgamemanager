import axios from "axios";

export const api = axios.create({ baseURL: "/api" });

export function setAuthToken(token: string | null): void {
  if (token) {
    sessionStorage.setItem("library-token", token);
  } else {
    sessionStorage.removeItem("library-token");
  }
}

api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem("library-token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError<{ error?: string }>(error)) {
    return error.response?.data?.error ?? "The library service could not be reached.";
  }
  return error instanceof Error ? error.message : "Something unexpected happened.";
}
