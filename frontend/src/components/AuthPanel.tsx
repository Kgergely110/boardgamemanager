import { FormEvent, useState } from "react";
import { LibraryMark } from "./LibraryIcon";
import { api, getErrorMessage } from "../lib/api";
import { AuthResponse } from "../types";

interface AuthPanelProps {
  setupRequired: boolean;
  onAuthenticated: (result: AuthResponse) => void;
}

export function AuthPanel({ setupRequired, onAuthenticated }: AuthPanelProps) {
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const { data } = await api.post<AuthResponse>(
        setupRequired ? "/auth/setup" : "/auth/login",
        setupRequired ? { fullName, username, password } : { username, password },
      );
      onAuthenticated(data);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="entry-page">
      <div className="entry-art" aria-hidden="true">
        <LibraryMark className="entry-art__seal" />
        <div className="entry-art__shelf entry-art__shelf--one">
          <i /><i /><i /><i /><i /><i />
        </div>
        <div className="entry-art__shelf entry-art__shelf--two">
          <i /><i /><i /><i /><i />
        </div>
        <div className="entry-art__shelf entry-art__shelf--three">
          <i /><i /><i /><i /><i /><i /><i />
        </div>
        <p>Every game has a place.<br />Every night, a story.</p>
      </div>

      <section className="entry-card">
        <span className="eyebrow">THE BOARD GAME LIBRARY</span>
        <h1>{setupRequired ? "Make this place yours." : "Welcome back."}</h1>
        <p className="entry-copy">
          {setupRequired
            ? "Create the first keeper account to open your private collection."
            : "Sign in to return to your shelves and stories."}
        </p>

        <form className="entry-form" onSubmit={handleSubmit}>
          {setupRequired && (
            <label>
              Your name
              <input
                autoComplete="name"
                maxLength={80}
                onChange={(event) => setFullName(event.target.value)}
                required
                value={fullName}
              />
            </label>
          )}
          <label>
            Username
            <input
              autoComplete="username"
              maxLength={32}
              minLength={3}
              onChange={(event) => setUsername(event.target.value)}
              pattern="(?:[a-zA-Z0-9._]|-)+"
              required
              value={username}
            />
          </label>
          <label>
            Password
            <input
              autoComplete={setupRequired ? "new-password" : "current-password"}
              maxLength={128}
              minLength={8}
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
            {setupRequired && (
              <span className="field-note">Use at least 8 characters.</span>
            )}
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button--primary button--wide" disabled={submitting}>
            {submitting
              ? "Unlocking..."
              : setupRequired
                ? "Open the library"
                : "Enter the library"}
          </button>
        </form>

        <div className="entry-footnote">
          <span className="entry-footnote__rule" />
          <span>Private to your home network</span>
          <span className="entry-footnote__rule" />
        </div>
      </section>
    </main>
  );
}
