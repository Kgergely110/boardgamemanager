import axios from "axios";
import type { ApiErrorResponse } from "../types";

export const api = axios.create({ baseURL: "/api" });

const NETWORK_ERROR = "The library service could not be reached. Please try again.";
const UNKNOWN_ERROR = "Something went wrong. Please try again.";

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

function safeServerMessage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const message = value.trim();
  if (
    !message ||
    message.length > 240 ||
    /[\r\n]/.test(message) ||
    /\b(?:stack trace|node_modules|node:internal)\b|\bat\s+[\w$.]+(?:\s|\()/i.test(message) ||
    /^(?:[A-Za-z]*(?:Error|Exception)|PrismaClient\w*):/i.test(message) ||
    /(?:\/Users\/|\/app\/|\/usr\/|\/home\/|file:\/\/|webpack:\/\/)/i.test(message) ||
    /(?:\/|\\)[\w.-]+(?:\/|\\)[\w.-]+:\d+(?::\d+)?/.test(message)
  ) {
    return null;
  }
  return message;
}

export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError<ApiErrorResponse>(error)) {
    const serverMessage = safeServerMessage(error.response?.data?.error);
    if (serverMessage) return serverMessage;

    if (error.response?.status === 401) return "Your session has expired. Please sign in again.";
    if (error.response?.status === 404) return "The requested information could not be found.";
    if (error.response && error.response.status >= 500) {
      return "The library service encountered a problem. Please try again.";
    }
    if (error.response) return "The request could not be completed. Please try again.";
    return NETWORK_ERROR;
  }
  return UNKNOWN_ERROR;
}

export function isUnauthorizedError(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 401;
}
